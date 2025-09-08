"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Badge from "../../../../components/Badge";
import Spinner from "../../../../components/Spinner";
import { Search as SearchIcon, RefreshCcw, Eye, FileText, CheckCircle2, ClipboardList } from "lucide-react";

type Row = {
  case_id: string;
  title: string;
  status: string;
  created_at: string;
  patient_name?: string | null;
  assigned_tech?: string | null;
  packet_status: "OPEN" | "CLOSED";
  packet_created_at: string;
};

const STATUS = [
  { value: "", label: "All" },
  { value: "DRAFT", label: "Draft" },
  { value: "TECH_REVIEWED", label: "Tech reviewed" },
  { value: "AI_REBUTTAL", label: "AI rebuttal" },
  { value: "READY_FOR_SIGN", label: "Ready for sign" },
  { value: "SIGNED", label: "Signed" },
];

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const HDRS = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };

export default function TechCasesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [assignedOnly, setAssignedOnly] = useState(false);
  const [showClosedPackets, setShowClosedPackets] = useState(false);

  const refresh = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const statusFilter = showClosedPackets ? "" : "&status=eq.OPEN";
      const rpRes = await fetch(
        `${SUPA_URL}/rest/v1/review_packets?select=id,case_id,status,created_at&order=created_at.desc${statusFilter}`,
        { headers: HDRS }
      );
      if (!rpRes.ok) throw new Error(await rpRes.text());
      const packets = (await rpRes.json()) as Array<{
        id: string;
        case_id: string;
        status: "OPEN" | "CLOSED";
        created_at: string;
      }>;
      if (!packets.length) {
        setRows([]);
        setIsLoading(false);
        return;
      }

      const caseIds = Array.from(new Set(packets.map(p => p.case_id)));
      const casesRes = await fetch(
        `${SUPA_URL}/rest/v1/cases?select=id,title,status,created_at,assigned_tech,patient_id&id=in.(${caseIds.join(",")})`,
        { headers: HDRS }
      );
      if (!casesRes.ok) throw new Error(await casesRes.text());
      const cases = (await casesRes.json()) as Array<{
        id: string;
        title: string | null;
        status: string | null;
        created_at: string | null;
        assigned_tech: string | null;
        patient_id: string | null;
      }>;

      const patientIds = Array.from(new Set(cases.map(c => c.patient_id).filter(Boolean))) as string[];
      let patientsById: Record<string, { name: string | null }> = {};
      if (patientIds.length) {
        const patsRes = await fetch(
          `${SUPA_URL}/rest/v1/patients?select=id,name&id=in.(${patientIds.join(",")})`,
          { headers: HDRS }
        );
        if (patsRes.ok) {
          const pats = (await patsRes.json()) as Array<{ id: string; name: string | null }>;
          patientsById = Object.fromEntries(pats.map(p => [p.id, { name: p.name ?? null }]));
        }
      }

      const latestByCase = new Map<string, { packet_status: "OPEN" | "CLOSED"; packet_created_at: string }>();
      for (const p of packets) {
        const prev = latestByCase.get(p.case_id);
        if (!prev || new Date(p.created_at).getTime() > new Date(prev.packet_created_at).getTime()) {
          latestByCase.set(p.case_id, { packet_status: p.status, packet_created_at: p.created_at });
        }
      }

      const merged: Row[] = cases
        .map(c => {
          const pkt = latestByCase.get(c.id);
          const fallbackDate = c.created_at ?? new Date().toISOString();
          return {
            case_id: c.id,
            title: c.title ?? "Untitled case",
            status: c.status ?? "DRAFT",
            created_at: c.created_at ?? pkt?.packet_created_at ?? fallbackDate,
            patient_name: c.patient_id ? patientsById[c.patient_id]?.name ?? null : null,
            assigned_tech: c.assigned_tech ?? null,
            packet_status: pkt?.packet_status ?? "OPEN",
            packet_created_at: pkt?.packet_created_at ?? fallbackDate,
          };
        })
        .sort((a, b) => new Date(b.packet_created_at).getTime() - new Date(a.packet_created_at).getTime());

      setRows(merged);
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    refresh();
  }, [showClosedPackets]);

  const filtered = useMemo((): Row[] => {
    const qn = q.trim().toLowerCase();
    return rows
      .filter(r => (assignedOnly ? !!r.assigned_tech : true))
      .filter(r => (status ? r.status === status : true))
      .filter(r => {
        if (!qn) return true;
        const hay = `${r.title ?? ""} ${r.patient_name ?? ""}`.toLowerCase();
        return hay.includes(qn) || r.case_id.toLowerCase().includes(qn);
      });
  }, [rows, q, status, assignedOnly]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const by = (s: string) => filtered.filter(c => c.status === s).length;
    return { total, draft: by("DRAFT"), tech: by("TECH_REVIEWED"), ready: by("READY_FOR_SIGN"), signed: by("SIGNED") };
  }, [filtered]);

  return (
    <div className="w-full space-y-6">
     <div className="rounded-2xl border bg-[var(--color-surface)]/60 px-5 py-4 backdrop-blur">
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">My cases</h1>
        <p className="text-sm muted">{isLoading ? "Loading…" : `${filtered.length} of ${rows.length} shared cases`}</p>
      </div>
      <button
        className="btn btn-outline inline-flex items-center gap-2 self-start sm:self-auto"
        onClick={refresh}
        disabled={isLoading}
        aria-label="Refresh"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="M21 12a9 9 0 1 1-2.64-6.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        <span>Refresh</span>
      </button>
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <div className="relative">
  <input
    className="input w-full" 
    placeholder="Search by patient, title, or ID"
    aria-label="Search"
    value={q}
    onChange={(e) => setQ(e.target.value)}
  />
</div>

      <select
        className="select w-full"
        aria-label="Filter by status"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
      >
        {STATUS.map(s => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>


    </div>
  </div>
</div>


    

      <section className="card-lg p-0 w-full">
        <div className="hidden sm:block overflow-x-auto w-full">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--color-surface)]/80 backdrop-blur">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium sr-only">Open</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10">
                    <div className="flex items-center justify-center gap-3">
                      <Spinner /><span>Loading cases…</span>
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && !!errorMsg && (
                <tr>
                  <td colSpan={5} className="px-4 py-12">
                    <div className="empty">
                      <div className="h-8 w-8 rounded-xl bg-white/5" />
                      <p>Could not load cases</p>
                      <p className="text-sm muted">{errorMsg}</p>
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && !errorMsg && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-16">
                    <div className="empty">
                      <div className="h-8 w-8 rounded-xl bg-white/5" />
                      <p>No cases found</p>
                      <p className="text-sm muted">Adjust filters or clear the search.</p>
                    </div>
                  </td>
                </tr>
              )}
              {!isLoading && !errorMsg && filtered.map(c => (
                <tr key={c.case_id} className="group border-t/5 hover:bg-white/5 focus-within:bg-white/5">
                  <td className="px-4 py-3">{c.patient_name || "—"}</td>
                  <td className="px-4 py-3">
                    <Link href={`/tech/cases/${c.case_id}`} className="text-[var(--color-text)] underline-offset-4 hover:underline focus:underline">
                      {c.title || "Untitled case"}
                    </Link>
                  </td>
                  <td className="px-4 py-3"><Badge>{c.status}</Badge></td>
                  <td className="px-4 py-3">{new Date(c.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/tech/cases/${c.case_id}`} className="btn inline-flex items-center gap-2" aria-label={`Open case ${c.title || c.case_id}`}>
                      <Eye className="h-4 w-4" /><span>Open</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sm:hidden divide-y divide-white/5">
          {isLoading && (
            <div className="px-4 py-10">
              <div className="flex items-center justify-center gap-3">
                <Spinner /><span>Loading cases…</span>
              </div>
            </div>
          )}
          {!isLoading && !errorMsg && filtered.length === 0 && (
            <div className="px-4 py-12">
              <div className="empty">
                <div className="h-8 w-8 rounded-xl bg-white/5" />
                <p>No cases found</p>
                <p className="text-sm muted">Adjust filters or clear the search.</p>
              </div>
            </div>
          )}
          {!isLoading && !errorMsg && filtered.map(c => (
            <Link key={c.case_id} href={`/tech/cases/${c.case_id}`} className="block p-4 hover:bg-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{c.title || "Untitled case"}</div>
                  <div className="muted text-xs">{c.patient_name || "—"}</div>
                </div>
                <Badge>{c.status}</Badge>
              </div>
              <div className="mt-2 text-xs muted">{new Date(c.created_at).toLocaleString()}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
