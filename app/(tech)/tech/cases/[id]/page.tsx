// app/tech/cases/[id]/page.tsx
"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import useCaseDetail from "../../../../../hooks/useCaseDetail";
import useAuthSession from "../../../../../hooks/useAuthSession";

const ReportViewer = dynamic(() => import("./components/ReportViewer"), { ssr: false });
const ImageViewer = dynamic(() => import("./components/ImageViewer"), { ssr: false });
const Comments = dynamic(() => import("./components/Comments"), { ssr: false });

type CaseDetail = {
  case: { id: string; title?: string | null; status?: string | null; assigned_tech?: string | null } | null;
  images?: { storage_path: string; is_original?: boolean | null }[] | null;
  latestReport?: { version?: number | null; payload?: any; narrative?: string | null } | null;
};

export default function TechCaseDetailPage() {
  const router = useRouter();
  const params = useParams();
  const caseId = String((params as any)?.id ?? "");
  const { session, isLoading: authLoading } = useAuthSession();
  const userId = session?.user?.id ?? null;

  const ready = !authLoading && !!caseId;

  const { data, isLoading, error, refresh } = useCaseDetail(ready ? caseId : null, { enabled: ready }) as {
    data: CaseDetail | null;
    isLoading: boolean;
    error: unknown;
    refresh: () => Promise<void>;
  };

  useEffect(() => {
    if (ready) void refresh();
  }, [ready, refresh]);

  const title = data?.case?.title || "Case";
  const status = data?.case?.status || "OPEN";
  const assignedTo = data?.case?.assigned_tech ?? null;

  const latestVersion = typeof data?.latestReport?.version === "number" ? data.latestReport!.version! : 1;

  const firstImage = useMemo(() => {
    return (
      data?.images?.find((i) => i.is_original === false)?.storage_path ||
      data?.images?.[0]?.storage_path ||
      ""
    );
  }, [data?.images]);

  const explicitPdfPath = useMemo(() => {
    const p =
      (data?.latestReport?.payload?.pdf_path as string | undefined) ??
      ((data?.latestReport as any)?.pdf_path as string | undefined);
    return p || undefined;
  }, [data?.latestReport]);

  const forbidden = !authLoading && !isLoading && !error && !!userId && !!assignedTo && assignedTo !== userId;

  useEffect(() => {
    if (forbidden) router.replace("/tech/cases");
  }, [forbidden, router]);

  return (
    <div className="container-page">
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        <Link href="/tech/cases" className="text-[var(--color-muted)] hover:underline">Cases</Link>
        <span className="mx-2 text-[var(--color-muted)]">/</span>
        <span className="text-[var(--color-text)]">{title}</span>
        <span className="ml-2 text-[var(--color-muted)]">({caseId})</span>
      </nav>

      <header className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="muted text-sm">ID: {caseId}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge">{status}</span>
          <span className="badge badge-accent">v{latestVersion}</span>
        </div>
      </header>

      {(isLoading || authLoading) && (
        <div className="space-y-4">
          <div className="skeleton h-[280px] w-full" />
          <div className="skeleton h-[140px] w-full" />
        </div>
      )}

      {!isLoading && !authLoading && !!error && (
        <div
          role="alert"
          className="rounded-2xl border px-4 py-3 text-sm"
          style={{
            background: "color-mix(in oklab, var(--color-danger) 12%, transparent)",
            borderColor: "color-mix(in oklab, var(--color-danger) 55%, var(--border-alpha))",
          }}
        >
          Failed to load case
        </div>
      )}

      {!isLoading && !authLoading && !error && forbidden && (
        <div
          role="alert"
          className="rounded-2xl border px-4 py-3 text-sm"
          style={{
            background: "color-mix(in oklab, var(--color-warning) 12%, transparent)",
            borderColor: "color-mix(in oklab, var(--color-warning) 55%, var(--border-alpha))",
          }}
        >
          You don’t have access to this case. Redirecting to your cases…
        </div>
      )}

      {!isLoading && !authLoading && !error && !forbidden && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <ReportViewer caseId={caseId} version={latestVersion} explicitPath={explicitPdfPath} />
            <div className="space-y-6">
              <ImageViewer path={firstImage} caption="Shared image" />
              <section className="card-lg">
                <h2 className="mb-2 text-base font-semibold">Instructions</h2>
                <ul className="list-inside list-disc text-sm text-[var(--color-text)]/90">
                  <li>Review the shared image and the latest report version.</li>
                  <li>Leave concise, actionable feedback for the dentist.</li>
                  <li>Focus on clarity, missing details, and measurable suggestions.</li>
                </ul>
              </section>
            </div>
          </div>
          <Comments caseId={caseId} targetVersion={latestVersion} canPost onPosted={refresh} />
        </div>
      )}
    </div>
  );
}
