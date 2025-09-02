"use client";

import Link from "next/link";
import { useMemo } from "react";
import { RefreshCcw } from "lucide-react";
import useCases from "../../../hooks/useCases";

export default function DentistHomePage() {
  const { items, isLoading, error, refresh } = useCases();

  const rows = items || [];

  const stats = useMemo(() => {
    const total = rows.length;
    const draft = rows.filter((r) => (r.status || "DRAFT") === "DRAFT").length;
    const ready = rows.filter((r) => r.status === "READY_FOR_SIGN").length;
    const signed = rows.filter((r) => r.status === "SIGNED").length;
    return { total, draft, ready, signed };
  }, [rows]);

  const recent = useMemo(
    () =>
      [...rows]
        .sort(
          (a, b) =>
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
        )
        .slice(0, 5),
    [rows]
  );

  return (
    <>
      <section className="card-lg w-full">
        <div className="mb-4 flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-center sm:text-left">
            <h2 className="text-lg font-semibold">Overview</h2>
            <p className="muted text-sm">Your case activity at a glance</p>
          </div>
          <button
            onClick={refresh}
            className="btn btn-primary inline-flex items-center gap-2"
            aria-label="Refresh overview"
          >
            <RefreshCcw className="h-4 w-4" />
            <span>Refresh</span>
          </button>
        </div>

        {isLoading && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="skeleton h-24 w-full" />
            <div className="skeleton h-24 w-full" />
            <div className="skeleton h-24 w-full" />
            <div className="skeleton h-24 w-full" />
          </div>
        )}

        {!isLoading && !!error && (
          <div
            role="alert"
            className="mt-2 rounded-2xl border px-4 py-3 text-sm"
            style={{
              background:
                "color-mix(in oklab, var(--color-danger) 12%, transparent)",
              borderColor:
                "color-mix(in oklab, var(--color-danger) 55%, var(--border-alpha))",
            }}
          >
            Failed to load overview
          </div>
        )}

        {!isLoading && !error && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total" value={stats.total} />
            <StatCard label="Draft" value={stats.draft} />
            <StatCard label="Ready to sign" value={stats.ready} accent />
            <StatCard label="Signed" value={stats.signed} />
          </div>
        )}
      </section>

      <section className="card-lg w-full mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Recent cases</h3>
          <Link
            className="text-sm text-[var(--color-primary)] underline-offset-4 hover:underline"
            href="/dentist/cases"
          >
            View all
          </Link>
        </div>

        {isLoading && (
          <div className="space-y-2">
            <div className="skeleton h-9 w-full" />
            <div className="skeleton h-9 w-full" />
            <div className="skeleton h-9 w-3/4" />
          </div>
        )}

        {!isLoading && !error && rows.length === 0 && (
          <div className="empty">
            <div className="h-8 w-8 rounded-xl bg-white/5" />
            <p>No cases yet</p>
            <p className="text-sm muted">Create a case to get started.</p>
          </div>
        )}

        {!isLoading && !error && rows.length > 0 && (
          <div className="relative overflow-hidden rounded-xl border">
            <table className="table">
              <thead className="sticky top-0 bg-[var(--color-surface)]/80 backdrop-blur">
                <tr>
                  <th>Title</th>
                  <th className="w-[22%]">Status</th>
                  <th className="w-[28%]">Created</th>
                  <th className="w-[12%]">Open</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">
                      <div className="truncate">{r.title || "Untitled case"}</div>
                      <div className="muted text-xs">{r.id}</div>
                    </td>
                    <td>
                      <span className="badge">{r.status || "DRAFT"}</span>
                    </td>
                    <td className="text-sm">
                      {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                    </td>
                    <td>
                      <Link
                        href={`/dentist/cases/${r.id}`}
                        className="btn btn-primary"
                        aria-label={`Open case ${r.title || r.id}`}
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        background: accent
          ? "color-mix(in oklab, var(--color-accent) 6%, var(--color-surface))"
          : "var(--color-surface)",
      }}
    >
      <p className="muted text-sm">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
