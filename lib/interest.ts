// Shared interest math utilities for Bank o'Bryan
// These functions implement deterministic tier slicing and accrual per the PRD.
export type Tier = { lower_cents: number; upper_cents?: number | null; apr_bps: number };

/**
 * Compute daily interest in micros (1e-6 dollars) for a given balance.
 * Uses Actual/365 day-count convention and piecewise tiers. APR in basis points.
 */
export function dailyInterestMicros(balanceCents: number, tiers: Tier[]): number {
  let micros = 0;
  // Convert cents to dollars for computation
  const balance = balanceCents / 100;
  for (const tier of tiers) {
    const lower = tier.lower_cents / 100;
    const upper = tier.upper_cents != null ? tier.upper_cents / 100 : Infinity;
    const amountInTier = Math.max(0, Math.min(balance, upper) - lower);
    if (amountInTier <= 0) continue;
    const apr = tier.apr_bps / 10000; // bps to rate
    const dailyRate = apr / 365;
    micros += amountInTier * dailyRate * 1_000_000;
  }
  return Math.floor(micros);
}

/**
 * Compute per-second increment for a balance given tiers.
 * APR in basis points. Returns dollars per second.
 */
export function perSecondIncrement(balanceCents: number, tiers: Tier[]): number {
  const balance = balanceCents / 100;
  let perSecond = 0;
  for (const tier of tiers) {
    const lower = tier.lower_cents / 100;
    const upper = tier.upper_cents != null ? tier.upper_cents / 100 : Infinity;
    const amountInTier = Math.max(0, Math.min(balance, upper) - lower);
    if (amountInTier <= 0) continue;
    const apr = tier.apr_bps / 10000;
    const ratePerSecond = apr / 365 / 24 / 3600;
    perSecond += amountInTier * ratePerSecond;
  }
  return perSecond;
}

/**
 * Round micros to cents with residual carry.
 * Returns tuple [cents, newCarry].
 */
export function roundToCentsWithCarry(micros: number, carry: number): [number, number] {
  const total = micros + carry;
  const cents = Math.floor(total / 10_000);
  const newCarry = total - cents * 10_000;
  return [cents, newCarry];
}
