// app/tech/cases/[id]/components/ReportViewer.tsx
"use client";

import { useEffect, useState } from "react";

type Props = {
  caseId: string;
  version: number;
  explicitPath?: string;
  bucket?: string;
  height?: number;
};

const DEFAULT_BUCKET = process.env.NEXT_PUBLIC_REPORTS_BUCKET || "cases";

export default function ReportViewer({
  caseId,
  version,
  explicitPath,
  bucket = DEFAULT_BUCKET,
  height = 560,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setUrl(null);

    (async () => {
      try {
        if (explicitPath && /^https?:\/\//i.test(explicitPath)) {
          if (!cancelled) { setUrl(explicitPath); setLoading(false); }
          return;
        }

        const candidates: string[] = [];
        if (explicitPath && !/^https?:\/\//i.test(explicitPath)) candidates.push(explicitPath);
        candidates.push(`pdf/${caseId}/v${version}.pdf`);
        candidates.push(`${caseId}/v${version}.pdf`);
        candidates.push(`pdf/${caseId}/latest.pdf`);

        for (const p of candidates) {
          const qs = new URLSearchParams({ path: p, bucket });
          const res = await fetch(`/api/storage/sign?${qs.toString()}`, { method: "GET" });
          if (!res.ok) continue;
          const j = await res.json().catch(() => ({}));
          const signed = j.signedUrl ?? j.signed_url ?? j.url ?? null;
          if (signed) {
            if (!cancelled) { setUrl(signed); setLoading(false); }
            return;
          }
        }

        if (!cancelled) { setErr("Report not found"); setLoading(false); }
      } catch (e: any) {
        if (!cancelled) { setErr(e?.message ?? "Failed to load"); setLoading(false); }
      }
    })();

    return () => { cancelled = true; };
  }, [bucket, caseId, version, explicitPath]);

  if (loading) return <div className="skeleton w-full rounded-2xl" style={{ height }} />;

  if (!url)
    return (
      <section className="card-lg flex items-center justify-center text-center" style={{ height }}>
        <div><p className="font-medium">{err ?? "No report PDF found"}</p></div>
      </section>
    );

  return (
    <div className="overflow-hidden rounded-2xl border" style={{ height }}>
      <iframe title="Report PDF" src={url} className="h-full w-full" />
    </div>
  );
}
