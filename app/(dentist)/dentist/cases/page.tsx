"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, RefreshCcw, ChevronUp, ChevronDown, Eye, Plus } from "lucide-react";
import useCases from "../../../../hooks/useCases";

type CaseRow = {
  id: string;
  title?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type SortKey = "title" | "status" | "created_at";
type SortDir = "asc" | "desc";

export default function DentistCasesPage() {
  const router = useRouter();
  const { items, isLoading, error, refresh, createCase } = useCases();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const rows: CaseRow[] = items || [];

  const result = useMemo(() => {
    const query = q.trim().toLowerCase();

    let out = rows.filter((r) => {
      const matchesText =
        !query ||
        r.id.toLowerCase().includes(query) ||
        (r.title || "").toLowerCase().includes(query) ||
        (r.status || "").toLowerCase().includes(query);

      const matchesStatus = status === "all" ? true : (r.status || "") === status;
      return matchesText && matchesStatus;
    });

    out = out.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const av = (a[sortKey] || "") as string;
      const bv = (b[sortKey] || "") as string;

      if (sortKey === "created_at") {
        return (new Date(av).getTime() - new Date(bv).getTime()) * dir;
      }
      return av.localeCompare(bv) * dir;
    });

    return out;
  }, [rows, q, status, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "created_at" ? "desc" : "asc");
    }
  };

  const onCreateCase = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    const payload: Record<string, unknown> = { title: newTitle.trim() };
    if (newDesc.trim()) payload.description = newDesc.trim();

    const r = await createCase(payload);
    setCreating(false);

    if (r.ok && (r.data as any)?.id) {
      setNewTitle("");
      setNewDesc("");
      router.push(`/dentist/cases/${(r.data as any).id}`);
    } else {
      await refresh();
    }
  };

  const SortIcon = ({ active, dir }: { active: boolean; dir: SortDir }) =>
    active ? (
      dir === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
    ) : (
      <ChevronUp className="h-4 w-4 opacity-40" />
    );

  return (
    <>
      <header className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Cases</h1>
          <p className="text-sm muted">
            {isLoading ? "Loading…" : `${result.length} of ${rows.length} cases`}
          </p>
        </div>

        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
          <button
            className="btn btn-outline inline-flex items-center gap-2"
            onClick={refresh}
            aria-label="Refresh"
          >
            <RefreshCcw className="h-4 w-4" />
            <span>Refresh</span>
          </button>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <input
              type="text"
              placeholder="Case title…"
              className="input sm:w-56"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              aria-label="Case title"
            />
            <input
              type="text"
              placeholder="Description (optional)…"
              className="input sm:w-64"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              aria-label="Case description"
            />
            <button
              className="btn btn-primary inline-flex items-center gap-2"
              onClick={onCreateCase}
              disabled={creating || !newTitle.trim()}
              aria-busy={creating}
              aria-label="Create new case"
              title={newTitle.trim() ? "Create case" : "Enter a title"}
            >
              <Plus className="h-4 w-4" />
              <span>{creating ? "Creating…" : "Create"}</span>
            </button>
          </div>
        </div>
      </header>

      <section className="card-lg w-full">
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          <div className="relative sm:col-span-2">
            <input
              type="search"
              className="input pl-9"
              placeholder="Search by title, id, status…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search cases"
            />
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60" />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="status" className="label m-0">
              Status
            </label>
            <select
              id="status"
              className="select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All</option>
              <option value="DRAFT">DRAFT</option>
              <option value="TECH_REVIEWED">TECH_REVIEWED</option>
              <option value="AI_REBUTTAL">AI_REBUTTAL</option>
              <option value="READY_FOR_SIGN">READY_FOR_SIGN</option>
              <option value="SIGNED">SIGNED</option>
            </select>
          </div>
        </div>

        {isLoading && (
          <div className="space-y-2">
            <div className="skeleton h-9 w-full" />
            <div className="skeleton h-9 w-full" />
            <div className="skeleton h-9 w-3/4" />
          </div>
        )}

        {!isLoading && !!error && (
          <div
            role="alert"
            className="rounded-xl border px-3 py-2 text-sm"
            style={{
              background: "color-mix(in oklab, var(--color-danger) 12%, transparent)",
              borderColor: "color-mix(in oklab, var(--color-danger) 55%, var(--border-alpha))",
            }}
          >
            Failed to load cases
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
                  <th className="w-[46%]">
                    <button
                      className="inline-flex items-center gap-1"
                      onClick={() => onSort("title")}
                      aria-label="Sort by title"
                    >
                      Title <SortIcon active={sortKey === "title"} dir={sortDir} />
                    </button>
                  </th>
                  <th className="w-[18%]">
                    <button
                      className="inline-flex items-center gap-1"
                      onClick={() => onSort("status")}
                      aria-label="Sort by status"
                    >
                      Status <SortIcon active={sortKey === "status"} dir={sortDir} />
                    </button>
                  </th>
                  <th className="w-[24%]">
                    <button
                      className="inline-flex items-center gap-1"
                      onClick={() => onSort("created_at")}
                      aria-label="Sort by created date"
                    >
                      Created <SortIcon active={sortKey === "created_at"} dir={sortDir} />
                    </button>
                  </th>
                  <th className="w-[12%]">Open</th>
                </tr>
              </thead>
              <tbody>
                {result.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/dentist/cases/${r.id}`)}
                    aria-label={`Open ${r.title || r.id}`}
                  >
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
                      <button
                        className="btn btn-primary inline-flex items-center gap-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/dentist/cases/${r.id}`);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {result.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6">
                      <div className="empty">
                        <div className="h-8 w-8 rounded-xl bg-white/5" />
                        <p>No results</p>
                        <p className="text-sm muted">Try a different search or status.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
