// app/dentist/cases/[id]/components/ActionsBar.tsx
"use client";

import { useMemo, useState } from "react";
import { getSupabaseBrowser } from "../../../../../../lib/supabaseBrowser";
import { approveCase } from "../actions/approveCase";
import { printReviewPacket, type ReviewPacketData } from "../../../../../../lib/pdf";

type LatestReport = { narrative?: string | null; payload?: any } | null;

type Props = {
  caseId: string;
  caseTitle?: string | null;
  latestReportVersion?: number | null;
  latestReport?: LatestReport;
  imagesToShare?: string[];
  feedback?: string;
  onAfterAction?: () => void;
};

type Busy = null | "approve" | "pdf" | "print" | "save";

function getLocalPatch(caseId: string): any | null {
  if (typeof window === "undefined") return null;
  const keys = [
    `structuredReportEditor:patch:${caseId}`,
    `reportTemplate:patch:${caseId}`,
    `templatePatch:${caseId}`,
    `report:template:patch:${caseId}`,
  ];
  for (const k of keys) {
    const raw = window.localStorage.getItem(k);
    if (!raw) continue;
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") return obj;
    } catch {}
  }
  return null;
}

function clearLocalPatch(caseId: string) {
  if (typeof window === "undefined") return;
  const keys = [
    `structuredReportEditor:patch:${caseId}`,
    `reportTemplate:patch:${caseId}`,
    `templatePatch:${caseId}`,
    `report:template:patch:${caseId}`,
  ];
  keys.forEach((k) => window.localStorage.removeItem(k));
}

