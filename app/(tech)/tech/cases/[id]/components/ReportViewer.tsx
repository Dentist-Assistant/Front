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

export default function ReportViewer({
  caseId,
  version,
  explicitPath,
  bucket = process.env.NEXT_PUBLIC_REPORTS_BUCKET || "reports",
  height = 560,
}: Props) {
  const supabase = getSupabaseBrowser();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const candidatePath =
          explicitPath && !explicitPath.startsWith("http")
            ? explicitPath
            : explicitPath
            ? null
            : `reports/${caseId}/v${version}.pdf`;

        if (explicitPath && explicitPath.startsWith("http")) {
          if (!cancelled) setUrl(explicitPath);
          return;
        }

        if (!candidatePath) {
          if (!cancelled) setUrl(null);
          return;
        }

        const pub = supabase.storage.from(bucket).getPublicUrl(candidatePath);
        if (pub.data.publicUrl) {
          const head = await fetch(pub.data.publicUrl, { method: "HEAD" });
          if (head.ok) {
            if (!cancelled) setUrl(pub.data.publicUrl);
            return;
          }
        }

        const signed = await supabase.storage.from(bucket).createSignedUrl(candidatePath, 600);
        if (signed.data?.signedUrl) {
          if (!cancelled) setUrl(signed.data.signedUrl);
          return;
        }

        if (!cancelled) setUrl(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bucket, caseId, version, explicitPath, supabase]);

  if (loading) return <div className="skeleton w-full rounded-2xl" style={{ height }} />;
  if (!url)
    return (
      <section className="card-lg flex items-center justify-center text-center" style={{ height }}>
        <div>
          <p className="font-medium">No report PDF found</p>
          <p className="muted text-sm">Ask the dentist to share the report or check the storage path.</p>
        </div>
      </section>
    );

  return (
    <div className="overflow-hidden rounded-2xl border" style={{ height }}>
      <object data={url} type="application/pdf" className="h-full w-full">
        <iframe
          title="Report PDF"
          src={`https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`}
          className="h-full w-full"
        />
        <div className="p-4 text-sm">
          <a className="link" href={url} target="_blank" rel="noreferrer">
            Open report
          </a>
        </div>
      </object>
    </div>
  );
}
