import { describe, expect, test } from 'bun:test';
import { createSchema } from 'zod-openapi';
import { booleanQuerySchema } from '../lib/api-docs';

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
