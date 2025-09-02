// app/(dentist)/dentist/cases/[id]/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import ImageViewer from "./components/ImageViewer";
import FindingsTable, { type ToothFindingRow } from "./components/FindingsTable";
import Comments from "./components/Comments";
import ActionsBar from "./components/ActionsBar";
import ReviewPacketBuilder from "./components/ReviewPacketBuilder";
import UploadImages from "./components/UploadImages";
import FeedbackPanel from "./components/FeedbackPanel";
import ImageGallerySelector, { type GalleryItem, type ChangePayload } from "./components/ImageGallerySelector";
import ReviewPacketPreviewDialog from "./components/ReviewPacketPreviewDialog";
import StructuredReport from "./components/StructuredReport";
import StructuredReportEditor from "./components/StructuredReportEditor";

import useCaseDetail from "../../../../../hooks/useCaseDetail";
import { getSupabaseBrowser } from "../../../../../lib/supabaseBrowser";

type CaseDetail = {
  case: { id: string; title?: string | null; status?: string | null } | null;
  images?: { storage_path: string; is_original?: boolean | null }[] | null;
  latestReport?: {
    version?: number | null;
    payload?: any;
    narrative?: string | null;
  } | null;
};

type Point = { x: number; y: number; norm?: boolean };
type Circle = { cx: number; cy: number; r: number; norm?: boolean };
type Line = { x1: number; y1: number; x2: number; y2: number; norm?: boolean };
type Polygon = { points: Point[]; norm?: boolean };
type Box = { x: number; y: number; w: number; h: number; norm?: boolean };
type Geometry = { circles?: Circle[]; lines?: Line[]; polygons?: Polygon[]; boxes?: Box[] };

