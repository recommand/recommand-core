import type { Team } from "@core/data/teams";
import type { AuthenticatedUserContext } from "@core/lib/auth-middleware";
import { LIST_TEAMS_TOOL } from "@core/lib/mcp/definitions";
import type { Context } from "hono";
import type { generateSpecs } from "hono-openapi";
import type { z } from "zod";

/**
 * What a tool does, as clients show it and decide whether to ask before calling it.
 * Every tool states it: a client assumes the worst of a tool that doesn't, so one
 * left out would be treated as destructive.
 *
 * @see https://modelcontextprotocol.io/specification/2026-07-28/schema#toolannotations
 */
export type McpToolAnnotations =
  | { openWorldHint: boolean; readOnlyHint: true }
  | { destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean; readOnlyHint: false };

/**
 * The team a tool call acts in, and the request to the MCP server it came with, for a tool that
 * acts as that request's credential, such as one that sends a document and audits it.
 */
export type McpToolContext = {
  request: Context<AuthenticatedUserContext>;
  team: Team;
};

export type McpTool<Input extends z.AnyZodObject = z.AnyZodObject> = {
  annotations: McpToolAnnotations;
  /** What the tool is for and when to use it, as the model reads it to choose a tool. */
  description: string;
  /** Returns what the model reads; throw `McpToolError` for a failure the model can act on. */
  handler: (context: McpToolContext, input: z.infer<Input>) => Promise<unknown>;
  /** What the tool takes. The team it acts in is added to it, so it doesn't name one. */
  input: Input;
  /** Unique across packages, and named after what it does for the user, such as `search_documents`. */
  name: string;
  /**
   * The `operationId`s of the API operations whose work the tool does. A call needs every permission
   * their `security` lists, so the tool can't ask for less than the API does; none if they need none,
   * such as the Peppol directory, which every member reaches.
   */
  operations: [string, ...string[]];
  /** A short, human-readable name. */
  title: string;
};

/** A failure the model can act on, such as a document that doesn't exist; its message is shown as it is. */
export class McpToolError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message);
    this.name = "McpToolError";
  }
}

type OpenApiDocument = Awaited<ReturnType<typeof generateSpecs>>;

type Operation = { operationId?: string; security?: Record<string, string[]>[] };

const registeredTools = new Map<string, McpTool>();
const operationSources: (() => Promise<OpenApiDocument>)[] = [];

export const getRegisteredTools = (): McpTool[] => [...registeredTools.values()];

/** Makes a tool available on the MCP server, as a package does in its `init`. */
export const registerTool = <Input extends z.AnyZodObject>(tool: McpTool<Input>) => {
  if (tool.name === LIST_TEAMS_TOOL || registeredTools.has(tool.name)) {
    throw new Error(`An MCP tool named ${tool.name} is already registered`);
  }

  registeredTools.set(tool.name, tool as unknown as McpTool);
};

/** Makes the operations of an OpenAPI document available for tools to name, as a package that serves one does. */
export const registerOperations = (loadDocument: () => Promise<OpenApiDocument>) => {
  operationSources.push(loadDocument);
};

/** The permissions an operation's security requirements list, which have to agree; none if it needs none. */
const operationPermissions = ({ operationId, security = [] }: Operation) => {
  const [first = [], ...others] = security.map((requirement) => [...new Set(Object.values(requirement).flat())].toSorted());
  if (others.some((permissionIds) => permissionIds.join() !== first.join())) {
    throw new Error(`Operation ${operationId} requires different permissions per security scheme`);
  }

  return first;
};

const loadOperations = async () => {
  const documents = await Promise.all(operationSources.map((loadDocument) => loadDocument()));

  return new Map(
    documents
      .flatMap(({ paths = {}, security }) =>
        Object.values(paths)
          .flatMap((pathItem): unknown[] => Object.values(pathItem ?? {}))
          .filter((operation): operation is Operation & { operationId: string } =>
            typeof (operation as Operation | undefined)?.operationId === "string"
          )
          // An operation without security requirements of its own has the document's (OpenAPI 3.1, Operation Object)
          // https://spec.openapis.org/oas/v3.1.1.html#operation-object
          .map((operation) => ({ ...operation, security: operation.security ?? security }))
      )
      .map((operation) => [operation.operationId, operation])
  );
};

let operations: Promise<Map<string, Operation>> | undefined;

/**
 * The permissions a call of the tool needs: every one its operations require. The operations are read once,
 * since the routes don't change while the server runs. Throws for an operation no document describes.
 */
export const getToolPermissions = async (tool: McpTool) => {
  operations ??= loadOperations().catch((error) => {
    operations = undefined;
    throw error;
  });
  const operationsById = await operations;
  const permissionIds = tool.operations.flatMap((operationId) => {
    const operation = operationsById.get(operationId);
    if (!operation) {
      throw new Error(`MCP tool ${tool.name} names operation ${operationId}, which no OpenAPI document describes`);
    }

    return operationPermissions(operation);
  });

  return [...new Set(permissionIds)].toSorted();
};
