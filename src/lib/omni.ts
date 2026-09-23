/**
 * Omni (omni.co) signup series fetch.
 *
 * Placeholder wiring: when the OMNI_* env vars are set (IT is delivering the
 * API key), this queries Omni's REST API server-side and returns real signup
 * + conversion data. Until then it returns the captured Omni export
 * (real data snapshot in src/data/signup-history.json).
 *
 * Env vars needed to go live:
 *  - OMNI_API_KEY         personal access token or org API key
 *  - OMNI_INSTANCE_URL    e.g. https://joinhomebase.omniapp.co
 *  - OMNI_MODEL_ID        the model/topic UUID holding signup data
 *  - OMNI_SIGNUPS_TABLE   table/topic name, e.g. "signups"
 *  - OMNI_SIGNUPS_DATE_FIELD   e.g. "signups.day"
 *  - OMNI_SIGNUPS_COUNT_FIELD  e.g. "signups.count"
 *  - OMNI_SIGNUPS_RATE_FIELD   conversion rate field, e.g. "signups.conversion_rate"
 */
import { capturedSignups, type SignupDay } from "@/lib/signup-data";

export type SignupSeries = {
  source: "omni" | "export";
  days: SignupDay[];
};

type OmniQueryResponse = {
  data?: string; // base64 Arrow when resultType isn't json
  results?: unknown;
  error?: { message?: string } | string;
  job_ids?: string[];
};

/** Map Omni JSON query rows to SignupDay. Tolerates object rows and column-array rows. */
export function mapOmniRows(
  columns: string[],
  rows: unknown[],
  fieldMap: { date: string; count: string; rate: string },
): SignupDay[] {
  const dateIdx = columns.indexOf(fieldMap.date);
  const countIdx = columns.indexOf(fieldMap.count);
  const rateIdx = columns.indexOf(fieldMap.rate);

  const mapped: (SignupDay | null)[] = rows.map((row) => {
    if (Array.isArray(row)) {
      return {
        date: String(row[dateIdx] ?? "").slice(0, 10),
        signups: Number(row[countIdx] ?? 0),
        traffic: 0,
        rate: Number(row[rateIdx] ?? 0),
      };
    }
    if (row && typeof row === "object") {
      const record = row as Record<string, unknown>;
      return {
        date: String(record[fieldMap.date] ?? "").slice(0, 10),
        signups: Number(record[fieldMap.count] ?? 0),
        traffic: 0,
        rate: Number(record[fieldMap.rate] ?? 0),
      };
    }
    return null;
  });

  return mapped
    .filter((d): d is SignupDay => {
      if (!d) return false;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return false;
      if (!Number.isFinite(d.signups)) return false;
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function omniConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(
    env.OMNI_API_KEY?.trim() &&
      !env.OMNI_API_KEY.includes("SENSITIVE") &&
      env.OMNI_INSTANCE_URL?.trim() &&
      env.OMNI_MODEL_ID?.trim() &&
      env.OMNI_SIGNUPS_TABLE?.trim() &&
      env.OMNI_SIGNUPS_DATE_FIELD?.trim() &&
      env.OMNI_SIGNUPS_COUNT_FIELD?.trim(),
  );
}

export async function getSignupSeries(
  env: Record<string, string | undefined> = process.env,
): Promise<SignupSeries> {
  if (!omniConfigured(env)) {
    return { source: "export", days: capturedSignups() };
  }

  const fields = [
    env.OMNI_SIGNUPS_DATE_FIELD!.trim(),
    env.OMNI_SIGNUPS_COUNT_FIELD!.trim(),
    ...(env.OMNI_SIGNUPS_RATE_FIELD?.trim()
      ? [env.OMNI_SIGNUPS_RATE_FIELD.trim()]
      : []),
  ];

  try {
    const response = await fetch(
      `${env.OMNI_INSTANCE_URL!.trim().replace(/\/+$/, "")}/api/v1/query/run`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OMNI_API_KEY!.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: {
            modelId: env.OMNI_MODEL_ID!.trim(),
            table: env.OMNI_SIGNUPS_TABLE!.trim(),
            fields,
            sorts: [
              { column_name: env.OMNI_SIGNUPS_DATE_FIELD!.trim(), sort_descending: false },
            ],
          },
          resultType: "json",
        }),
        next: { revalidate: 3600, tags: ["omni-signups"] },
      },
    );
    if (!response.ok) throw new Error(`Omni query failed: ${response.status}`);

    const body = (await response.json()) as OmniQueryResponse;
    const result = Array.isArray(body.results) ? body.results[0] : body.results;
    const payload = result as { columns?: string[]; rows?: unknown[] } | undefined;
    const columns = payload?.columns ?? fields;
    const rows = payload?.rows ?? (Array.isArray(result) ? result : []);
    const days = mapOmniRows(columns, rows, {
      date: env.OMNI_SIGNUPS_DATE_FIELD!.trim(),
      count: env.OMNI_SIGNUPS_COUNT_FIELD!.trim(),
      rate: env.OMNI_SIGNUPS_RATE_FIELD?.trim() ?? env.OMNI_SIGNUPS_COUNT_FIELD!.trim(),
    });
    if (!days.length) throw new Error("Omni query returned no usable rows");
    return { source: "omni", days };
  } catch (error) {
    console.error(
      "Omni signup fetch failed, falling back to captured export:",
      error instanceof Error ? error.message : error,
    );
    return { source: "export", days: capturedSignups() };
  }
}
