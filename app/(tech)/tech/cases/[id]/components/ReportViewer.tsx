// app/tech/cases/[id]/components/ReportViewer.tsx
"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "../../../../../../lib/supabaseBrowser";

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
  const supabase = getSupabaseBrowser();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      setLoading(true);
      setErr(null);
      setUrl(null);

      try {
        if (explicitPath && /^https?:\/\//i.test(explicitPath)) {
          if (!cancelled) setUrl(explicitPath);
          return;
        }

        const candidates: string[] = [];
        if (explicitPath && !/^https?:\/\//i.test(explicitPath)) candidates.push(explicitPath);
        candidates.push(`pdf/${caseId}/v${version}.pdf`);
        candidates.push(`${caseId}/v${version}.pdf`);
        candidates.push(`pdf/${caseId}/latest.pdf`);

        let found: Blob | null = null;

        for (const p of candidates) {
          const { data, error } = await supabase.storage.from(bucket).download(p);
          if (!error && data) {
            found = data;
            break;
          }
        }

        if (!found) {
          setErr("Report not found in storage");
          return;
        }

        objectUrl = URL.createObjectURL(found);
        if (!cancelled) setUrl(objectUrl);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Failed to load report");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [bucket, caseId, version, explicitPath, supabase]);

  if (loading) return <div className="skeleton w-full rounded-2xl" style={{ height }} />;

  if (!url)
    return (
      <section className="card-lg flex items-center justify-center text-center" style={{ height }}>
        <div>
          <p className="font-medium">No report PDF found</p>
        </div>
      </section>
    );

  return (
    <div className="overflow-hidden rounded-2xl border" style={{ height }}>
      <iframe title="Report PDF" src={url} className="h-full w-full" />
    </div>
  );
}