export default function CaseDetailPage() {
  const params = useParams();
  const caseId = String((params as any)?.id ?? "");

  const hook = useCaseDetail(caseId) as unknown as {
    data: CaseDetail | null;
    isLoading: boolean;
    error: unknown;
    refresh: () => Promise<void>;
  };

  const { data, isLoading, error } = hook;
  const refetch: () => Promise<void> = hook.refresh;

  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryOrder, setGalleryOrder] = useState<string[]>([]);
  const [galleryPrimaryId, setGalleryPrimaryId] = useState<string | null>(null);
  const [galleryPrimaryIndex, setGalleryPrimaryIndex] = useState<number | null>(null);

  useEffect(() => {
    const run = async () => {
      const list = (data?.images ?? []).map((row) => row.storage_path).filter(Boolean) as string[];
      if (list.length === 0) {
        setGalleryItems([]);
        setGalleryOrder([]);
        setGalleryPrimaryId(null);
        setGalleryPrimaryIndex(null);
        return;
      }

      const signed = await Promise.all(
        list.map(async (path) => {
          try {
            const res = await fetch(`/api/storage/sign?path=${encodeURIComponent(path)}`);
            const j = (await res.json().catch(() => ({}))) as { url?: string; signedUrl?: string };
            const url = j.url || j.signedUrl || "";
            return { id: path, url, caption: path } as GalleryItem;
          } catch {
            return { id: path, url: "", caption: path } as GalleryItem;
          }
        })
      );

      const filtered = signed.filter((s) => s.url);
      setGalleryItems(filtered);
      setGalleryOrder(filtered.map((i) => i.id));
      setGalleryPrimaryId(filtered[0]?.id ?? null);
      setGalleryPrimaryIndex(filtered.length ? 0 : null);
    };
    run();
  }, [data?.images?.length]);

  const goPrev = () => {
    if (!galleryOrder.length || galleryPrimaryIndex == null) return;
    const nextIdx = (galleryPrimaryIndex - 1 + galleryOrder.length) % galleryOrder.length;
    setGalleryPrimaryId(galleryOrder[nextIdx]);
    setGalleryPrimaryIndex(nextIdx);
  };

  const goNext = () => {
    if (!galleryOrder.length || galleryPrimaryIndex == null) return;
    const nextIdx = (galleryPrimaryIndex + 1) % galleryOrder.length;
    setGalleryPrimaryId(galleryOrder[nextIdx]);
    setGalleryPrimaryIndex(nextIdx);
  };

  const handleGalleryChange = (p: ChangePayload) => {
    setGalleryOrder(p.orderIds);
    setGalleryPrimaryId(p.primaryId);
    setGalleryPrimaryIndex(p.primaryIndex);
  };

  const currentPath: string = (galleryPrimaryId as string) || data?.images?.[0]?.storage_path || "";

  const [shareSelection, setShareSelection] = useState<{ version: number; images: string[] }>({
    version: 1,
    images: [],
  });

  const handleSelectionChange = useCallback((v: { version: number; images: string[] }) => {
    setShareSelection(v);
  }, []);

  const title = data?.case?.title || "Case";
  const status = data?.case?.status || "DRAFT";

  const latestVersion =
    typeof data?.latestReport?.version === "number" ? (data!.latestReport!.version as number) : 1;

  useEffect(() => {
    setShareSelection((s) => ({ ...s, version: latestVersion || 1 }));
  }, [latestVersion]);

  const [draftBusy, setDraftBusy] = useState(false);
  const runDraft = async () => {
    if (draftBusy) return;
    setDraftBusy(true);
    try {
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Unauthorized");

      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ caseId }),
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "AI draft failed");

      await refetch();
    } catch (e: any) {
      alert(e?.message || "Draft failed");
    } finally {
      setDraftBusy(false);
    }
  };

  const payload = useMemo(
    () => (data?.latestReport?.payload ? data.latestReport.payload : {}),
    [data?.latestReport?.payload]
  );

  const rawFindings: Array<{
    tooth_fdi: number;
    findings: string[];
    severity?: string | null;
    confidence?: number | null;
    image_index?: number | null;
    image_id?: string | null;
    geometry?: Geometry | null;
  }> = useMemo(() => {
    const arr = Array.isArray(payload?.findings) ? payload.findings : [];
    return arr || [];
  }, [payload?.findings]);

  const manifest = useMemo(() => {
    type ManifestItem = { index: number; id: string; url: string; path?: string };
    const imgs: any[] = Array.isArray(payload?.images) ? payload.images : [];
    const list: ManifestItem[] = imgs.map((x: any, i: number) => ({
      index: typeof x?.index === "number" ? x.index : i,
      id: String(x?.id ?? x?.path ?? x?.storage_path ?? ""),
      url: String(x?.url ?? ""),
      path: typeof x?.path === "string" ? x.path : typeof x?.storage_path === "string" ? x.storage_path : undefined,
    }));
    const byId = new Map<string, number>();
    list.forEach((it: ManifestItem) => {
      if (it.id) byId.set(it.id, it.index);
    });
    return { list, byId };
  }, [payload?.images]);

  const findingsRows = useMemo<ToothFindingRow[]>(() => {
    return rawFindings.map((r) => {
      const idxFromId = r.image_id ? manifest.byId.get(r.image_id) : undefined;
      const idx =
        typeof r.image_index === "number" && Number.isInteger(r.image_index) ? r.image_index : idxFromId ?? 0;
      const found = manifest.list.find((m) => m.index === idx);
      const id = typeof r.image_id === "string" && r.image_id ? r.image_id : found?.id || "";
      return {
        tooth_fdi: r.tooth_fdi,
        findings: Array.isArray(r.findings) ? r.findings : [],
        severity: r.severity ?? null,
        confidence: r.confidence ?? null,
        image_index: idx,
        image_id: id,
        geometry: r.geometry ?? null,
      };
    });
  }, [rawFindings, manifest.byId, manifest.list]);

  const overlayIndexMap = useMemo(() => {
    const m = new Map<string, number[]>();
    rawFindings.forEach((f, i) => {
      const idxFromId = f.image_id ? manifest.byId.get(f.image_id) : undefined;
      const idx = typeof f.image_index === "number" ? f.image_index : idxFromId ?? 0;
      const key = `${idx}:${f.tooth_fdi}`;
      const arr = m.get(key) || [];
      arr.push(i);
      m.set(key, arr);
    });
    return m;
  }, [rawFindings, manifest.byId]);

  const [shareOpen, setShareOpen] = useState(false);

  const versions = useMemo(
    () => Array.from({ length: Math.max(1, latestVersion) }, (_, i) => i + 1),
    [latestVersion]
  );

  const imagesForDialog = useMemo(
    () =>
      galleryItems.map((i) => ({
        id: i.id,
        path: i.id,
        url: i.url,
        caption: i.caption ?? null,
      })),
    [galleryItems]
  );

  const handleSendPacket = async ({
    caseId,
    version,
    images,
  }: {
    caseId: string;
    version: number;
    images: string[];
  }) => {
    const supabase = getSupabaseBrowser();
    const { data: auth } = await supabase.auth.getSession();
    const token = auth?.session?.access_token;
    if (!token) return { ok: false, error: "Unauthorized" };

    const res = await fetch("/api/review-packets/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        caseId,
        reportVersion: version,
        imagePaths: images,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return { ok: false, error: j?.details || j?.error || "Send failed" };
    }
    return { ok: true };
  };

  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [showOverlays, setShowOverlays] = useState<boolean>(true);
  const [allForImage, setAllForImage] = useState<boolean>(true);
  const [annotateBusy, setAnnotateBusy] = useState<boolean>(false);
  const [annotatedPath, setAnnotatedPath] = useState<string | null>(null);

  const handleSelectFromTable = useCallback(
    (_overlayId: string | number, row: ToothFindingRow) => {
      if (!row) return;
      const key = `${row.image_index}:${row.tooth_fdi}`;
      const idxs = overlayIndexMap.get(key) || [];
      if (idxs.length) setSelectedRows(idxs.slice(0, 10));
      setShowOverlays(true);
    },
    [overlayIndexMap]
  );

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      if (!showOverlays || !currentPath) {
        setAnnotatedPath(null);
        return;
      }

      const onImageFindings = rawFindings
        .map((f, idx) => ({ ...f, __idx: idx }))
        .filter((f) => {
          if (f.image_id && f.image_id === currentPath) return true;
          if (typeof f.image_index === "number" && galleryPrimaryIndex != null) return f.image_index === galleryPrimaryIndex;
          return false;
        })
        .filter((f) => f.geometry && Object.keys(f.geometry || {}).length > 0);

      if (onImageFindings.length === 0) {
        setAnnotatedPath(null);
        return;
      }

      const picked = allForImage
        ? onImageFindings
        : onImageFindings.filter((f) => selectedRows.includes(f.__idx as number));

      if (picked.length === 0) {
        setAnnotatedPath(null);
        return;
      }

      setAnnotateBusy(true);
      try {
        const overlays = picked.map((f, i) => ({
          finding_index: (f.__idx as number) + 1,
          label: String(i + 1),
          color:
            String(f.severity || "low").toLowerCase().includes("high")
              ? "#FF3B30"
              : String(f.severity || "low").toLowerCase().includes("mod")
              ? "#FF9500"
              : "#34C759",
          geometry: f.geometry,
        }));

        const res = await fetch("/api/images/annotate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caseId,
            basePath: currentPath,
            format: "webp",
            alpha: 1,
            strokeWidth: 3,
            overlays,
          }),
        });

        const jr = await res.json().catch(() => ({}));
        if (!res.ok || !jr?.output?.path) {
          setAnnotatedPath(null);
          return;
        }

        if (ignore) return;
        setAnnotatedPath(jr.output.path as string);
      } catch {
        if (!ignore) setAnnotatedPath(null);
      } finally {
        if (!ignore) setAnnotateBusy(false);
      }
    };
    run();
    return () => {
      ignore = true;
    };
  }, [showOverlays, allForImage, selectedRows.join(","), currentPath, galleryPrimaryIndex, rawFindings, caseId]);

  const viewerPath = useMemo(() => {
    if (showOverlays && annotatedPath) return annotatedPath;
    return currentPath;
  }, [showOverlays, annotatedPath, currentPath]);

  const summaryText: string = useMemo(() => {
    return typeof payload?.summary === "string" && payload.summary.trim()
      ? payload.summary
      : data?.latestReport?.narrative || "";
  }, [payload?.summary, data?.latestReport?.narrative]);

  const [showEditor, setShowEditor] = useState(false);

  return (
    <div className="container-page">
      <nav className="mb-3 text-sm muted" aria-label="Breadcrumb">
        <ol className="flex items-center gap-2">
          <li>
            <Link href="/dentist/cases" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
              <ChevronLeft className="h-4 w-4" />
              Cases
            </Link>
          </li>
          <li>/</li>
          <li className="truncate text-[var(--color-text)]" title={title || caseId}>
            {title || caseId}
          </li>
        </ol>
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

      {isLoading && (
        <div className="space-y-4" aria-busy="true" aria-live="polite">
          <div className="skeleton h-[280px] w-full" />
          <div className="skeleton h-[200px] w-full" />
          <div className="skeleton h-[120px] w-full" />
        </div>
      )}

      {!isLoading && !!error && (
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

      {!isLoading && !error && (
        <div className="space-y-6">
          <UploadImages caseId={caseId} onUploaded={refetch} />

          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-12">
              <ImageGallerySelector
                items={galleryItems}
                primaryId={galleryPrimaryId ?? undefined}
                onChange={handleGalleryChange}
              />

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={showOverlays}
                      onChange={(e) => setShowOverlays(e.target.checked)}
                    />
                    Show overlays
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={allForImage}
                      onChange={(e) => setAllForImage(e.target.checked)}
                      disabled={!showOverlays}
                    />
                    All findings for this image
                  </label>
                  {annotateBusy && <span className="text-xs muted">Annotating…</span>}
                </div>
                <div className="text-sm muted">
                  {galleryOrder.length > 0 && galleryPrimaryIndex != null
                    ? `Image ${galleryPrimaryIndex + 1} / ${galleryOrder.length}`
                    : "No image"}
                </div>
              </div>

              <div className="mt-3">
                <ImageViewer
                  path={viewerPath}
                  caption={showOverlays && annotatedPath ? "Preview (annotated)" : "Preview"}
                />
              </div>

              <div className="mt-3 flex items-center justify-between">
                <button
                  className="btn btn-ghost"
                  onClick={goPrev}
                  disabled={!galleryOrder.length || galleryPrimaryIndex == null}
                >
                  ← Prev
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={goNext}
                  disabled={!galleryOrder.length || galleryPrimaryIndex == null}
                >
                  Next →
                </button>
              </div>
            </div>

            <div className="lg:col-span-12">
              <div className="rounded-2xl border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Structured Report</h2>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => setShowEditor((v) => !v)}
                  >
                    {showEditor ? "Hide editor" : "Edit report"}
                  </button>
                </div>
                <StructuredReport
                  payload={payload}
                  images={galleryItems.map((g, i) => ({
                    id: g.id,
                    url: g.url,
                    path: g.id,
                    caption: g.caption ?? undefined,
                    index: i,
                  }))}
                />
              </div>

              {showEditor && (
                <div className="mt-4 rounded-2xl border p-4">
                  <StructuredReportEditor caseId={caseId} initial={payload} onSaved={refetch} />
                </div>
              )}
            </div>

            <div className="lg:col-span-12">
              <div className="rounded-2xl border p-4">
                <FindingsTable
                  rows={findingsRows}
                  onSelectFinding={handleSelectFromTable}
                  onRunDraft={runDraft}
                  draftBusy={draftBusy}
                />
              </div>
            </div>
          </div>

          <ReviewPacketBuilder
            caseId={caseId}
            onSelectionChange={handleSelectionChange}
            onOpenShare={() => setShareOpen(true)}
          />

          <FeedbackPanel
            caseId={caseId}
            latestReportVersion={latestVersion}
            initialFeedback=""
            onAfterRebuttal={async () => {
              await refetch();
            }}
          />

          <ActionsBar
            caseId={caseId}
            caseTitle={title}
            latestReportVersion={shareSelection.version}
            latestReport={
              data?.latestReport
                ? {
                    narrative: data.latestReport.narrative ?? null,
                    payload: data.latestReport.payload ?? undefined,
                  }
                : null
            }
            imagesToShare={shareSelection.images}
            onAfterAction={refetch}
          />

          <Comments
            caseId={caseId}
            targetVersion={latestVersion}
            canPost
            onPosted={refetch}
          />
        </div>
      )}

      <ReviewPacketPreviewDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        caseId={caseId}
        images={imagesForDialog}
        availableVersions={versions}
        defaultSelectedVersion={shareSelection.version}
        defaultSelectedImages={shareSelection.images}
        onSend={handleSendPacket}
      />
    </div>
  );
}

function fmtNum(n: unknown, unit: string) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : null;
  return v === null ? "—" : `${v.toFixed(2)} ${unit}`;
}
function fmtStr(s: unknown) {
  const v = typeof s === "string" && s.trim() ? s.trim() : null;
  return v ?? "—";
}
function fmtBool(b: unknown) {
  if (b === true) return "Yes";
  if (b === false) return "No";
  return "—";
}
