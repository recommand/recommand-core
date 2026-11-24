import { hasPrincipalPermission, listPrincipalTeamPermissionIds } from "@core/data/principal-permissions";
import { getTeam } from "@core/data/teams";
import { audit } from "@core/lib/audit";
import type { AuthenticatedUserContext } from "@core/lib/auth-middleware";
import { checkTeamAccess, listReachableTeamIds } from "@core/lib/auth-middleware";
import { LIST_TEAMS_TOOL, listTeamsTool, teamIdInput, toToolDefinition } from "@core/lib/mcp/definitions";
import type { McpTool } from "@core/lib/mcp/tools";
import { getRegisteredTools, getToolPermissions, McpToolError } from "@core/lib/mcp/tools";
import { requestPrincipal } from "@core/lib/permissions/permission-middleware";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { ProtocolError, ProtocolErrorCode, Server } from "@modelcontextprotocol/server";
import type { Context } from "hono";
import { z } from "zod";

/**
 * The most a tool hands back, in characters of JSON: about 12_500 tokens. A bigger
 * result fills the model's context, so the model is asked to narrow it instead.
 */
export const MAX_RESULT_LENGTH = 50_000;

type RequestContext = Context<AuthenticatedUserContext>;

const INSTRUCTIONS = `Every tool acts in one team. Call ${LIST_TEAMS_TOOL} to see the teams this connection reaches, and pass a team's \`id\` as \`teamId\` when there's more than one.`;

const failure = (message: string, details: Record<string, unknown> = {}): CallToolResult => {
  const error = { message, ...details };

  return { content: [{ text: JSON.stringify(error), type: "text" }], isError: true, structuredContent: error };
};

/** What a handler returned, as compact JSON, unless it's too large to hand back. */
const success = (value: unknown): CallToolResult => {
  const text = JSON.stringify(value ?? { done: true });
  if (text.length > MAX_RESULT_LENGTH) {
    return failure(
      `The result is ${text.length} characters, more than the ${MAX_RESULT_LENGTH} a tool hands back. Narrow it down, such as with a smaller \`limit\` or more filters.`,
      { code: "result_too_large" }
    );
  }

  const structured = !!value && typeof value === "object" && !Array.isArray(value);

  return {
    content: [{ text, type: "text" }],
    ...(structured ? { structuredContent: value as Record<string, unknown> } : {}),
  };
};

/**
 * Models often send an empty string for an optional field rather than leaving it
 * out. It's dropped, so it counts as not given rather than as an invalid value.
 */
export const withoutEmptyStrings = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(withoutEmptyStrings);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== "")
        .map(([key, entry]) => [key, withoutEmptyStrings(entry)])
    );
  }

  return value;
};

/**
 * Answers a request, or a generic internal error when it fails unexpectedly, such
 * as a database error in the access checks: its message isn't the client's to read.
 */
const answer = async <Result>(method: string, handle: () => Promise<Result>): Promise<Result> => {
  try {
    return await handle();
  } catch (error) {
    if (error instanceof ProtocolError) {
      throw error;
    }

    console.error(`MCP ${method} failed`, error);
    throw new ProtocolError(ProtocolErrorCode.InternalError, "Internal error");
  }
};

const withoutWrappers = (schema: z.ZodTypeAny): z.ZodTypeAny =>
  schema instanceof z.ZodOptional || schema instanceof z.ZodNullable
    ? withoutWrappers(schema.unwrap())
    : schema instanceof z.ZodDefault
      ? withoutWrappers(schema.removeDefault())
      : schema;

/**
 * Models often send a number or a boolean as a string, such as `"5"` for a
 * `limit` or `"true"` for a flag. Where the input takes a number or a boolean, a
 * string holding one counts as that value; the input schema tools advertise
 * still says it's a number or a boolean.
 */
export const withScalarsFromStrings = (schema: z.ZodTypeAny, value: unknown): unknown => {
  const inner = withoutWrappers(schema);
  if (inner instanceof z.ZodNumber && typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }

  if (inner instanceof z.ZodBoolean && (value === "true" || value === "false")) {
    return value === "true";
  }

  if (inner instanceof z.ZodArray && Array.isArray(value)) {
    return value.map((item) => withScalarsFromStrings(inner.element, item));
  }

  if (inner instanceof z.ZodObject && value && typeof value === "object" && !Array.isArray(value)) {
    const shape: z.ZodRawShape = inner.shape;

    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, shape[key] ? withScalarsFromStrings(shape[key], entry) : entry])
    );
  }

  return value;
};

/** The permissions the request's credential lacks in the team, of the ones given. */
const missingPermissions = async (c: RequestContext, teamId: string, permissionIds: string[]) => {
  const user: { id: string; isAdmin: boolean } | undefined = c.get("user");
  const held = await Promise.all(
    permissionIds.map(
      async (permissionId) => (user ? await hasPrincipalPermission(requestPrincipal(c, user, teamId), teamId, permissionId) : false)
    )
  );

  return permissionIds.filter((_, index) => !held[index]);
};

const permissionList = new Intl.ListFormat("en", { type: "conjunction" });

