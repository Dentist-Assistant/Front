"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "../../../../../../lib/supabaseBrowser";

type Measurements = {
  overjet_mm?: number;
  overbite_percent?: number;
  midline_deviation_mm?: number;
  crowding_upper_mm?: number;
  crowding_lower_mm?: number;
  arch_length_upper_mm?: number;
  arch_length_lower_mm?: number;
};

type Occlusion = {
  class_right?: "I" | "II" | "III" | string;
  class_left?: "I" | "II" | "III" | string;
  open_bite?: boolean;
  crossbite?: boolean;
  overjet_tendency?: string;
  overbite_tendency?: string;
};

type Hygiene = {
  plaque?: string;
  calculus?: string;
  gingival_inflammation?: string;
  bleeding_on_probing?: string;
};

type TreatmentGoal = {
  summary?: string;
  goals?: string[];
  duration_months?: number | null;
  notes?: string;
} | null;

type PayloadShape = {
  summary?: string;
  measurements?: Measurements;
  occlusion?: Occlusion;
  hygiene?: Hygiene;
  recommendations?: string[];
  treatment_goal_final?: TreatmentGoal;
  [k: string]: any;
};

type Props = {
  caseId: string;
  initial?: PayloadShape;
  onSaved?: () => void | Promise<void>;
};

const ENDPOINT_PATCH = "/api/reports/template/patch";

