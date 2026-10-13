import { describe, expect, it } from 'vitest';
import {
  computeSpikeMetrics,
  evaluateSpikeTier,
  isPlanError,
  shouldWriteNoGo,
  type SpikeFile,
} from '../scripts/summarize-stats.js';

/** Smoke run AgpgFLGw8jvCUtWJa: 30/30 jobs, 29/30 details, 32×200 + 22×429. */
const smokeRun: SpikeFile = {
  tier: 'smoke-datacenter',
  requestedJobs: 30,
  usageTotalUsd: 0.05,
  durationMs: 255_000,
  stats: {
    jobsPushed: 30,
    detailsOk: 29,
    detailFailures: 1,
    abortedReason: null,
    http: {
      requests: 54,
      statusHistogram: { '200': 32, '429': 22 },
    },
  },
};

describe('summarize-stats verdicts', () => {
  it('classifies the smoke run as MARGINAL', () => {
    const m = computeSpikeMetrics(smokeRun);
    expect(m.jobYield).toBe(1);
    expect(m.detailSuccess).toBeCloseTo(29 / 30, 5);
    expect(m.rawSuccess).toBeCloseTo(32 / 54, 5);
    expect(m.blockedShare).toBeCloseTo(22 / 54, 5);
    expect(m.blockedShare!).toBeGreaterThan(0.25);
    expect(evaluateSpikeTier(smokeRun)).toBe('MARGINAL');
  });

  it('PASS when yield, detail, and block share all clear', () => {
    const file: SpikeFile = {
      tier: 'good',
      requestedJobs: 100,
      stats: {
        jobsPushed: 96,
        detailsOk: 95,
        detailFailures: 1,
        abortedReason: null,
        http: { requests: 200, statusHistogram: { '200': 180, '429': 20 } },
      },
    };
    // blockedShare 20/200=0.10, yield 0.96, detail 95/96
    expect(evaluateSpikeTier(file)).toBe('PASS');
  });

  it('FAIL when abortedReason is set even with high yield', () => {
    const file: SpikeFile = {
      tier: 'blocked',
      requestedJobs: 100,
      stats: {
        jobsPushed: 90,
        detailsOk: 90,
        detailFailures: 0,
        abortedReason: 'LinkedIn blocked 8 requests in a row',
        http: { requests: 100, statusHistogram: { '200': 90, '429': 10 } },
      },
    };
    expect(evaluateSpikeTier(file)).toBe('FAIL');
  });

  it('INCONCLUSIVE for residential plan errors', () => {
    expect(isPlanError('Proxy group RESIDENTIAL is not available on your plan')).toBe(true);
    expect(
      evaluateSpikeTier({
        tier: 'residential',
        error: 'Proxy group RESIDENTIAL is not available on your plan',
        stats: null,
      }),
    ).toBe('INCONCLUSIVE');
  });

  it('NO-GO only when every runnable tier FAILs', () => {
    expect(shouldWriteNoGo(['FAIL', 'FAIL'])).toBe(true);
    expect(shouldWriteNoGo(['FAIL', 'INCONCLUSIVE'])).toBe(true);
    expect(shouldWriteNoGo(['FAIL', 'MARGINAL'])).toBe(false);
    expect(shouldWriteNoGo(['INCONCLUSIVE', 'INCONCLUSIVE'])).toBe(false);
    expect(shouldWriteNoGo([])).toBe(false);
  });
});
