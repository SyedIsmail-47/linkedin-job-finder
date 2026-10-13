import { describe, expect, it } from 'vitest';
import { normalizeInput } from '../src/input.js';
import { buildDetailUrl, buildQueries, buildSearchUrl, canonicalJobUrl } from '../src/urls.js';

describe('urls', () => {
  it('builds a search URL with every filter', () => {
    const i = normalizeInput({
      keywords: ['data engineer'],
      locations: ['Berlin'],
      datePosted: '24h',
      workTypes: ['remote', 'hybrid'],
      jobTypes: ['full-time', 'contract'],
      experienceLevels: ['mid-senior'],
      easyApplyOnly: true,
      sortBy: 'recent',
    });
    const u = new URL(buildSearchUrl({ keywords: 'data engineer', location: 'Berlin' }, i, 25));
    expect(u.pathname).toBe('/jobs-guest/jobs/api/seeMoreJobPostings/search');
    expect(u.searchParams.get('keywords')).toBe('data engineer');
    expect(u.searchParams.get('location')).toBe('Berlin');
    expect(u.searchParams.get('start')).toBe('25');
    expect(u.searchParams.get('f_TPR')).toBe('r86400');
    expect(u.searchParams.get('f_WT')).toBe('2,3');
    expect(u.searchParams.get('f_JT')).toBe('F,C');
    expect(u.searchParams.get('f_E')).toBe('4');
    expect(u.searchParams.get('f_AL')).toBe('true');
    expect(u.searchParams.get('sortBy')).toBe('DD');
  });

  it('omits optional filters when unused', () => {
    const i = normalizeInput({ keywords: ['x'], datePosted: 'any', sortBy: 'relevant' });
    const u = new URL(buildSearchUrl({ keywords: 'x', location: 'US' }, i, 0));
    expect(u.searchParams.has('f_TPR')).toBe(false);
    expect(u.searchParams.has('f_WT')).toBe(false);
    expect(u.searchParams.get('sortBy')).toBe('R');
  });

  it('builds detail and canonical URLs and the keyword x location product', () => {
    expect(buildDetailUrl('123')).toContain('/jobs-guest/jobs/api/jobPosting/123');
    expect(canonicalJobUrl('123')).toBe('https://www.linkedin.com/jobs/view/123');
    expect(buildQueries({ keywords: ['a', 'b'], locations: ['x', 'y'] })).toHaveLength(4);
  });
});
