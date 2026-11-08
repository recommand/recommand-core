import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { describeRoute, generateSpecs } from 'hono-openapi';
import z from 'zod';
import { createSchema } from 'zod-openapi';
import { booleanQuerySchema, describeSuccessResponse } from '../lib/api-docs';

describe('booleanQuerySchema', () => {
  test('reads `true` and `false` as the booleans they spell', () => {
    expect(booleanQuerySchema.parse('true')).toBe(true);
    expect(booleanQuerySchema.parse('false')).toBe(false);
  });

  test('rejects any other text', () => {
    ['', '1', 'TRUE', 'yes'].forEach((value) => {
      expect(booleanQuerySchema.safeParse(value).success).toBe(false);
    });
  });

  test('is declared a boolean in the OpenAPI document', () => {
    expect(createSchema(booleanQuerySchema, { schemaType: 'input' }).schema).toEqual({
      type: 'boolean',
    });
  });
});

describe('describeSuccessResponse', () => {
  test("describes the response body with the body schema's description", async () => {
    const app = new Hono().get(
      '/',
      describeRoute({
        responses: describeSuccessResponse(
          'The note',
          z.object({ title: z.string() }).openapi({ description: 'A note and its title.' }),
        ),
      }),
      (c) => c.json({ success: true, title: 'Groceries' }),
    );

    const document = await generateSpecs(app);

    expect(document.paths['/']?.get?.responses?.[200]).toMatchObject({
      content: { 'application/json': { schema: { description: 'A note and its title.' } } },
    });
  });
});
