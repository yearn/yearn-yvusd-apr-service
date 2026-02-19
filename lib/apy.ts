/**
 * Convert APR to APY using discrete compounding.
 *
 * Compounding is based on the vault's profitMaxUnlockTime — the period
 * over which harvested profits are streamed. This reflects how often
 * yield effectively compounds in practice.
 *
 * Formula: APY = (1 + APR / n)^n - 1
 *   where n = number of compounding periods per year
 *
 * @param apr Annual percentage rate as a decimal (e.g. 0.05 for 5%)
 * @param periodsPerYear Number of compounding periods per year
 *   (e.g. 365/7 ≈ 52.14 for weekly unlocks)
 */
export function aprToApy(apr: number, periodsPerYear: number): number {
  if (periodsPerYear <= 0) return apr;
  return Math.pow(1 + apr / periodsPerYear, periodsPerYear) - 1;
}

/**
 * Convert profitMaxUnlockTime (in seconds) to compounding periods per year.
 * Falls back to daily (365) if unlockTime is 0.
 */
export function unlockTimeToPeriodsPerYear(unlockTimeSeconds: number): number {
  if (unlockTimeSeconds <= 0) return 365;
  const secondsPerYear = 365 * 24 * 60 * 60;
  return secondsPerYear / unlockTimeSeconds;
}
