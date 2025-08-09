import { describe, it, expect } from 'vitest';
import { computeTickerValue, perSecondIncrementCents } from '../../src/lib/interest/ticker';

describe('ticker', () => {
  const tiers = [{ lower_cents: 0, apr_bps: 365 }]; // ~1% daily/365 bps

  it('computes per-second increment > 0 for positive balance', () => {
    const inc = perSecondIncrementCents(10000, tiers);
    expect(inc).toBeGreaterThan(0);
  });

  it('advances over time deterministically', () => {
    const base = { base_value_cents: 10000, base_timestamp_ms: 0, tiers };
    const after = computeTickerValue(1000, base);
    expect(after).toBeGreaterThan(10000);
  });
});


