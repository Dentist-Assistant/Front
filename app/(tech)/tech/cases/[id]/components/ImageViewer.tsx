// app/tech/cases/[id]/components/ImageViewer.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  path?: string;
  caption?: string;
  height?: number;
  bucket?: string;
};

const DEFAULT_IMG_BUCKET =
  process.env.NEXT_PUBLIC_IMAGES_BUCKET ||
  process.env.NEXT_PUBLIC_REPORTS_BUCKET ||
  "cases";

function parseSpec(raw?: string) {
  if (!raw) return { bucket: undefined as string | undefined, key: "" };
  const s = raw.trim();
  if (!s) return { bucket: undefined as string | undefined, key: "" };
  if (/^https?:\/\//i.test(s) || /^data:/i.test(s)) return { external: true, url: s } as any;
  if (s.startsWith("bucket://")) {
    const rest = s.slice("bucket://".length);
    const i = rest.indexOf("/");
    return i === -1 ? { bucket: rest, key: "" } : { bucket: rest.slice(0, i), key: rest.slice(i + 1) };
  }
  if (s.includes("::")) {
    const [b, k] = s.split("::");
    return { bucket: b || undefined, key: (k || "").replace(/^\/+/, "") };
  }
  if (s.startsWith("@")) {
    const rest = s.slice(1);
    const i = rest.indexOf("/");
    return i === -1 ? { bucket: rest, key: "" } : { bucket: rest.slice(0, i), key: rest.slice(i + 1) };
  }
  return { bucket: undefined as string | undefined, key: s.replace(/^\/+/, "") };
}

function buildCandidates(key: string) {
  const set = new Set<string>();
  const k = key.replace(/^\/+/, "");
  set.add(k);
  if (!/(^|\/)annotated(\/|$)/i.test(k)) {
    set.add(`annotated/${k}`);
    set.add(k.replace(/(^|\/)(originals|normalized)(\/)/i, "$1annotated$3"));
  }
  return Array.from(set);
}

export default function ImageViewer({
  path,
  caption,
  height = 360,
  bucket = DEFAULT_IMG_BUCKET,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const [err, setErr] = useState<string | null>(null);

  const spec = useMemo(() => parseSpec(path), [path]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(!!path);
      setErr(null);
      setUrl(null);

      try {
        if (!path) {
          setLoading(false);
          return;
        }

        if ((spec as any).external) {
          if (!cancelled) {
            setUrl((spec as any).url);
            setLoading(false);
          }
          return;
        }

        const bkt = spec.bucket || bucket;
        const key = spec.key;
        if (!key) {
          if (!cancelled) {
            setLoading(false);
          }
          return;
        }

        const candidates = buildCandidates(key);

        for (const k of candidates) {
          const qs = new URLSearchParams({ path: k, bucket: bkt });
          const res = await fetch(`/api/storage/sign?${qs.toString()}`, { method: "GET" });
          if (!res.ok) continue;
          const j = await res.json().catch(() => ({}));
          const signed = j.signedUrl ?? j.signed_url ?? j.url ?? null;
          if (signed) {
            if (!cancelled) {
              setUrl(signed);
              setLoading(false);
            }
            return;
          }
        }

        if (!cancelled) {
          setErr("Image not found");
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message ?? "Failed to load image");
          setLoading(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [path, spec, bucket]);

  const hasImage = !!url && !loading && !err;

  return (
    <section className="card-lg p-0">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-medium">Image</h2>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost" disabled={!hasImage}>−</button>
          <span className="text-sm tabular-nums">100%</span>
          <button className="btn btn-ghost" disabled={!hasImage}>+</button>
          <button className="btn btn-ghost" disabled={!hasImage}>↻</button>
          <button className="btn" disabled={!hasImage}>Reset</button>
        </div>
      </div>

      <div className="relative w-full overflow-auto bg-[var(--color-surface)]" style={{ height }}>
        {loading && <div className="skeleton absolute inset-0" />}

        {!!err && !loading && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div
              role="alert"
              className="rounded-2xl border px-4 py-3 text-sm text-center"
              style={{
                background: "color-mix(in oklab, var(--color-warning) 12%, transparent)",
                borderColor: "color-mix(in oklab, var(--color-warning) 55%, var(--border-alpha))",
              }}
            >
              <p className="mb-2">{err}</p>
            </div>
          </div>
        )}

        {!loading && !err && !url && (
          <div className="empty h-full">
            <div className="h-8 w-8 rounded-xl bg-white/5" />
            <p>No image to display</p>
            <p className="text-sm muted">Upload or share an image for this case.</p>
          </div>
        )}

        {hasImage && (
          <div className="flex h-full w-full items-center justify-center">
            <img
              src={url}
              alt="Case image"
              className="max-h-full max-w-full select-none"
              draggable={false}
            />
          </div>
        )}
      </div>

      {caption && (
        <div className="border-t px-4 py-2 text-sm text-[var(--color-text)]/85">
          {caption}
        </div>
      )}
    </section>
  );
}
