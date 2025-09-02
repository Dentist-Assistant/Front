"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Badge from "../../../../components/Badge";
import Spinner from "../../../../components/Spinner";
import useCases from "../../../../hooks/useCases";
import useAuthSession from "../../../../hooks/useAuthSession";

type CaseItem = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  patient_name?: string | null;
  assigned_to?: string | null;
};

type UseCasesReturn = {
  data?: CaseItem[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

const STATUS = [
  { value: "", label: "All" },
  { value: "DRAFT", label: "Draft" },
  { value: "TECH_REVIEWED", label: "Tech reviewed" },
  { value: "AI_REBUTTAL", label: "AI rebuttal" },
  { value: "READY_FOR_SIGN", label: "Ready for sign" },
  { value: "SIGNED", label: "Signed" },
];

export default function TechCasesPage() {
  const { session } = useAuthSession();
  const userId = session?.user?.id ?? null;

  const { data, isLoading, isError } = (useCases() as unknown) as UseCasesReturn;

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const filtered = useMemo(() => {
    const list = Array.isArray(data) ? data : [];
    const qn = q.trim().toLowerCase();

    return list
      .filter((c) => (userId ? c.assigned_to === userId : true))
      .filter((c) => (status ? c.status === status : true))
      .filter((c) => {
        if (!qn) return true;
        const hay = `${c.title ?? ""} ${c.patient_name ?? ""}`.toLowerCase();
        return hay.includes(qn);
      })
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, [data, q, status, userId]);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">My cases</h1>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <input
            className="input w-full sm:w-64"
            placeholder="Search by patient or title"
            aria-label="Search by patient or title"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="input w-44"
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <section className="card-lg p-0">
        <div className="overflow-x-auto">
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
                      <Spinner />
                      <span>Loading cases…</span>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && isError && (
                <tr>
                  <td colSpan={5} className="px-4 py-12">
                    <div className="empty">
                      <div className="h-8 w-8 rounded-xl bg-white/5" />
                      <p>Could not load cases</p>
                      <p className="text-sm muted">Please refresh or try again later.</p>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && !isError && filtered.length === 0 && (
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

              {!isLoading &&
                !isError &&
                filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="group border-t/5 hover:bg-white/5 focus-within:bg-white/5"
                  >
                    <td className="px-4 py-3">{c.patient_name || "—"}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/tech/cases/${c.id}`}
                        className="text-[var(--color-text)] underline-offset-4 hover:underline focus:underline"
                      >
                        {c.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge>{c.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/tech/cases/${c.id}`}
                        className="btn"
                        aria-label={`Open case ${c.title}`}
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
