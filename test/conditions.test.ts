import { describe, expect, test } from 'bun:test';
import { matchesValues } from '../lib/rules/conditions';
import { versionedConditionSchema } from '../lib/rules/types';

const source = { payload: { amount: '2500.00', count: 3, dueDate: '2026-11-11', name: 'ACME' } };

function matches(match: Record<string, Record<string, unknown>>) {
  return matchesValues(versionedConditionSchema.parse({ version: 1, match }), source);
}

describe('ordering operators', () => {
  test('compare numbers and numeric strings as numbers', () => {
    expect(matches({ 'payload.amount': { lte: 2500 } })).toBe(true);
    expect(matches({ 'payload.amount': { lt: 2500 } })).toBe(false);
    expect(matches({ 'payload.count': { gte: 3, lt: 4 } })).toBe(true);
    expect(matches({ 'payload.count': { gt: 3 } })).toBe(false);
  });

  test('compare ISO dates as points in time', () => {
    expect(matches({ 'payload.dueDate': { gt: '2026-11-10' } })).toBe(true);
    expect(matches({ 'payload.dueDate': { lte: '2026-11-10' } })).toBe(false);
  });

  test('free text never compares as a date', () => {
    const text = { payload: { note: 'Order 2024' } };
    const match = (operators: Record<string, unknown>) =>
      matchesValues(
        versionedConditionSchema.parse({ version: 1, match: { 'payload.note': operators } }),
        text,
      );
    expect(match({ gt: '2000-01-01' })).toBe(false);
    expect(match({ lt: '2100-01-01' })).toBe(false);
  });

  test('date and time values compare as points in time', () => {
    expect(matches({ 'payload.dueDate': { lt: '2026-11-11T10:00:00Z' } })).toBe(true);
  });

  test('never match a value that is not a number or a date', () => {
    expect(matches({ 'payload.name': { gt: 1 } })).toBe(false);
    expect(matches({ 'payload.missing': { lt: 10 } })).toBe(false);
  });

  test('the schema accepts a condition with only an ordering operator', () => {
    expect(
      versionedConditionSchema.safeParse({ version: 1, match: { a: { gte: 1 } } }).success,
    ).toBe(true);
  });
});
