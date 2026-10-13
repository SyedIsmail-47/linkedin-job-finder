import { describe, expect, it } from 'vitest';
import { htmlToText, looksBlocked, parseJobDetail, parseSearchCards, resolveExternalApply } from '../src/parse.js';
import { fixture } from './helpers.js';

describe('parseSearchCards', () => {
  const cards = parseSearchCards(fixture('search-page.html'));
  it('returns each job once even if the page repeats a card', () => {
    expect(cards.map((c) => c.id)).toEqual(['1000000001', '1000000002', '1000000003', '1000000004']);
  });
  it('extracts card fields and a clean canonical URL', () => {
    expect(cards[0]).toMatchObject({
      id: '1000000001',
      url: 'https://www.linkedin.com/jobs/view/1000000001',
      title: 'Senior Data Engineer',
      company: 'Acme Analytics',
      companyUrl: 'https://www.linkedin.com/company/acme-analytics',
      location: 'Berlin, Berlin, Germany',
      postedAt: '2026-10-11',
      postedAtText: '2 days ago',
      salaryText: '€70,000.00 - €90,000.00',
    });
  });
  it('tolerates missing optional parts', () => {
    expect(cards[1]?.salaryText).toBeNull();
  });
  it('returns an empty list for an empty page', () => {
    expect(parseSearchCards('')).toEqual([]);
  });
});

describe('parseJobDetail', () => {
  it('resolves an external apply link out of the LinkedIn redirect', () => {
    const d = parseJobDetail(fixture('detail-1000000001.html'), 'https://www.linkedin.com/jobs/view/1000000001');
    expect(d.applyType).toBe('EXTERNAL');
    expect(d.applyUrl).toBe('https://careers.acme-analytics.example/jobs/42?src=linkedin');
    expect(d.title).toBe('Senior Data Engineer');
    expect(d.company).toBe('Acme Analytics');
    expect(d.companyUrl).toBe('https://www.linkedin.com/company/acme-analytics');
    expect(d.location).toBe('Berlin, Berlin, Germany');
    expect(d.applicantsText).toBe('Over 200 applicants');
    expect(d.salaryText).toBe('€70,000 - €90,000 / year');
    expect(d.seniorityLevel).toBe('Mid-Senior level');
    expect(d.employmentType).toBe('Full-time');
    expect(d.jobFunction).toBe('Engineering and Information Technology');
    expect(d.industries).toBe('Software Development');
    expect(d.description).toContain('• 5+ years of experience in data engineering');
  });

  it('detects Easy Apply and falls back to the job URL', () => {
    const d = parseJobDetail(fixture('detail-1000000002.html'), 'https://www.linkedin.com/jobs/view/1000000002');
    expect(d.applyType).toBe('EASY_APPLY');
    expect(d.applyUrl).toBe('https://www.linkedin.com/jobs/view/1000000002');
  });

  it('reports UNKNOWN when no apply signal exists', () => {
    const d = parseJobDetail(fixture('detail-1000000003.html'), 'https://www.linkedin.com/jobs/view/1000000003');
    expect(d.applyType).toBe('UNKNOWN');
    expect(d.applyUrl).toBe('https://www.linkedin.com/jobs/view/1000000003');
  });

  it('marks EXTERNAL when guest HTML gates the offsite URL behind sign-in', () => {
    const html = `
      <h2 class="top-card-layout__title">Engineer</h2>
      <button class="top-card-layout__cta" data-modal="job-details-topcard-apply-modal">Apply
        <icon data-svg-class-name="apply-button__offsite-apply-icon-svg"></icon>
      </button>
      <div class="contextual-sign-in-modal" data-impression-id="public_jobs_apply-link-offsite_contextual-sign-in-modal"></div>
      <div class="show-more-less-html__markup"><p>Build things</p></div>`;
    const d = parseJobDetail(html, 'https://www.linkedin.com/jobs/view/999');
    expect(d.applyType).toBe('EXTERNAL');
    expect(d.applyUrl).toBe('https://www.linkedin.com/jobs/view/999');
    expect(d.title).toBe('Engineer');
  });

  it('does not throw on garbage input', () => {
    const d = parseJobDetail('<html><body>nothing here</body></html>', 'https://x/y');
    expect(d.title).toBeNull();
    expect(d.description).toBeNull();
  });
});

describe('resolveExternalApply', () => {
  it('unwraps LinkedIn redirects and keeps direct employer links', () => {
    expect(resolveExternalApply('https://www.linkedin.com/jobs/view/externalApply/1?url=https%3A%2F%2Fa.example%2Fj%3Fid%3D1&amp;urlHash=z')).toBe('https://a.example/j?id=1');
    expect(resolveExternalApply('"https://careers.example.com/apply/9"')).toBe('https://careers.example.com/apply/9');
  });
  it('rejects LinkedIn-internal and non-http links', () => {
    expect(resolveExternalApply('https://www.linkedin.com/signup/cold-join')).toBeNull();
    expect(resolveExternalApply('javascript:alert(1)')).toBeNull();
    expect(resolveExternalApply('not a url')).toBeNull();
  });
});

describe('looksBlocked / htmlToText', () => {
  it('flags an auth wall but not job content or an empty page', () => {
    expect(looksBlocked(fixture('blocked-authwall.html'))).toBe(true);
    expect(looksBlocked(fixture('search-page.html'))).toBe(false);
    expect(looksBlocked('')).toBe(false);
  });
  it('converts HTML to readable text with bullets', () => {
    expect(htmlToText('<p>Hi</p><ul><li>One</li><li>Two</li></ul>')).toBe('Hi\n• One\n• Two');
  });
});
