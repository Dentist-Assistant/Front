"use client";

import { useMemo, useState } from "react";
import { getSupabaseBrowser } from "../../../../../../lib/supabaseBrowser";

type LatestReport = { version?: number | null; narrative?: string | null; payload?: any } | null;

type Props = {
  caseId: string;
  latestReportVersion?: number | null;
  initialFeedback?: string;
  onAfterRebuttal?: () => void;
};

type BusyState = "idle" | "running";

type Severity = "low" | "medium" | "high";
type FlatFinding = { tooth: string; note: string; severity: Severity };

type DiffResult = {
  baseVersion: number | null;
  newVersion: number | null;
  baseSummary: string;
  newSummary: string;
  added: FlatFinding[];
  removed: FlatFinding[];
  modified: Array<{ tooth: string; from: { note: string; severity: Severity }; to: { note: string; severity: Severity } }>;
};

function normSeverity(s?: string | null): Severity {
  const v = String(s || "").toLowerCase();
  if (v.includes("high") || v.includes("severe")) return "high";
  if (v.includes("mod")) return "medium";
  return "low";
}

function flattenFindings(rows: any[]): FlatFinding[] {
  if (!Array.isArray(rows)) return [];
  const out: FlatFinding[] = [];
  rows.forEach((r) => {
    const tooth = String(r?.tooth_fdi ?? r?.tooth ?? "");
    const sev = normSeverity(r?.severity);
    const arr = Array.isArray(r?.findings) ? r.findings : [];
    arr.forEach((note: any) => {
      const n = String(note || "").trim();
      if (!tooth || !n) return;
      out.push({ tooth, note: n, severity: sev });
    });
  });
  return out;
}

function keyOf(f: FlatFinding) {
  return `${f.tooth}||${f.note.toLowerCase()}`;
}

function diffFindings(a: FlatFinding[], b: FlatFinding[]) {
  const mapA = new Map<string, FlatFinding>();
  const mapB = new Map<string, FlatFinding>();
  a.forEach((f) => mapA.set(keyOf(f), f));
  b.forEach((f) => mapB.set(keyOf(f), f));
  const added: FlatFinding[] = [];
  const removed: FlatFinding[] = [];
  const modified: Array<{ tooth: string; from: { note: string; severity: Severity }; to: { note: string; severity: Severity } }> =
    [];
  const usedB = new Set<string>();

  a.forEach((fa) => {
    const k = keyOf(fa);
    if (mapB.has(k)) {
      usedB.add(k);
      return;
    }
    const candidates = b.filter((fb) => fb.tooth === fa.tooth && fb.note === fa.note);
    const mod = candidates.find((fb) => fb.severity !== fa.severity) || null;
    if (mod) {
      modified.push({ tooth: fa.tooth, from: { note: fa.note, severity: fa.severity }, to: { note: mod.note, severity: mod.severity } });
      usedB.add(keyOf(mod));
    } else {
      removed.push(fa);
    }
  });

  b.forEach((fb) => {
    const k = keyOf(fb);
    if (!usedB.has(k) && !mapA.has(k)) added.push(fb);
  });

  return { added, removed, modified };
}

