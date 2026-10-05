import "server-only";

/**
 * Authenticated logic for GET /api/experiments/{id}, split out of the route
 * file so tests can call it without Next route machinery (Next route files may
 * only export handlers and config anyway). Mirrors the shape of
 * api/projects/[key]/route.ts: auth gate, then data, every response no-store.
 */
import { NextResponse } from "next/server";

import type { ExperimentDetail } from "./experiments-types";

/** Statsig experiment ids only; anything else is a 404 before any lookup. */
const ID_PATTERN = /^[A-Za-z0-9_\-]{1,100}$/;

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function handleDetail(
  id: string,
  deps: { user: unknown; getDetail: (id: string) => Promise<ExperimentDetail | null> },
): Promise<Response> {
  if (!deps.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Unknown experiment" }, { status: 404, headers: NO_STORE });
  }

  try {
    const detail = await deps.getDetail(id);
    if (!detail) {
      return NextResponse.json(
        { error: "Unknown experiment" },
        { status: 404, headers: NO_STORE },
      );
    }
    return NextResponse.json(detail, { headers: NO_STORE });
  } catch (error) {
    console.log(
      "[experiments] Statsig fetch failed:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ error: "Statsig unavailable" }, { status: 502, headers: NO_STORE });
  }
}
