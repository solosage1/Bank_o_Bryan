export type Tier = { lower_cents: number; upper_cents?: number; apr_bps: number };

export function sliceBalanceAcrossTiers(balance_cents: number, tiers: Tier[]) {
  const out: { in_tier_cents: number; apr_bps: number }[] = [];
  for (const t of tiers) {
    const upper = t.upper_cents ?? Number.MAX_SAFE_INTEGER;
    const inTier = Math.max(0, Math.min(balance_cents, upper) - t.lower_cents);
    if (inTier > 0) out.push({ in_tier_cents: inTier, apr_bps: t.apr_bps });
  }
  return out;
}

export function dailyInterestMicros(balance_cents: number, tiers: Tier[]) {
  const slices = sliceBalanceAcrossTiers(balance_cents, tiers);
  let micros = 0;
  for (const s of slices) {
    const dailyRate = s.apr_bps / 10000 / 365;
    micros += Math.round(s.in_tier_cents * dailyRate * 1_000_000);
  }
  return micros;
}


