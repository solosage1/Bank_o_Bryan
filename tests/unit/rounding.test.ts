import { describe, it, expect } from 'vitest';
import { dailyInterestMicros } from '../../src/lib/interest/piecewise';

describe('rounding carry', () => {
  it('accumulates residual micros across days', () => {
    const tiers = [{ lower_cents: 0, apr_bps: 100 }]; // 1%
    let carry = 0;
    let centsTotal = 0;
    for (let i = 0; i < 30; i++) {
      const micros = dailyInterestMicros(10000, tiers);
      const totalMicros = micros + carry;
      const cents = Math.trunc(totalMicros / 1_000_000);
      carry = totalMicros - cents * 1_000_000;
      centsTotal += cents;
    }
    expect(centsTotal).toBeGreaterThan(0);
  });
});


