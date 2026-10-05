"use client";

import { Archive, ArrowUpRight, Download, Gavel } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type MouseEvent } from "react";

import ExperimentTable from "@/components/experiments/experiment-table";
import StopDialog, { type StopDialogExperiment } from "@/components/experiments/stop-dialog";
import {
  filterItems,
  parseFilters,
  STATSIG_EXPERIMENTS_URL,
  toCsv,
} from "@/lib/experiments-derive";
import type { ExperimentsPage, View } from "@/lib/experiments-types";

/**
 * The Experiments tab. State lives in the URL (?view=&surface=&open=) so the
 * sidebar, the segmented tabs and row deep-links all agree; tab clicks write
 * back with router.replace so navigation never scrolls or stacks history.
 */

const TABS: { view: View; label: string }[] = [
  { view: "all", label: "All" },
  { view: "live", label: "Live" },
  { view: "queued", label: "Queued" },
  { view: "draft", label: "Drafts" },
  { view: "concluded", label: "Concluded" },
];

/** Labels of the five KPI cells, for when the Statsig page didn't load. */
const KPI_LABELS = [
  "Live tests",
  "Significant results",
  "Visitors in test · 7d",
  "Owner signups in test",
  "M1 · First live experiments",
];

function shortDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "Sep 21–27", or "Sep 29–Oct 5" across a month boundary. */
function weekLabel(from: string, to: string): string {
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const end = sameMonth ? String(Number(to.slice(8, 10))) : shortDay(to);
  return `${shortDay(from)}–${end}`;
}

export default function ExperimentsView({
  page,
}: {
  page: ExperimentsPage | null | undefined;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { view, surface } = parseFilters({
    view: params.get("view"),
    surface: params.get("surface"),
  });
  const [stopOpen, setStopOpen] = useState(false);

  const filtered = page ? filterItems(page.experiments, { view, surface }) : [];
  const tableState = page === undefined ? "fetch-failed" : page === null ? "unconfigured" : "ok";

  // Summary counts come from the FULL list, never the filtered one.
  const counts = page
    ? {
        total: page.experiments.length,
        live: page.experiments.filter((i) => i.status === "live").length,
        queued: page.experiments.filter((i) => i.status === "queued").length,
        draft: page.experiments.filter((i) => i.status === "draft").length,
        hasConcluded: page.experiments.some((i) => i.status === "concluded"),
      }
    : null;

  const decision = page?.decision ?? null;
  const decisionItem =
    decision && page ? page.experiments.find((i) => i.id === decision.experimentId) ?? null : null;
  const stopExperiment: StopDialogExperiment | null =
    decision && decisionItem
      ? {
          name: decisionItem.name,
          statsigUrl: decision.statsigUrl,
          controlArmName: decisionItem.armNames.control,
        }
      : null;

  const hrefForView = (v: View) => `/experiments?view=${v}${surface ? `&surface=${surface}` : ""}`;
  const setView = (v: View) => (event: MouseEvent<HTMLButtonElement>) => {
    // Pointer clicks only: blurring on keyboard activation (event.detail === 0)
    // would drop focus right after the user tabbed to the tab.
    if (event.detail > 0) event.currentTarget.blur();
    router.replace(hrefForView(v), { scroll: false });
  };

  const downloadCsv = () => {
    if (!page) return;
    const blob = new Blob([toCsv(filtered)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `experiments-${page.today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="exp-main">
      <header className="exp-header">
        <div className="exp-titleblock">
          <p className="exp-eyebrow">
            A/B testing{page ? ` · Week of ${weekLabel(page.week.start, page.week.end)}` : ""}
          </p>
          <h1 className="exp-title">Experiments</h1>
          <p className="exp-dek">
            Every test we&rsquo;re running, what it&rsquo;s doing to signups, and which ones need a
            call.
          </p>
        </div>
        <div className="exp-actions">
          <a
            className="exp-btn exp-btn-outline"
            href={STATSIG_EXPERIMENTS_URL}
            target="_blank"
            rel="noreferrer"
          >
            Open in Statsig
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
          <button type="button" className="exp-btn exp-btn-dark" onClick={downloadCsv}>
            <Download size={14} aria-hidden="true" />
            Export results
          </button>
        </div>
      </header>

      <section className="exp-kpis" aria-label="Program KPIs">
        {page
          ? page.kpis.map((kpi) => (
              <div
                key={kpi.id}
                className={`exp-kpi${kpi.tone === "danger" ? " exp-kpi-danger" : ""}`}
              >
                <span className="exp-kpi-label">{kpi.label}</span>
                <span className="exp-kpi-value">{kpi.value}</span>
                <span className="exp-kpi-context">{kpi.context}</span>
              </div>
            ))
          : KPI_LABELS.map((label) => (
              <div key={label} className="exp-kpi">
                <span className="exp-kpi-label">{label}</span>
                <span className="exp-kpi-value">—</span>
                <span className="exp-kpi-context">—</span>
              </div>
            ))}
      </section>

      <section className="exp-section" aria-labelledby="exp-all-title">
        <div className="exp-section-head">
          <div className="exp-section-titlerow">
            <h2 className="exp-h2" id="exp-all-title">
              All experiments
            </h2>
            {counts ? (
              <p className="exp-summary">
                {counts.total} total · {counts.live} live · {counts.queued} queued ·{" "}
                {counts.draft} draft · expand a row for details
              </p>
            ) : null}
          </div>
          <div className="exp-tabs" role="group" aria-label="Filter experiments by status">
            {TABS.map((tab) => (
              <button
                key={tab.view}
                type="button"
                className="exp-tab"
                aria-current={view === tab.view ? "true" : undefined}
                onClick={setView(tab.view)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <ExperimentTable
          items={filtered}
          state={tableState}
          seededId={params.get("open")}
        />

        {counts && !counts.hasConcluded ? (
          <div className="exp-archive">
            <Archive size={16} aria-hidden="true" />
            <p className="exp-archive-copy">
              No concluded experiments yet — results and learnings will collect here once M1 tests
              are called.
            </p>
          </div>
        ) : null}
      </section>

      {decision && stopExperiment ? (
        <section className="exp-banner" aria-label="Decision needed">
          <span className="exp-banner-chip" aria-hidden="true">
            <Gavel size={18} />
          </span>
          <div className="exp-banner-copy">
            <p className="exp-banner-title">{decision.title}</p>
            <p className="exp-banner-body">{decision.body}</p>
          </div>
          <div className="exp-banner-actions">
            <a className="exp-btn exp-btn-outline exp-btn-sm" href={decision.slackUrl} target="_blank" rel="noreferrer">
              Discuss in #ab-testing
            </a>
            <button type="button" className="exp-btn exp-btn-danger exp-btn-sm" onClick={() => setStopOpen(true)}>
              Stop &amp; keep control
            </button>
          </div>
        </section>
      ) : null}
      {stopExperiment ? (
        <StopDialog experiment={stopExperiment} open={stopOpen} onClose={() => setStopOpen(false)} />
      ) : null}
    </div>
  );
}
