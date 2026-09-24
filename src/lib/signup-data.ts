/**
 * Captured signup history from Amplitude (MCP query, 2026-09-23).
 * Daily unique users: signups = "Owner Sign Up", traffic = "Page Viewed" with
 * product_area mw_* and device_type != Linux. rate = signups / traffic.
 * Today's incomplete interval is excluded.
 *
 * The funnel's conversion event is now "Owner Account Created" (the live
 * Amplitude query uses it). This snapshot predates that change and needs a
 * re-capture with the new event.
 *
 * When the AMPLITUDE_* Export keys work or OMNI_* lands, a live query
 * supersedes this snapshot; until then this is the real series.
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
