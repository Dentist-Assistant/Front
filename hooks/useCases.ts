// hooks/useCases.ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "../lib/supabaseBrowser";

export type CaseListItem = {
  id: string;
  title: string | null;
  status: string | null;
  created_at: string;
  assigned_tech: string | null;
  images_count: number;
};

type SortKey = "created_at_desc" | "created_at_asc";
type StatusFilter = "all" | string;

type State = {
  items: CaseListItem[];
  total: number;
  isLoading: boolean;
  error: string | null;
};

type Options = {
  pageSize?: number;
  initialStatus?: StatusFilter;
  initialQuery?: string;
  initialSort?: SortKey;
};

type QueryRow = {
  id: string;
  title: string | null;
  status: string | null;
  created_at: string;
  assigned_tech: string | null;
  images: { id: string }[] | null;
};

export default function useCases(options?: Options) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(options?.pageSize ?? 10);
  const [query, setQuery] = useState<string>(options?.initialQuery ?? "");
  const [status, setStatus] = useState<StatusFilter>(options?.initialStatus ?? "all");
  const [sort, setSort] = useState<SortKey>(options?.initialSort ?? "created_at_desc");
  const [state, setState] = useState<State>({ items: [], total: 0, isLoading: true, error: null });
  const [refreshTick, setRefreshTick] = useState<number>(0);

  const fetchList = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = supabase
      .from("cases")
      .select(
        `
        id,
        title,
        status,
        created_at,
        assigned_tech,
        images:case_images(id)
      `,
        { count: "exact" }
      );

    if (query.trim().length > 0) {
      q = q.ilike("title", `%${query.trim()}%`);
    }
    if (status !== "all") {
      q = q.eq("status", status);
    }

    q = q.order("created_at", { ascending: sort === "created_at_asc" }).range(from, to);

    const { data, error, count } = await (q as unknown as Promise<{
      data: QueryRow[] | null;
      error: { message: string } | null;
      count: number | null;
    }>);

    if (error) {
      setState({ items: [], total: 0, isLoading: false, error: error.message });
      return;
    }

    const items: CaseListItem[] = (data ?? []).map((row: QueryRow) => ({
      id: String(row.id),
      title: row.title ?? null,
      status: row.status ?? null,
      created_at: String(row.created_at),
      assigned_tech: row.assigned_tech ?? null,
      images_count: Array.isArray(row.images) ? row.images.length : 0,
    }));

    setState({ items, total: count ?? 0, isLoading: false, error: null });
  }, [page, pageSize, query, status, sort, supabase]);

  useEffect(() => {
    fetchList();
  }, [fetchList, refreshTick]);

  const totalPages = useMemo(() => {
    if (pageSize <= 0) return 1;
    return Math.max(1, Math.ceil(state.total / pageSize));
  }, [state.total, pageSize]);

  const setSearch = useCallback((next: string) => {
    setQuery(next);
    setPage(1);
  }, []);

  const setStatusFilter = useCallback((next: StatusFilter) => {
    setStatus(next);
    setPage(1);
  }, []);

  const setSortKey = useCallback((next: SortKey) => {
    setSort(next);
    setPage(1);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshTick((t) => t + 1);
  }, []);

  const createCase = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/cases/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false as const, error: text || "Request failed" };
      }
      const data = await res.json();
      await refresh();
      return { ok: true as const, data };
    },
    [refresh]
  );

  return {
    items: state.items,
    total: state.total,
    isLoading: state.isLoading,
    error: state.error,
    page,
    pageSize,
    totalPages,
    setPage,
    setPageSize,
    search: query,
    setSearch,
    status,
    setStatus: setStatusFilter,
    sort,
    setSort: setSortKey,
    refresh,
    createCase,
    isEmpty: !state.isLoading && state.items.length === 0,
  };
}
  