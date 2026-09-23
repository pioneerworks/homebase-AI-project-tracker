/**
 * Captured signup history exported from Omni (Chat Query export, 2026-09-23).
 * Daily totals across Paid + Organic channels. Traffic (Vercel visitors) is
 * derived by inverting the per-channel 1D1 rate (visitors = signups / rate),
 * so `rate` is exactly signups / traffic — the precomputed per-channel rates
 * themselves are disregarded per product decision.
 *
 * When the OMNI_* env vars land, the live API query in lib/omni.ts supersedes
 * this snapshot; until then this is the real series (not sample data).
 */
import rawHistory from "@/data/signup-history.json";

export type SignupDay = {
  date: string; // YYYY-MM-DD
  signups: number;
  traffic: number; // derived Vercel visitors
  rate: number | null; // signups / traffic; null when traffic unknown (today)
};

export const signupHistory = rawHistory as SignupDay[];

export function capturedSignups(): SignupDay[] {
  return signupHistory;
}
