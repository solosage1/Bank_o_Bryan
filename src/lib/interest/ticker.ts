import { Tier } from './piecewise';

export function perSecondIncrementCents(balance_cents: number, tiers: Tier[]) {
  let perSecond = 0;
  for (const t of tiers) {
    const upper = t.upper_cents ?? Number.MAX_SAFE_INTEGER;
    const inTier = Math.max(0, Math.min(balance_cents, upper) - t.lower_cents);
    if (inTier > 0) {
      perSecond += (inTier * (t.apr_bps / 10000)) / 365 / 86400;
    }
  }
  return perSecond; // cents per second
}

export type TickerBase = {
  base_value_cents: number;
  base_timestamp_ms: number;
  tiers: Tier[];
};

export function computeTickerValue(now_ms: number, base: TickerBase): number {
  const elapsed = Math.max(0, Math.floor((now_ms - base.base_timestamp_ms) / 1000));
  const incPerSec = perSecondIncrementCents(base.base_value_cents, base.tiers);
  return base.base_value_cents + incPerSec * elapsed;
}


