import { describe, expect, it } from 'vitest';
import { parseJobDetail } from '../src/parse.js';
import { extractMinYears, extractRequirements, extractSkills, isRequirementsHeading } from '../src/requirements.js';
import { fixture } from './helpers.js';

const html = (n: string): string | null =>
  parseJobDetail(fixture(`detail-${n}.html`), `https://www.linkedin.com/jobs/view/${n}`).descriptionHtml;

describe('extractRequirements', () => {
  it('takes bullets under a Requirements heading and stops at the next heading', () => {
    const r = extractRequirements(html('1000000001'));
    expect(r.source).toBe('section');
    expect(r.items).toEqual([
      '5+ years of experience in data engineering',
      'Strong Python and SQL skills',
      'Experience with Airflow, Snowflake and AWS',
      "Bachelor's degree in computer science or related field",
    ]);
  });

  it('understands a plain "Requirements:" heading', () => {
    const r = extractRequirements(html('1000000002'));
    expect(r.source).toBe('section');
    expect(r.items).toHaveLength(3);
    expect(r.items[0]).toContain('3-5 years');
  });

  it('falls back to requirement-looking bullets when there is no heading', () => {
    const r = extractRequirements(html('1000000003'));
    expect(r.source).toBe('heuristic');
    expect(r.items.some((i) => i.includes('7+ years'))).toBe(true);
    expect(r.items.some((i) => i.includes('Plan and launch campaigns'))).toBe(false);
  });

  it('handles empty input', () => {
    expect(extractRequirements(null)).toEqual({ items: [], source: 'none' });
    expect(extractRequirements('<p>No lists here.</p>')).toEqual({ items: [], source: 'none' });
  });

  it('recognises common heading variants', () => {
    for (const h of ['Requirements', 'Minimum Qualifications:', "What you'll need", 'Skills & Experience', 'Must-haves', 'Who you are']) {
      expect(isRequirementsHeading(h)).toBe(true);
    }
    for (const h of ['Benefits', 'Responsibilities', 'Preferred Qualifications', 'About us']) {
      expect(isRequirementsHeading(h)).toBe(false);
    }
  });
});

describe('extractSkills', () => {
  it('finds known skills without false positives from plain words', () => {
    const s = extractSkills('We use Python, SQL, Airflow, Snowflake, AWS and CI/CD. Java but not JavaScript? Also Node.js and C++.');
    expect(s).toEqual(expect.arrayContaining(['Python', 'SQL', 'Airflow', 'Snowflake', 'AWS', 'CI/CD', 'Java', 'JavaScript', 'Node.js', 'C++']));
  });
  it('does not mistake common English words for skills', () => {
    expect(extractSkills('You will excel in a fast-paced spring season and react quickly to the rest of the team.')).toEqual([]);
  });
  it('does not match Java inside JavaScript', () => {
    expect(extractSkills('JavaScript only')).toEqual(['JavaScript']);
  });
  it('handles null', () => {
    expect(extractSkills(null)).toEqual([]);
  });
});

describe('extractMinYears', () => {
  it('reads the lowest experience requirement', () => {
    expect(extractMinYears('5+ years of experience in data engineering')).toBe(5);
    expect(extractMinYears('3-5 years of professional Python experience')).toBe(3);
    expect(extractMinYears('Minimum 2 years experience; 8 years preferred')).toBe(2);
  });
  it('ignores company-age and unrelated year mentions', () => {
    expect(extractMinYears('We are 20 years old and growing.')).toBeNull();
    expect(extractMinYears(null)).toBeNull();
  });
});
