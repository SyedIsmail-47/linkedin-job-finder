import { describe, expect, it } from 'vitest';
import { analyzeDataset } from '../scripts/analyze-dataset.js';

describe('analyzeDataset', () => {
  it('summarizes an inline sample', () => {
    const analysis = analyzeDataset([
      {
        requirementsSource: 'section',
        skills: ['Python'],
        minYearsExperience: 3,
        applyType: 'EXTERNAL_HIDDEN',
        detailsFetched: true,
        title: 'A',
        company: 'Co',
        description: 'x'.repeat(250),
        applyUrl: 'https://www.linkedin.com/jobs/view/1',
      },
      {
        requirementsSource: 'none',
        skills: [],
        minYearsExperience: null,
        applyType: 'UNKNOWN',
        detailsFetched: false,
        title: 'B',
        company: 'Co2',
        description: 'short',
        applyUrl: 'https://www.linkedin.com/jobs/view/2',
      },
    ]);
    expect(analysis.count).toBe(2);
    expect(analysis.pctRequirementsSource.section).toBe(50);
    expect(analysis.pctRequirementsSource.none).toBe(50);
    expect(analysis.pctNonEmptySkills).toBe(50);
    expect(analysis.pctMinYearsSet).toBe(50);
    expect(analysis.applyType).toEqual({ EXTERNAL_HIDDEN: 1, UNKNOWN: 1 });
    expect(analysis.pctDetailsFetched).toBe(50);
    expect(analysis.samples[0]?.description).toHaveLength(200);
  });
});
