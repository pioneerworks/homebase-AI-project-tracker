/**
 * SAMPLE signup data until the Omni connection is wired up.
 * Deterministic (seeded) so the local preview is stable.
 * Shape mirrors what the Omni API will return once credentials are provided.
 */
export type SignupDay = {
  date: string; // YYYY-MM-DD
  signups: number;
  rate: number; // signup conversion rate, 0-1
};

const START = new Date("2026-07-15T00:00:00Z");
const DAYS = 71;

export function sampleSignups(): SignupDay[] {
  const out: SignupDay[] = [];
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < DAYS; i++) {
    const date = new Date(START.getTime() + i * 86400000);
    const day = date.getUTCDay();
    const weekend = day === 0 || day === 6;
    // gentle upward trend with two uplift "steps" to simulate work effects
    const trend = 38 + i * 0.55;
    const uplift =
      i > 21 ? 14 : 0; // mid-July experiment ships
    const uplift2 = i > 45 ? 18 : 0;
    const noise = (rand() - 0.5) * 14;
    const signups = Math.max(
      4,
      Math.round(trend + uplift + uplift2 + (weekend ? -18 : 0) + noise),
    );
    const visitors = Math.round(signups / (0.028 + (i > 45 ? 0.006 : 0) + rand() * 0.004));
    out.push({
      date: date.toISOString().slice(0, 10),
      signups,
      rate: signups / visitors,
    });
  }
  return out;
}
