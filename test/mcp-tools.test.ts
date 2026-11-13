import { expect, test } from "bun:test";
import { Hono } from "hono";
import { describeRoute, generateSpecs } from "hono-openapi";
import { z } from "zod";
import { toToolDefinition } from "../lib/mcp/definitions";
import { getRegisteredTools, getToolPermissions, registerOperations, registerTool } from "../lib/mcp/tools";

const requires = (permissionId: string): Record<string, string[]>[] => [{ httpBasic: [permissionId] }, { jwt: [permissionId] }];

const api = new Hono();
api.get("/notes", describeRoute({ operationId: "listNotes", security: requires("notes.read") }), (c) => c.json([]));
api.post("/notes", describeRoute({ operationId: "createNote", security: requires("notes.write") }), (c) => c.json({}));
api.get("/directory", describeRoute({ operationId: "searchDirectory" }), (c) => c.json([]));
api.get(
  "/mixed",
  describeRoute({ operationId: "readMixed", security: [{ httpBasic: ["notes.read"] }, { jwt: ["notes.write"] }] }),
  (c) => c.json([])
);
registerOperations(() => generateSpecs(api));

// An operation without security requirements of its own has the document's
const inheriting = new Hono();
inheriting.get("/inherited", describeRoute({ operationId: "readInherited" }), (c) => c.json([]));
registerOperations(() => generateSpecs(inheriting, { documentation: { security: requires("notes.read") } }));

const notes = {
  annotations: { openWorldHint: false, readOnlyHint: true as const },
  description: "List the team's notes.",
  handler: async () => [],
  input: z.object({
    limit: z.number().int().optional().openapi({
      description: "How many notes to list.",
    }),
  }),
  operations: ["listNotes"] as [string, ...string[]],
  title: "List notes",
};

test("registers a tool once, and refuses a name that's taken, including by a built-in tool", () => {
  registerTool({ ...notes, name: "list_notes" });

  expect(getRegisteredTools().map((tool) => tool.name)).toContain("list_notes");
  expect(() => registerTool({ ...notes, name: "list_notes" })).toThrow("An MCP tool named list_notes is already registered");
  expect(() => registerTool({ ...notes, name: "list_teams" })).toThrow("An MCP tool named list_teams is already registered");
});

test("describes a tool with its annotations, and the `teamId` every tool takes", () => {
  const definition = toToolDefinition({ ...notes, name: "describe_notes" });

  expect(definition).toMatchObject({ annotations: notes.annotations, name: "describe_notes", title: "List notes" });
  expect(Object.keys(definition.inputSchema.properties ?? {})).toEqual(["limit", "teamId"]);
});

test("needs every permission its operations require, and none for open ones", async () => {
  expect(await getToolPermissions({ ...notes, name: "list_notes" })).toEqual(["notes.read"]);
  expect(await getToolPermissions({ ...notes, name: "copy_note", operations: ["createNote", "listNotes", "searchDirectory"] })).toEqual([
    "notes.read",
    "notes.write",
  ]);
  expect(await getToolPermissions({ ...notes, name: "find_people", operations: ["searchDirectory"] })).toEqual([]);
  expect(await getToolPermissions({ ...notes, name: "read_inherited", operations: ["readInherited"] })).toEqual(["notes.read"]);
});

test("refuses an operation no document describes, or one whose security schemes disagree", async () => {
  await expect(getToolPermissions({ ...notes, name: "archive_notes", operations: ["archiveNotes"] })).rejects.toThrow(
    "MCP tool archive_notes names operation archiveNotes, which no OpenAPI document describes"
  );
  await expect(getToolPermissions({ ...notes, name: "read_mixed", operations: ["readMixed"] })).rejects.toThrow(
    "Operation readMixed requires different permissions per security scheme"
  );
});
