import type { McpTool } from "@core/lib/mcp/tools";
import type { Tool } from "@modelcontextprotocol/server";
import { z } from "zod";
import { createSchema } from "zod-openapi";
import "zod-openapi/extend";

export const LIST_TEAMS_TOOL = "list_teams";

export const teamIdInput = z.object({
  teamId: z.string().optional().openapi({
    description: `The team to act in, as ${LIST_TEAMS_TOOL} lists it. Leave it out when the connection reaches one team.`,
  }),
});

export const listTeamsTool: Tool = {
  annotations: { openWorldHint: false, readOnlyHint: true },
  description: "List the teams this connection can act in, with their IDs. Use it to find the `teamId` the other tools take.",
  inputSchema: { properties: {}, type: "object" },
  name: LIST_TEAMS_TOOL,
  title: "List teams",
};

/** A tool's input as JSON Schema, with its referenced schemas inlined as `$defs`. */
const toInputSchema = (input: z.AnyZodObject): Tool["inputSchema"] => {
  const { components, schema } = createSchema(input.merge(teamIdInput), {
    componentRefPath: "#/$defs/",
    schemaType: "input",
  });

  return { ...schema, ...(components ? { $defs: components } : {}) } as Tool["inputSchema"];
};

export const toToolDefinition = (tool: McpTool): Tool => ({
  annotations: tool.annotations,
  description: tool.description,
  inputSchema: toInputSchema(tool.input),
  name: tool.name,
  title: tool.title,
});
