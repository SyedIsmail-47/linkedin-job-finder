import { describe, expect, it } from 'vitest';
import { applyOutputOptions, buildItem } from '../src/item.js';
import { parseJobDetail, parseSearchCards } from '../src/parse.js';
import { fixture } from './helpers.js';

const cards = parseSearchCards(fixture('search-page.html'));
const q = { keywords: 'data engineer', location: 'Berlin' };
const detail = (id: string) => parseJobDetail(fixture(`detail-${id}.html`), `https://www.linkedin.com/jobs/view/${id}`);

describe('buildItem', () => {
  it('merges card and detail into a complete record', () => {
    const item = buildItem(cards[0]!, detail('1000000001'), q, '2026-10-13T00:00:00.000Z');
    expect(item).toMatchObject({
      id: '1000000001',
      applyType: 'EXTERNAL',
      applyUrl: 'https://careers.acme-analytics.example/jobs/42?src=linkedin',
      requirementsSource: 'section',
      minYearsExperience: 5,
      detailsFetched: true,
      searchKeyword: 'data engineer',
      scrapedAt: '2026-10-13T00:00:00.000Z',
    });
    expect(item.skills).toEqual(expect.arrayContaining(['Python', 'SQL', 'Airflow', 'Snowflake', 'AWS']));
    expect(item.requirements).toHaveLength(4);
    expect(item.seniorityLevel).toBe('Mid-Senior level');
  });

  it('works without details (card-only mode)', () => {
    const item = buildItem(cards[2]!, null, q, 'now');
    expect(item.detailsFetched).toBe(false);
    expect(item.applyType).toBe('UNKNOWN');
    expect(item.applyUrl).toBe(item.url);
    expect(item.requirements).toEqual([]);
    expect(item.description).toBeNull();
  });

  it('detects remote from the title/location', () => {
    expect(buildItem(cards[1]!, detail('1000000002'), q, 'now').workplaceType).toBe('remote');
    expect(buildItem(cards[2]!, null, q, 'now').workplaceType).toBeNull();
  });
});

describe('applyOutputOptions', () => {
  const item = buildItem(cards[2]!, null, q, 'now');
  it('compact mode drops heavy fields', () => {
    const out = applyOutputOptions(item, { compact: true, excludeEmptyFields: false });
    expect(Object.keys(out)).not.toContain('description');
    expect(out).toHaveProperty('applyUrl');
    expect(out).toHaveProperty('requirements');
  });
  it('excludeEmptyFields strips null, empty string and empty arrays', () => {
    const out = applyOutputOptions(item, { compact: false, excludeEmptyFields: true });
    expect(out).not.toHaveProperty('description');
    expect(out).not.toHaveProperty('requirements');
    expect(out).toHaveProperty('title', 'Marketing Manager');
  });
  it('leaves the item untouched by default', () => {
    expect(applyOutputOptions(item, { compact: false, excludeEmptyFields: false })).toEqual(item);
  });
});
