import { describe, it, expect } from 'vitest';
import { sliceBalanceAcrossTiers, dailyInterestMicros, Tier } from '../../src/lib/interest/piecewise';

describe('piecewise tiers', () => {
  const tiers: Tier[] = [
    { lower_cents: 0, upper_cents: 10000, apr_bps: 200 },
    { lower_cents: 10000, upper_cents: 50000, apr_bps: 300 },
    { lower_cents: 50000, apr_bps: 400 },
  ];

  it('slices across bounds', () => {
    const slices = sliceBalanceAcrossTiers(60000, tiers);
    expect(slices).toEqual([
      { in_tier_cents: 10000, apr_bps: 200 },
      { in_tier_cents: 40000, apr_bps: 300 },
      { in_tier_cents: 10000, apr_bps: 400 },
    ]);
  });

  it('computes daily interest micros', () => {
    const micros = dailyInterestMicros(10000, tiers); // $100
    // 10000 * 0.02/365 * 1e6 ≈ 547945
    expect(micros).toBeGreaterThan(500000);
  });
});