export default function ActionsBar({
  caseId,
  caseTitle,
  latestReportVersion,
  latestReport,
  imagesToShare,
  onAfterAction,
}: Props) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const withMsg = (kind: "success" | "error", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 3500);
  };

  const ensureLatestReport = async (): Promise<LatestReport> => {
    if (latestReport) return latestReport;
    const { data, error } = await (supabase as any)
      .from("reports")
      .select("narrative, payload")
      .eq("case_id", caseId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return (data as LatestReport) ?? null;
  };

  const sevMap = (s?: string): "low" | "medium" | "high" => {
    const v = String(s || "").toLowerCase();
    if (v.includes("high") || v.includes("severe")) return "high";
    if (v.includes("mod") || v.includes("medium")) return "medium";
    return "low";
  };

  const saveTemplate = async (opts?: { silent?: boolean }) => {
    const patch = getLocalPatch(caseId);
    if (!patch || (typeof patch === "object" && Object.keys(patch).length === 0)) {
      if (!opts?.silent) withMsg("success", "Nothing to save");
      return { ok: true, saved: false as const };
    }
    setBusy("save");
    try {
      const res = await fetch("/api/reports/template/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, patch }),
      });
      const j = await res.json().catch(() => ({} as any));
      if (!res.ok || !j?.ok) {
        throw new Error(j?.details || j?.error || "Save failed");
      }
      clearLocalPatch(caseId);
      if (!opts?.silent) withMsg("success", "Template saved");
      try {
        window.dispatchEvent(new CustomEvent("report:templateUpserted", { detail: { caseId } }));
      } catch {}
      return { ok: true, saved: true as const, version: j.version as number | undefined };
    } catch (e: any) {
      if (!opts?.silent) withMsg("error", e?.message || "Save failed");
      return { ok: false, saved: false as const, error: e?.message || "Save failed" };
    } finally {
      setBusy(null);
    }
  };

  const exportPdfServer = async () => {
    const saved = await saveTemplate({ silent: true });
    if (!saved.ok) return;
    setBusy("pdf");
    try {
      const body = {
        caseId,
        draftVersion: latestReportVersion ?? 1,
        rebuttalVersion: "latest" as const,
        images: Array.isArray(imagesToShare) ? imagesToShare.filter(Boolean) : undefined,
      };
      const res = await fetch("/api/reports/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.details || j?.error || "PDF export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const draftV = body.draftVersion ?? 1;
      const a = document.createElement("a");
      a.href = url;
      a.download = `case-${caseId}-packet-v${draftV}-latest.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      withMsg("success", "PDF exported");
    } catch (e: any) {
      withMsg("error", e?.message || "PDF export failed");
    } finally {
      setBusy(null);
    }
  };

  const exportPdfClient = async () => {
    const saved = await saveTemplate({ silent: true });
    if (!saved.ok) return;
    setBusy("print");
    try {
      const report = await ensureLatestReport();
      const selected = (imagesToShare ?? []).filter(Boolean);
      const signedUrls: string[] = [];
      for (const p of selected) {
        const res = await fetch(`/api/storage/sign?path=${encodeURIComponent(p)}`);
        const j = await res.json().catch(() => ({}));
        if (res.ok && (j.url || j.signedUrl)) signedUrls.push(j.url || j.signedUrl);
      }
      const rows: any[] = Array.isArray(report?.payload?.findings) ? report!.payload.findings : [];
      const summary: string =
        typeof report?.payload?.summary === "string" && report?.payload?.summary
          ? report.payload.summary
          : report?.narrative || "";
      const packetData: ReviewPacketData = {
        caseId,
        patientName: caseTitle || "Patient",
        createdAt: new Date(),
        summary,
        findings: rows.map((r, idx) => ({
          tooth: String(r.tooth_fdi ?? r.tooth ?? idx + 1),
          note: Array.isArray(r.findings) ? r.findings.join(", ") : r.note ?? "",
          severity: sevMap(r.severity),
          image_index: Number.isInteger(r?.image_index) ? r.image_index : undefined,
          image_id: typeof r?.image_id === "string" ? r.image_id : undefined,
        })),
        images: signedUrls.map((u, i) => ({ url: u, caption: selected[i] })),
        footerNote: "Generated by Dentist Assistant",
      };
      printReviewPacket(packetData);
    } catch (e: any) {
      withMsg("error", e?.message || "Print PDF failed");
    } finally {
      setBusy(null);
    }
  };

  const handleApprove = async () => {
    setBusy("approve");
    setMsg(null);
    try {
      const r = await approveCase(caseId);
      if (!r.ok) throw new Error(r.error || "Approve error");
      withMsg("success", "Case approved");
      onAfterAction?.();
    } catch (e: any) {
      withMsg("error", e?.message || "Unexpected error");
    } finally {
      setBusy(null);
    }
  };

  const handleSaveTemplate = async () => {
    await saveTemplate();
    onAfterAction?.();
  };

  return (
    <section className="sticky bottom-4 z-[5] rounded-2xl border bg-[var(--color-surface)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleSaveTemplate}
          disabled={busy !== null}
          className="btn btn-secondary"
          aria-busy={busy === "save"}
          title="Save template edits before exporting"
        >
          {busy === "save" ? "Saving…" : "Save template"}
        </button>

        <button
          onClick={exportPdfServer}
          disabled={busy !== null}
          className="btn btn-outline"
          aria-busy={busy === "pdf"}
          title="Download server-rendered PDF with template and overlays"
        >
          {busy === "pdf" ? "Exporting…" : "Export PDF"}
        </button>

        <button
          onClick={exportPdfClient}
          disabled={busy !== null}
          className="btn btn-ghost"
          aria-busy={busy === "print"}
          title="Open print dialog (client PDF)"
        >
          {busy === "print" ? "Preparing…" : "Quick PDF (print)"}
        </button>

        <div className="ml-auto">
          <button
            onClick={handleApprove}
            disabled={busy !== null}
            className="btn btn-success"
            aria-busy={busy === "approve"}
          >
            {busy === "approve" ? "Approving…" : "Approve"}
          </button>
        </div>
      </div>

      {msg && (
        <div
          className="mt-2 rounded-xl border px-3 py-2 text-sm"
          style={{
            background:
              msg.kind === "success"
                ? "color-mix(in oklab, var(--color-success) 18%, transparent)"
                : "color-mix(in oklab, var(--color-danger) 14%, transparent)",
            borderColor:
              msg.kind === "success"
                ? "color-mix(in oklab, var(--color-success) 55%, var(--border-alpha))"
                : "color-mix(in oklab, var(--color-danger) 55%, var(--border-alpha))",
          }}
          role="status"
          aria-live="polite"
        >
          {msg.text}
        </div>
      )}
    </section>
  );
}
