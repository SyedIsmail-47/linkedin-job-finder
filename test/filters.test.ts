import { describe, expect, it } from 'vitest';
import { passesFilters } from '../src/filters.js';

const none = { titleInclude: [], titleExclude: [], companyExclude: [] };

describe('passesFilters', () => {
  const card = { title: 'Senior Data Engineer', company: 'Acme Analytics' };
  it('passes everything with no filters', () => {
    expect(passesFilters(card, none)).toBe(true);
  });
  it('requires at least one titleInclude term (case-insensitive)', () => {
    expect(passesFilters(card, { ...none, titleInclude: ['DATA'] })).toBe(true);
    expect(passesFilters(card, { ...none, titleInclude: ['marketing'] })).toBe(false);
  });
  it('rejects titleExclude and companyExclude hits', () => {
    expect(passesFilters(card, { ...none, titleExclude: ['senior'] })).toBe(false);
    expect(passesFilters(card, { ...none, companyExclude: ['acme'] })).toBe(false);
  });
  it('treats a missing title as empty', () => {
    expect(passesFilters({ title: null, company: null }, { ...none, titleInclude: ['x'] })).toBe(false);
  });
});
