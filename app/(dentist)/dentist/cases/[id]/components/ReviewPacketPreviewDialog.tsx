// app/dentist/cases/[id]/components/ReviewPacketPreviewDialog.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Send, RefreshCw, Check, Image as ImageIcon, ExternalLink } from "lucide-react";

type ImageItem = {
  id: string;
  path: string;
  url?: string | null;
  caption?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  caseId: string;
  images: ImageItem[];
  availableVersions: number[];
  defaultSelectedVersion?: number;
  defaultSelectedImages?: string[];
  onSend: (p: { caseId: string; version: number; images: string[] }) => Promise<{ ok: boolean; error?: string }>;
};

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

export default function ReviewPacketPreviewDialog({
  open,
  onClose,
  caseId,
  images,
  availableVersions,
  defaultSelectedVersion,
  defaultSelectedImages,
  onSend,
}: Props) {
  const latest = useMemo(
    () => (availableVersions.length ? Math.max(...availableVersions) : 1),
    [availableVersions]
  );

  const [version, setVersion] = useState<number>(defaultSelectedVersion ?? latest);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    defaultSelectedImages && defaultSelectedImages.length
      ? defaultSelectedImages
      : images.slice(0, 6).map((i) => i.id)
  );

  const [resolvedUrls, setResolvedUrls] = useState<Record<string, string>>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastObjectUrl = useRef<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    setVersion(defaultSelectedVersion ?? latest);
    if (defaultSelectedImages && defaultSelectedImages.length) {
      setSelectedIds(defaultSelectedImages);
    } else if (images.length) {
      setSelectedIds(images.slice(0, 6).map((i) => i.id));
    } else {
      setSelectedIds([]);
    }
  }, [open, defaultSelectedVersion, latest, defaultSelectedImages, images]);

  useEffect(() => {
    const missingPaths = images
      .filter((i) => !i.url && i.path)
      .map((i) => i.path)
      .filter(Boolean);
    if (!missingPaths.length) return;
    let cancelled = false;
    (async () => {
      const batch = await signMany(missingPaths);
      if (!cancelled) setResolvedUrls((prev) => ({ ...prev, ...batch }));
    })();
    return () => {
      cancelled = true;
    };
  }, [images.map((i) => `${i.id}:${i.url || i.path || ""}`).join("|")]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      void buildPreview();
    }, 250);
    return () => clearTimeout(t);
  }, [open, version, selectedIds.join("|"), refreshTick]);

  useEffect(() => {
    const onFocus = () => {
      if (open) void buildPreview();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [open, version, selectedIds.join("|")]);

  useEffect(() => {
    const handleDraft = (e: Event) => {
      const id = (e as CustomEvent).detail?.caseId as string | undefined;
      if (!id || id === caseId) setRefreshTick((t) => t + 1);
    };
    const handleRebuttal = (e: Event) => {
      const id = (e as CustomEvent).detail?.caseId as string | undefined;
      if (!id || id === caseId) setRefreshTick((t) => t + 1);
    };
    const handleUpsert = (e: Event) => {
      const id = (e as CustomEvent).detail?.caseId as string | undefined;
      if (!id || id === caseId) setRefreshTick((t) => t + 1);
    };
    window.addEventListener("ai:draftSaved", handleDraft as EventListener);
    window.addEventListener("ai:rebuttalSaved", handleRebuttal as EventListener);
    window.addEventListener("report:templateUpserted", handleUpsert as EventListener);
    return () => {
      window.removeEventListener("ai:draftSaved", handleDraft as EventListener);
      window.removeEventListener("ai:rebuttalSaved", handleRebuttal as EventListener);
      window.removeEventListener("report:templateUpserted", handleUpsert as EventListener);
    };
  }, [caseId]);

  useEffect(() => {
    return () => {
      if (lastObjectUrl.current) URL.revokeObjectURL(lastObjectUrl.current);
    };
  }, []);

  const selectedPaths = useMemo(() => {
    const set = new Set(selectedIds);
    return images.filter((i) => set.has(i.id)).map((i) => i.path);
  }, [images, selectedIds]);

  const displayImages = useMemo(() => {
    return images.map((it) => ({
      ...it,
      url: it.url || (it.path ? resolvedUrls[it.path] : null),
    }));
  }, [images, resolvedUrls]);

  const buildPreview = async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          draftVersion: version,
          rebuttalVersion: "latest",
          images: selectedPaths,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.details || "Failed to render PDF");
      }
      const blob = await res.blob();
      if (lastObjectUrl.current) URL.revokeObjectURL(lastObjectUrl.current);
      const url = URL.createObjectURL(blob);
      lastObjectUrl.current = url;
      setPreviewUrl(url);
    } catch (e: any) {
      setError(e?.message || "Preview failed");
      setPreviewUrl(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const has = prev.includes(id);
      if (has) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const selectAll = () => setSelectedIds(images.map((i) => i.id));
  const clearAll = () => setSelectedIds([]);

  const handleSend = async () => {
    if (selectedPaths.length === 0) {
      setError("Select at least one image to send.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const r = await onSend({ caseId, version, images: selectedPaths });
      if (!r.ok) throw new Error(r.error || "Send failed");
      onClose();
    } catch (e: any) {
      setError(e?.message || "Send failed");
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  const PDF_VIEW_PARAMS = "#zoom=page-width";

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="h-[min(95vh,1000px)] w-[min(1200px,95vw)] overflow-hidden rounded-2xl border bg-[var(--color-surface)] shadow-xl">
          <header className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold">Preview Review Packet</h2>
              <span className="badge">Case {caseId.slice(0, 8)}…</span>
              <span className="badge badge-accent">v{version}</span>
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="h-[calc(100%-56px)] overflow-auto">
            <section className="border-b p-4 sm:p-5">
              <div className="mx-auto w-full max-w-[1000px] space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="w-full sm:w-72">
                    <label htmlFor="version" className="label">Version</label>
                    <select
                      id="version"
                      className="select w-full"
                      value={version}
                      onChange={(e) => setVersion(Number(e.target.value))}
                    >
                      {availableVersions
                        .slice()
                        .sort((a, b) => b - a)
                        .map((v) => (
                          <option key={v} value={v}>
                            v{v} {v === latest ? "(latest)" : ""}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <button className="btn btn-ghost btn-xs" onClick={selectAll} disabled={!images.length}>
                      Select all
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={clearAll} disabled={!selectedIds.length}>
                      Clear
                    </button>
                    <button className="btn btn-outline" onClick={buildPreview} disabled={loading} aria-busy={loading}>
                      <RefreshCw className="h-4 w-4" />
                      Refresh preview
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handleSend}
                      disabled={sending || loading || selectedPaths.length === 0}
                      aria-busy={sending}
                      title={selectedPaths.length ? "Send packet to technician" : "Select at least one image"}
                    >
                      <Send className="h-4 w-4" />
                      Send to Technician
                    </button>
                  </div>
                </div>

                <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[48vh] overflow-auto pr-1">
                  {displayImages.map((it) => {
                    const checked = selectedIds.includes(it.id);
                    const url = it.url || "";
                    return (
                      <li
                        key={it.id}
                        className="relative overflow-hidden rounded-xl border"
                        style={{
                          borderColor: checked
                            ? "color-mix(in oklab, var(--color-primary) 65%, var(--border-alpha))"
                            : "var(--border-alpha)",
                          boxShadow: checked
                            ? "0 0 0 2px color-mix(in oklab, var(--color-primary) 35%, transparent) inset"
                            : "none",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSelect(it.id)}
                          className="absolute left-2 top-2 z-10 rounded-lg border bg-black/40 px-2 py-1 text-xs backdrop-blur"
                          aria-pressed={checked}
                        >
                          {checked ? (
                            <span className="inline-flex items-center gap-1">
                              <Check className="h-3.5 w-3.5" />
                              Selected
                            </span>
                          ) : (
                            "Select"
                          )}
                        </button>
                        <div className="relative aspect-[4/3] bg-black">
                          {url ? (
                            <img src={url} alt={it.caption || "Image"} className="h-full w-full object-contain" />
                          ) : (
                            <div className="absolute inset-0 grid place-items-center">
                              <div className="h-8 w-8 animate-pulse rounded-xl bg-white/10" />
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 border-t px-2 py-1.5">
                          <ImageIcon className="h-4 w-4 opacity-70" />
                          <span className="truncate text-xs muted" title={it.caption || it.path}>
                            {it.caption || it.path}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {error && (
                  <div
                    className="rounded-xl border px-3 py-2 text-sm"
                    style={{
                      background: "color-mix(in oklab, var(--color-danger) 12%, transparent)",
                      borderColor: "color-mix(in oklab, var(--color-danger) 55%, var(--border-alpha))",
                    }}
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                <p className="text-xs muted">{selectedIds.length} image(s) • version v{version}</p>
              </div>
            </section>

            <section className="p-4 sm:p-6">
              <div className="mx-auto w-full max-w-[1000px]">
                {loading && (
                  <div className="space-y-3 text-center">
                    <div className="skeleton h-6 w-[min(720px,85vw)] mx-auto" />
                    <div className="skeleton h-[70vh] w-full mx-auto rounded-xl" />
                  </div>
                )}

                {!loading && previewUrl && (
                  <div className="rounded-xl border bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b px-3 py-2">
                      <div className="text-sm muted">PDF preview</div>
                      <a
                        className="btn btn-ghost btn-xs"
                        href={previewUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Open in new tab"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open
                      </a>
                    </div>
                    <iframe
                      key={previewUrl}
                      src={`${previewUrl}${PDF_VIEW_PARAMS}`}
                      title="Review Packet PDF Preview"
                      className="block w-full h-[min(82vh,1200px)] rounded-b-xl"
                      loading="lazy"
                    />
                  </div>
                )}

                {!loading && !previewUrl && (
                  <div className="grid h-[40vh] place-items-center rounded-xl border">
                    <div className="text-center">
                      <div className="h-10 w-10 rounded-2xl bg-white/5 mx-auto" />
                      <p className="mt-2 text-sm muted">No preview yet</p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