export default function FeedbackPanel({ caseId, latestReportVersion, initialFeedback = "", onAfterRebuttal }: Props) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [text, setText] = useState(initialFeedback);
  const [busy, setBusy] = useState<BusyState>("idle");
  const [status, setStatus] = useState<{ kind: "ok" | "error"; msg: string } | null>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);

  const MAX = 1000;
  const used = text.length;
  const nearLimit = used > MAX * 0.9;

  const fetchLatestTwo = async (): Promise<[LatestReport, LatestReport]> => {
    const { data, error } = await (supabase as any)
      .from("reports")
      .select("version, narrative, payload")
      .eq("case_id", caseId)
      .order("version", { ascending: false })
      .limit(2);
    if (error) return [null, null];
    const rows = Array.isArray(data) ? data : [];
    return [rows[0] ?? null, rows[1] ?? null];
  };

  const runRebuttal = async () => {
    if (busy === "running") return;
    setBusy("running");
    setStatus(null);
    setDiff(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Unauthorized");

      const [baseLatest] = await fetchLatestTwo();

      const res = await fetch("/api/ai/rebuttal", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          caseId,
          critique: text || "",
          targetVersion: typeof latestReportVersion === "number" ? latestReportVersion : undefined,
        }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "AI error");

      const [newLatest, prev] = await fetchLatestTwo();

      const base = baseLatest ?? prev ?? null;
      const next = newLatest ?? null;

      const baseSummary: string = String(base?.payload?.summary ?? base?.narrative ?? "") || "";
      const nextSummary: string = String(next?.payload?.rebuttal?.narrative ?? next?.payload?.summary ?? next?.narrative ?? "") || "";

      const a = flattenFindings(Array.isArray(base?.payload?.findings) ? base?.payload?.findings : []);
      const b = flattenFindings(Array.isArray(next?.payload?.findings) ? next?.payload?.findings : []);

      const d = diffFindings(a, b);
      setDiff({
        baseVersion: Number(base?.version ?? null),
        newVersion: Number(next?.version ?? null),
        baseSummary,
        newSummary: nextSummary,
        added: d.added,
        removed: d.removed,
        modified: d.modified,
      });

      setStatus({ kind: "ok", msg: `Rebuttal saved as v${next?.version ?? ""}` });
      onAfterRebuttal?.();
    } catch (e: any) {
      setStatus({ kind: "error", msg: e?.message || "Unexpected error" });
    } finally {
      setBusy("idle");
    }
  };

  return (
    <section className="card-lg">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor="fb" className="label m-0">Feedback for AI rebuttal</label>
        <div className="flex items-center gap-2 text-xs">
          <span className={`tabular-nums ${nearLimit ? "text-[var(--color-warning)]" : "muted"}`}>{used}/{MAX}</span>
          <button
            onClick={runRebuttal}
            disabled={busy === "running"}
            className="btn btn-outline"
            aria-busy={busy === "running"}
            title="Generate an AI rebuttal using this feedback"
          >
            {busy === "running" ? "Rebutting…" : "Run Rebuttal"}
          </button>
        </div>
      </div>

      <textarea
        id="fb"
        value={text}
        maxLength={MAX}
        onChange={(e) => setText(e.target.value)}
        className="textarea min-h-[110px]"
        placeholder='Example: "Verify FDI: finding on 21 may be 12. Quantify overjet/overbite if visible. Specify Angle class by side."'
      />

      {status && (
        <div
          className="mt-2 rounded-xl border px-3 py-2 text-sm"
          style={{
            background:
              status.kind === "ok"
                ? "color-mix(in oklab, var(--color-success) 18%, transparent)"
                : "color-mix(in oklab, var(--color-danger) 14%, transparent)",
            borderColor:
              status.kind === "ok"
                ? "color-mix(in oklab, var(--color-success) 55%, var(--border-alpha))"
                : "color-mix(in oklab, var(--color-danger) 55%, var(--border-alpha))",
          }}
          role="status"
          aria-live="polite"
        >
          {status.msg}
        </div>
      )}

      {diff && (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <h3 className="text-sm font-semibold">Summary diff</h3>
              <div className="text-xs muted">v{diff.baseVersion ?? "—"} → v{diff.newVersion ?? "—"}</div>
            </div>
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <div className="mb-1 text-xs uppercase tracking-wide muted">Before</div>
                <p className="text-sm whitespace-pre-wrap">{diff.baseSummary || "—"}</p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="mb-1 text-xs uppercase tracking-wide muted">After</div>
                <p className="text-sm whitespace-pre-wrap">{diff.newSummary || "—"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <h3 className="text-sm font-semibold">Findings changes</h3>
              <div className="text-xs muted">
                <span className="mr-3">+{diff.added.length}</span>
                <span className="mr-3">−{diff.removed.length}</span>
                <span>↺{diff.modified.length}</span>
              </div>
            </div>

            <div className="grid gap-3 p-3 md:grid-cols-3">
              <div className="rounded-lg border p-3">
                <div className="mb-2 text-xs uppercase tracking-wide" style={{ color: "var(--color-success)" }}>Added</div>
                {diff.added.length ? (
                  <ul className="space-y-1 text-sm">
                    {diff.added.map((f, i) => (
                      <li key={`a-${i}`} className="flex items-start gap-2">
                        <span className="inline-flex min-w-8 justify-center rounded-md border px-1 text-xs">FDI {f.tooth}</span>
                        <span className="flex-1">{f.note}</span>
                        <span className="text-xs opacity-70">{f.severity}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm muted">None</p>
                )}
              </div>

              <div className="rounded-lg border p-3">
                <div className="mb-2 text-xs uppercase tracking-wide" style={{ color: "var(--color-danger)" }}>Removed</div>
                {diff.removed.length ? (
                  <ul className="space-y-1 text-sm">
                    {diff.removed.map((f, i) => (
                      <li key={`r-${i}`} className="flex items-start gap-2">
                        <span className="inline-flex min-w-8 justify-center rounded-md border px-1 text-xs">FDI {f.tooth}</span>
                        <span className="flex-1">{f.note}</span>
                        <span className="text-xs opacity-70">{f.severity}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm muted">None</p>
                )}
              </div>

              <div className="rounded-lg border p-3">
                <div className="mb-2 text-xs uppercase tracking-wide" style={{ color: "var(--color-warning)" }}>Modified</div>
                {diff.modified.length ? (
                  <ul className="space-y-2 text-sm">
                    {diff.modified.map((m, i) => (
                      <li key={`m-${i}`} className="space-y-1">
                        <div className="inline-flex min-w-8 justify-center rounded-md border px-1 text-xs">FDI {m.tooth}</div>
                        <div className="rounded-md border p-2 text-xs">
                          <div className="opacity-80">Before: {m.from.note} ({m.from.severity})</div>
                          <div>After: {m.to.note} ({m.to.severity})</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm muted">None</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