function toNumberOrUndefined(v: string): number | undefined {
  if (!v.trim()) return undefined;
  const n = Number(v.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function toBool(v: string): boolean | undefined {
  const s = v.trim().toLowerCase();
  if (!s) return undefined;
  if (["true", "1", "yes", "y", "on"].includes(s)) return true;
  if (["false", "0", "no", "n", "off"].includes(s)) return false;
  return undefined;
}

export default function StructuredReportEditor({ caseId, initial, onSaved }: Props) {
  const seeded = useMemo<PayloadShape>(() => initial ?? {}, [initial]);

  const [summary, setSummary] = useState<string>(seeded.summary ?? "");

  const [overjet, setOverjet] = useState<string>(
    seeded.measurements?.overjet_mm != null ? String(seeded.measurements.overjet_mm) : ""
  );
  const [overbite, setOverbite] = useState<string>(
    seeded.measurements?.overbite_percent != null ? String(seeded.measurements.overbite_percent) : ""
  );
  const [midline, setMidline] = useState<string>(
    seeded.measurements?.midline_deviation_mm != null ? String(seeded.measurements.midline_deviation_mm) : ""
  );
  const [crowdU, setCrowdU] = useState<string>(
    seeded.measurements?.crowding_upper_mm != null ? String(seeded.measurements.crowding_upper_mm) : ""
  );
  const [crowdL, setCrowdL] = useState<string>(
    seeded.measurements?.crowding_lower_mm != null ? String(seeded.measurements.crowding_lower_mm) : ""
  );
  const [archU, setArchU] = useState<string>(
    seeded.measurements?.arch_length_upper_mm != null ? String(seeded.measurements.arch_length_upper_mm) : ""
  );
  const [archL, setArchL] = useState<string>(
    seeded.measurements?.arch_length_lower_mm != null ? String(seeded.measurements.arch_length_lower_mm) : ""
  );

  const [occR, setOccR] = useState<string>(seeded.occlusion?.class_right ?? "");
  const [occL, setOccL] = useState<string>(seeded.occlusion?.class_left ?? "");
  const [openBite, setOpenBite] = useState<string>(
    seeded.occlusion?.open_bite == null ? "" : String(seeded.occlusion.open_bite)
  );
  const [crossbite, setCrossbite] = useState<string>(
    seeded.occlusion?.crossbite == null ? "" : String(seeded.occlusion.crossbite)
  );
  const [ojT, setOjT] = useState<string>(seeded.occlusion?.overjet_tendency ?? "");
  const [obT, setObT] = useState<string>(seeded.occlusion?.overbite_tendency ?? "");

  const [plaque, setPlaque] = useState<string>(seeded.hygiene?.plaque ?? "");
  const [calculus, setCalculus] = useState<string>(seeded.hygiene?.calculus ?? "");
  const [gingival, setGingival] = useState<string>(seeded.hygiene?.gingival_inflammation ?? "");
  const [bleeding, setBleeding] = useState<string>(seeded.hygiene?.bleeding_on_probing ?? "");

  const [recsText, setRecsText] = useState<string>((seeded.recommendations ?? []).join("\n"));

  const [tgSummary, setTgSummary] = useState<string>(seeded.treatment_goal_final?.summary ?? "");
  const [tgGoals, setTgGoals] = useState<string>((seeded.treatment_goal_final?.goals ?? []).join("\n"));
  const [tgDuration, setTgDuration] = useState<string>(
    seeded.treatment_goal_final?.duration_months == null ? "" : String(seeded.treatment_goal_final.duration_months)
  );
  const [tgNotes, setTgNotes] = useState<string>(seeded.treatment_goal_final?.notes ?? "");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (!err) return;
    const t = setTimeout(() => setErr(null), 3000);
    return () => clearTimeout(t);
  }, [err]);

  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(() => setOk(null), 1500);
    return () => clearTimeout(t);
  }, [ok]);

  const buildPatch = (): Record<string, any> => {
    const recommendations = recsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    const patch: Record<string, any> = {
      summary: summary || undefined,
      measurements: {
        overjet_mm: toNumberOrUndefined(overjet),
        overbite_percent: toNumberOrUndefined(overbite),
        midline_deviation_mm: toNumberOrUndefined(midline),
        crowding_upper_mm: toNumberOrUndefined(crowdU),
        crowding_lower_mm: toNumberOrUndefined(crowdL),
        arch_length_upper_mm: toNumberOrUndefined(archU),
        arch_length_lower_mm: toNumberOrUndefined(archL),
      },
      occlusion: {
        class_right: occR || undefined,
        class_left: occL || undefined,
        open_bite: toBool(openBite),
        crossbite: toBool(crossbite),
        overjet_tendency: ojT || undefined,
        overbite_tendency: obT || undefined,
      },
      hygiene: {
        plaque: plaque || undefined,
        calculus: calculus || undefined,
        gingival_inflammation: gingival || undefined,
        bleeding_on_probing: bleeding || undefined,
      },
      recommendations,
      treatment_goal_final: {
        summary: tgSummary || undefined,
        goals: tgGoals
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean),
        duration_months: tgDuration.trim() === "" ? null : toNumberOrUndefined(tgDuration),
        notes: tgNotes || undefined,
      },
    };

    if (Object.values(patch.measurements).every((v) => v === undefined)) delete patch.measurements;
    if (
      Object.values(patch.occlusion).every((v) => v === undefined) &&
      patch.occlusion?.open_bite === undefined &&
      patch.occlusion?.crossbite === undefined
    ) {
      delete patch.occlusion;
    }
    if (Object.values(patch.hygiene).every((v) => v === undefined)) delete patch.hygiene;
    if (!patch.recommendations?.length) delete patch.recommendations;
    if (
      patch.treatment_goal_final &&
      Object.values(patch.treatment_goal_final).every(
        (v) => v === undefined || (Array.isArray(v) && v.length === 0)
      )
    ) {
      delete patch.treatment_goal_final;
    }

    return patch;
  };

  const onSave = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Unauthorized");

      const patch = buildPatch();

      const res = await fetch(ENDPOINT_PATCH, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ caseId, patch }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Failed to save changes");

      setOk("Saved");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("report:templateUpserted", { detail: { caseId, patch } }));
      }
      await onSaved?.();
    } catch (e: any) {
      setErr(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave();
      }}
    >
      {err && (
        <div
          role="alert"
          className="rounded-xl border px-3 py-2 text-sm"
          style={{
            background: "color-mix(in oklab, var(--color-danger) 14%, transparent)",
            borderColor: "color-mix(in oklab, var(--color-danger) 55%, var(--border-alpha))",
          }}
        >
          {err}
        </div>
      )}
      {ok && (
        <div
          role="status"
          className="rounded-xl border px-3 py-2 text-sm"
          style={{
            background: "color-mix(in oklab, var(--color-success) 14%, transparent)",
            borderColor: "color-mix(in oklab, var(--color-success) 55%, var(--border-alpha))",
          }}
        >
          {ok}
        </div>
      )}

      <div className="rounded-xl border p-3">
        <label className="label">Summary</label>
        <textarea
          className="textarea w-full"
          rows={3}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Clinical summary…"
        />
      </div>

      <div className="rounded-xl border p-3">
        <div className="label mb-2">Measurements</div>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="Overjet (mm)" value={overjet} onChange={(e) => setOverjet(e.target.value)} />
          <input className="input" placeholder="Overbite (%)" value={overbite} onChange={(e) => setOverbite(e.target.value)} />
          <input className="input" placeholder="Midline dev (mm)" value={midline} onChange={(e) => setMidline(e.target.value)} />
          <input className="input" placeholder="Crowding U (mm)" value={crowdU} onChange={(e) => setCrowdU(e.target.value)} />
          <input className="input" placeholder="Crowding L (mm)" value={crowdL} onChange={(e) => setCrowdL(e.target.value)} />
          <input className="input" placeholder="Arch length U (mm)" value={archU} onChange={(e) => setArchU(e.target.value)} />
          <input className="input" placeholder="Arch length L (mm)" value={archL} onChange={(e) => setArchL(e.target.value)} />
        </div>
      </div>

      <div className="rounded-xl border p-3">
        <div className="label mb-2">Occlusion</div>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="Class (R): I/II/III" value={occR} onChange={(e) => setOccR(e.target.value)} />
          <input className="input" placeholder="Class (L): I/II/III" value={occL} onChange={(e) => setOccL(e.target.value)} />
          <input className="input" placeholder="Open bite (true/false)" value={openBite} onChange={(e) => setOpenBite(e.target.value)} />
          <input className="input" placeholder="Crossbite (true/false)" value={crossbite} onChange={(e) => setCrossbite(e.target.value)} />
          <input className="input" placeholder="Overjet tendency" value={ojT} onChange={(e) => setOjT(e.target.value)} />
          <input className="input" placeholder="Overbite tendency" value={obT} onChange={(e) => setObT(e.target.value)} />
        </div>
      </div>

      <div className="rounded-xl border p-3">
        <div className="label mb-2">Hygiene</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="input" placeholder="Plaque" value={plaque} onChange={(e) => setPlaque(e.target.value)} />
          <input className="input" placeholder="Calculus" value={calculus} onChange={(e) => setCalculus(e.target.value)} />
          <input className="input" placeholder="Gingival inflammation" value={gingival} onChange={(e) => setGingival(e.target.value)} />
          <input className="input" placeholder="Bleeding on probing" value={bleeding} onChange={(e) => setBleeding(e.target.value)} />
        </div>
      </div>

      <div className="rounded-xl border p-3">
        <label className="label">Recommendations (one per line)</label>
        <textarea
          className="textarea w-full"
          rows={4}
          value={recsText}
          onChange={(e) => setRecsText(e.target.value)}
          placeholder={"• Extract X\n• Hygiene reinforcement\n• Aligners …"}
        />
      </div>

      <div className="rounded-xl border p-3">
        <div className="label mb-2">Final treatment goal</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="input" placeholder="Summary" value={tgSummary} onChange={(e) => setTgSummary(e.target.value)} />
          <input className="input" placeholder="Duration (months)" value={tgDuration} onChange={(e) => setTgDuration(e.target.value)} />
          <textarea
            className="textarea sm:col-span-2"
            rows={3}
            placeholder="Goals (one per line)"
            value={tgGoals}
            onChange={(e) => setTgGoals(e.target.value)}
          />
          <textarea
            className="textarea sm:col-span-2"
            rows={3}
            placeholder="Notes"
            value={tgNotes}
            onChange={(e) => setTgNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
