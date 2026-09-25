/**
 * Captured signup history from the Amplitude MCP (Cross-Platform project
 * 677513, queried 2026-09-25), reproducing the team's funnel chart:
 *   traffic = unique users with Page Viewed, device_type != Linux and
 *             product_area contains "mw_"
 *   signups = users who completed that Page Viewed → Owner Account Created
 *             funnel within one day (daily conversion × traffic)
 *   rate    = signups / traffic
 * Days are UTC. Owner Account Created only fired from 2026-06-26, so the
 * series starts on its first full day, 2026-06-27. Today's incomplete
 * interval is excluded.
 *
 * When the AMPLITUDE_* Export keys work or OMNI_* lands, a live query
 * supersedes this snapshot; until then this is the real series.
 */
import rawHistory from "@/data/signup-history.json";

export type SignupDay = {
  date: string; // YYYY-MM-DD
  signups: number;
  traffic: number; // unique users with a qualifying Amplitude Page Viewed
  rate: number | null; // signups / traffic; null when traffic unknown (today)
};

export const signupHistory = rawHistory as SignupDay[];

export function capturedSignups(): SignupDay[] {
  return signupHistory;
}
