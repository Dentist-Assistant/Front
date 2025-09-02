// app/dentist/cases/[id]/components/ReviewPacketBuilder.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "../../../../../../lib/supabaseBrowser";

type ImgRow = {
  id: string;
  storage_path: string;
  is_original: boolean | null;
  is_annotated?: boolean | null;
  variant?: string | null;
  created_at?: string | null;
};

type ReportRow = { version: number };

type Props = {
  caseId: string;
  onSelectionChange?: (v: { version: number; images: string[] }) => void;
  onOpenShare?: () => void;
};

function isAnnotated(row: ImgRow): boolean {
  if (row.is_annotated === true) return true;
  if (typeof row.variant === "string" && row.variant.toLowerCase() === "annotated") return true;
  const p = row.storage_path || "";
  return /(^|\/)annotated\//i.test(p);
}

async function signPath(path: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/storage/sign?path=${encodeURIComponent(path)}`);
    const j = (await res.json().catch(() => ({}))) as { url?: string; signedUrl?: string };
    return j.url || j.signedUrl || null;
  } catch {
    return null;
  }
}

async function signMany(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  try {
    const q = encodeURIComponent(JSON.stringify(paths));
    const res = await fetch(`/api/storage/sign?paths=${q}`);
    const j = (await res.json().catch(() => ({}))) as {
      items?: Array<{ path: string; url?: string | null }>;
    };
    const out: Record<string, string> = {};
    (j.items || []).forEach((it) => {
      if (it.path && it.url) out[it.path] = it.url;
    });
    return out;
  } catch {
    return {};
  }
}

export default function ReviewPacketBuilder({ caseId, onSelectionChange, onOpenShare }: Props) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [images, setImages] = useState<ImgRow[]>([]);
  const [versions, setVersions] = useState<number[]>([]);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [selectedVersion, setSelectedVersion] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState<boolean>(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setErr(null);
      const [imgRes, verRes] = await Promise.all([
        (supabase as any)
          .from("case_images")
          .select("id, storage_path, is_original, is_annotated, variant, created_at")
          .eq("case_id", caseId)
          .order("created_at", { ascending: true }),
        (supabase as any)
          .from("reports")
          .select("version")
          .eq("case_id", caseId)
          .order("version", { ascending: false }),
      ]);

      if (imgRes.error) setErr(imgRes.error.message);
      if (verRes.error) setErr((prev: string | null) => prev || verRes.error!.message);

      const imgData = ((imgRes.data ?? []) as ImgRow[]).map((r) => ({
        id: String(r.id),
        storage_path: String(r.storage_path),
        is_original: r.is_original === null ? null : Boolean(r.is_original),
        is_annotated: r.is_annotated ?? null,
        variant: r.variant ?? null,
        created_at: r.created_at ?? null,
      }));

      const repData = (verRes.data ?? []) as ReportRow[];

      setImages(imgData);

      const vers = repData.map((r) => Number(r.version)).filter((v) => Number.isFinite(v));
      const finalVers = vers.length ? vers : [1];
      setVersions(finalVers);
      setSelectedVersion(finalVers[0]);

      setLoading(false);
    };
    run();
  }, [caseId, supabase]);

  useEffect(() => {
    onSelectionChange?.({ version: selectedVersion, images: Array.from(selectedImages) });
  }, [selectedImages, selectedVersion, onSelectionChange]);

  const originals = useMemo<ImgRow[]>(
    () => images.filter((i) => Boolean(i.is_original) && !isAnnotated(i)),
    [images]
  );
  const annotated = useMemo<ImgRow[]>(
    () => images.filter((i) => isAnnotated(i)),
    [images]
  );
  const normalized = useMemo<ImgRow[]>(
    () => images.filter((i) => !Boolean(i.is_original) && !isAnnotated(i)),
    [images]
  );

  useEffect(() => {
    let cancel = false;
    const pool = [...originals, ...normalized, ...annotated].map((i) => i.storage_path);
    const pending = pool.filter((p) => !thumbs[p]).slice(0, 60);
    if (!pending.length) return;
    (async () => {
      const batch = await signMany(pending);
      if (!cancel && Object.keys(batch).length) {
        setThumbs((prev) => ({ ...prev, ...batch }));
      }
    })();
    return () => {
      cancel = true;
    };
  }, [
    originals.map((i) => i.storage_path).join("|"),
    normalized.map((i) => i.storage_path).join("|"),
    annotated.map((i) => i.storage_path).join("|"),
  ]);

  const toggle = (path: string) => {
    setSelectedImages((prev) => {
      const s = new Set(prev);
      if (s.has(path)) s.delete(path);
      else s.add(path);
      return s;
    });
  };

  const selectGroup = (group: "all" | "none" | "original" | "normalized" | "annotated") => {
    if (group === "none") {
      setSelectedImages(new Set());
      return;
    }
    if (group === "all") {
      setSelectedImages(new Set(images.map((i) => i.storage_path)));
      return;
    }
    if (group === "original") {
      setSelectedImages(new Set(originals.map((i) => i.storage_path)));
      return;
    }
    if (group === "normalized") {
      setSelectedImages(new Set(normalized.map((i) => i.storage_path)));
      return;
    }
    if (group === "annotated") {
      setSelectedImages(new Set(annotated.map((i) => i.storage_path)));
      return;
    }
  };

  const openPreview = async (path: string) => {
    setPreviewBusy(true);
    const u = thumbs[path] || (await signPath(path));
    setPreviewUrl(u);
    setPreviewBusy(false);
  };

  const renderGroup = (title: string, items: ImgRow[], kind: "original" | "normalized" | "annotated") => {
    return (
      <div className="rounded-xl border">
        <div className="flex items-center justify-between border-b p-3">
          <h4 className="text-sm font-semibold">{title}</h4>
          <span className="badge badge-muted">{items.length}</span>
        </div>
        <ul className="max-h-72 space-y-2 overflow-auto p-3">
          {items.map((img) => {
            const url = thumbs[img.storage_path];
            return (
              <li key={img.id} className="flex items-center justify-between gap-3 rounded-lg border p-2">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-10 w-10 overflow-hidden rounded-md border bg-black">
                    {url ? (
                      <img
                        src={url}
                        alt={img.storage_path}
                        className="h-10 w-10 object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-10 w-10 animate-pulse bg-white/5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm">{img.storage_path}</p>
                    <p className="text-xs muted">
                      {kind}
                      {img.created_at ? ` • ${new Date(img.created_at).toLocaleString()}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="btn btn-ghost px-2 py-1 text-xs"
                    onClick={() => openPreview(img.storage_path)}
                    aria-label={`Preview ${img.storage_path}`}
                    disabled={previewBusy}
                  >
                    Preview
                  </button>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--color-primary)]"
                      checked={selectedImages.has(img.storage_path)}
                      onChange={() => toggle(img.storage_path)}
                      aria-label={`Select ${img.storage_path}`}
                    />
                  </label>
                </div>
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="rounded-lg border p-3 text-sm text-muted-foreground">No images</li>
          )}
        </ul>
      </div>
    );
  };

  return (
    <section className="card-lg">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Review packet</h3>
          <p className="text-sm muted">
            {selectedImages.size} selected • v{selectedVersion}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <label htmlFor="version" className="label m-0">Report version</label>
            <select
              id="version"
              className="select"
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(Number(e.target.value))}
              aria-label="Report version"
            >
              {versions.map((v) => (
                <option key={v} value={v}>v{v}</option>
              ))}
            </select>
          </div>
          <div className="rounded-xl border p-1">
            <button className="btn btn-ghost px-3 py-1.5" onClick={() => selectGroup("original")}>Originals</button>
            <button className="btn btn-ghost px-3 py-1.5" onClick={() => selectGroup("normalized")}>Normalized</button>
            <button className="btn btn-ghost px-3 py-1.5" onClick={() => selectGroup("annotated")}>Annotated</button>
            <button className="btn btn-ghost px-3 py-1.5" onClick={() => selectGroup("all")}>All</button>
            <button className="btn btn-outline px-3 py-1.5" onClick={() => selectGroup("none")}>None</button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          <div className="skeleton h-5 w-1/3" />
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-5 w-1/4" />
          <div className="skeleton h-24 w-full" />
        </div>
      )}

      {err && (
        <div
          role="alert"
          aria-live="polite"
          className="mb-3 rounded-xl border px-3 py-2 text-sm"
          style={{
            background: "color-mix(in oklab, var(--color-danger) 14%, transparent)",
            borderColor: "color-mix(in oklab, var(--color-danger) 55%, var(--border-alpha))",
          }}
        >
          {err}
        </div>
      )}

      {!loading && images.length === 0 && !err && (
        <div className="empty">
          <div className="h-8 w-8 rounded-xl bg-white/5" />
          <p>No images available</p>
          <p className="text-sm muted">Upload at least one image to build a packet.</p>
        </div>
      )}

      {!loading && images.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {renderGroup("Originals", originals, "original")}
          {renderGroup("Normalized", normalized, "normalized")}
          {renderGroup("Annotated", annotated, "annotated")}
        </div>
      )}

      {!loading && images.length > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-xl border p-3">
          <div className="flex items-center gap-3">
            <div className="text-sm">
              <span className="font-medium">{selectedImages.size}</span> selected • version v{selectedVersion}
            </div>
            <div className="hidden items-center gap-1 sm:flex">
              {Array.from(selectedImages)
                .slice(0, 8)
                .map((p) => (
                  <div key={p} className="h-8 w-8 overflow-hidden rounded border bg-black">
                    {thumbs[p] ? (
                      <img src={thumbs[p]} alt="thumb" className="h-8 w-8 object-cover" />
                    ) : (
                      <div className="h-8 w-8 animate-pulse bg-white/5" />
                    )}
                  </div>
                ))}
              {selectedImages.size > 8 && (
                <span className="text-xs muted">+{selectedImages.size - 8}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs muted hidden sm:inline">Selections will be used when sharing to the technician</span>
            <button
              className="btn btn-primary"
              onClick={onOpenShare}
              disabled={selectedImages.size === 0}
              title={selectedImages.size ? "Open share dialog" : "Select at least one image"}
            >
              Share to Technician
            </button>
          </div>
        </div>
      )}

      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl border bg-[var(--color-surface)]">
            <img
              src={previewUrl}
              alt="Preview"
              className="max-h-[85vh] max-w-[85vw] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="flex justify-end p-2">
              <button className="btn btn-ghost" onClick={() => setPreviewUrl(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
