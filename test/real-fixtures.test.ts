import { describe, expect, it } from 'vitest';
import { parseJobDetail, parseSearchCards } from '../src/parse.js';
import { fixture } from './helpers.js';

describe('real fixtures (shape only)', () => {
  it('parses numeric ids and non-empty titles from real search HTML', () => {
    const cards = parseSearchCards(fixture('real-search-page.html'));
    expect(cards.length).toBeGreaterThanOrEqual(1);
    for (const c of cards) {
      expect(c.id).toMatch(/^\d{6,}$/);
      expect(c.title && c.title.length > 0).toBe(true);
      expect(c.url).toMatch(/^https:\/\/www\.linkedin\.com\/jobs\/view\/\d+/);
    }
  });

  it('parses a real detail page with title and http apply URL', () => {
    const cards = parseSearchCards(fixture('real-search-page.html'));
    const id = cards[0]?.id ?? '0';
    const d = parseJobDetail(fixture('real-detail-1.html'), `https://www.linkedin.com/jobs/view/${id}`);
    expect(d.title && d.title.length > 0).toBe(true);
    expect(d.applyUrl).toMatch(/^https?:\/\//);
    expect(d.description && d.description.length > 0).toBe(true);
  });
});