const denied = async (c: RequestContext, tool: McpTool, reasonCode: string, teamId: string, teamReached: boolean) => {
  await audit(c, {
    action: "authorize",
    metadata: { requestedTeamId: teamId },
    objectId: tool.name,
    objectType: "core.mcp_tool",
    outcome: "denied",
    reasonCode,
    subsystem: "core.mcp",
    // Only a team the credential reaches, so a call can't write into another team's audit log
    ...(teamReached ? { teamId } : {}),
  });
};

const callTool = async (c: RequestContext, tool: McpTool, teamIds: string[], args: unknown): Promise<CallToolResult> => {
  const schema = tool.input.merge(teamIdInput);
  const parsed = schema.safeParse(withScalarsFromStrings(schema, withoutEmptyStrings(args ?? {})));
  if (!parsed.success) {
    return failure("The input doesn't match the tool's input schema.", {
      code: "invalid_input",
      issues: parsed.error.issues.map(({ message, path }) => ({ message, path: path.join(".") })),
    });
  }

  const { teamId: requestedTeamId, ...input } = parsed.data as { teamId?: string } & Record<string, unknown>;

  const teamId = requestedTeamId ?? (teamIds.length === 1 ? teamIds[0] : undefined);
  if (!teamId) {
    return teamIds.length === 0
      ? failure("This connection doesn't reach any team, so there's none to act in.", { code: "team_not_reachable" })
      : failure(`This connection reaches several teams, so the call has to name one as \`teamId\`. ${LIST_TEAMS_TOOL} lists them.`, {
          code: "team_required",
        });
  }

  const access = await checkTeamAccess(c, teamId);
  if (!access.allowed) {
    await denied(c, tool, access.reason, teamId, false);

    return failure(`This connection can't act in team ${teamId}. ${LIST_TEAMS_TOOL} lists the teams it can.`, { code: "team_not_reachable" });
  }

  const missing = await missingPermissions(c, teamId, await getToolPermissions(tool));
  if (missing.length > 0) {
    await denied(c, tool, "missing_permission", teamId, true);

    return failure(
      `This connection lacks the ${permissionList.format(missing)} permission${missing.length > 1 ? "s" : ""} in team ${teamId}.`,
      { code: "insufficient_permission" }
    );
  }

  const team = await getTeam(teamId);
  if (!team) {
    return failure(`Team ${teamId} doesn't exist.`, { code: "team_not_found" });
  }

  try {
    return success(await tool.handler({ team }, input));
  } catch (error) {
    if (error instanceof McpToolError) {
      return failure(error.message, error.code ? { code: error.code } : {});
    }

    console.error(`MCP tool ${tool.name} failed`, error);

    return failure(`${tool.name} failed unexpectedly. Try again later.`, { code: "internal_error" });
  }
};

/**
 * An MCP server for one request, made for its credential: it lists the tools
 * whose permissions the credential holds in one of its teams, and checks the
 * team and the permissions again on every call.
 */
export const createRequestServer = (c: RequestContext) => {
  const server = new Server(
    { name: "Recommand", version: "1.0.0" },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS }
  );

  server.onerror = (error) => {
    console.error("MCP server error", error);
  };

  server.setRequestHandler("tools/list", () =>
    answer("tools/list", async () => {
      const teamIds = await listReachableTeamIds(c);
      const user: { id: string; isAdmin: boolean } | undefined = c.get("user");
      // Each team's permissions are loaded once, rather than once for every tool
      const permissionIds = user
        ? await Promise.all(teamIds.map((teamId) => listPrincipalTeamPermissionIds(requestPrincipal(c, user, teamId), teamId)))
        : [];
      const heldByTeam = teamIds.map((_, index) => new Set(permissionIds[index]));
      const tools = getRegisteredTools();
      // A tool whose permissions can't be worked out is left out, rather than failing the whole list
      const toolPermissions = await Promise.all(
        tools.map((tool) =>
          getToolPermissions(tool).catch((error) => {
            console.error(`MCP tool ${tool.name} left out of tools/list`, error);

            return null;
          })
        )
      );
      // A tool needing several permissions is only of use in a team that holds them all
      const listed = tools.filter((_, index) => {
        const permissionIds = toolPermissions[index];

        return permissionIds ? heldByTeam.some((held) => permissionIds.every((permissionId) => held.has(permissionId))) : false;
      });

      return { tools: [listTeamsTool, ...listed.map(toToolDefinition)] };
    })
  );

  server.setRequestHandler("tools/call", (request) =>
    answer("tools/call", async () => {
      const { arguments: args, name } = request.params;
      const teamIds = await listReachableTeamIds(c);
      if (name === LIST_TEAMS_TOOL) {
        const teams = await Promise.all(teamIds.map(getTeam));

        return success({ teams: teams.filter((team) => !!team).map((team) => ({ id: team.id, name: team.name })) });
      }

      const tool = getRegisteredTools().find((registered) => registered.name === name);
      if (!tool) {
        throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Unknown tool: ${name}`);
      }

      return callTool(c, tool, teamIds, args);
    })
  );

  return server;
};
