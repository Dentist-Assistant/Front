// app/tech/cases/[id]/components/Comments.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "../../../../../../lib/supabaseBrowser";
import useAuthSession from "../../../../../../hooks/useAuthSession";

type CommentRow = {
  id: string;
  case_id: string;
  by_user: string;
  body: string;
  target_version: number | null;
  created_at: string;
};

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const HDRS = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };

export default function Comments({
  caseId,
  targetVersion,
  canPost = false,
  onPosted,
}: {
  caseId: string;
  targetVersion?: number;
  canPost?: boolean;
  onPosted?: () => void | Promise<void>;
}) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const { session } = useAuthSession();

  const [items, setItems] = useState<CommentRow[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(
          `${SUPA_URL}/rest/v1/review_comments?select=*&case_id=eq.${caseId}&order=created_at.desc&limit=100`,
          { headers: HDRS }
        );
        if (!res.ok) throw new Error(await res.text());
        const rows = (await res.json()) as CommentRow[];
        if (!cancelled) setItems(rows);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || "Failed to load comments");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [caseId]);

  const submit = async () => {
    if (!session?.user?.id) return;
    const body = text.trim();
    if (!body) return;

    setPosting(true);
    setPostError(null);
    try {
      await supabase.auth.getSession();
      const { error } = await supabase.from("review_comments").insert({
        case_id: caseId,
        by_user: session.user.id,
        body,
        target_version: typeof targetVersion === "number" ? targetVersion : null,
      } as any);
      if (error) { setPostError(error.message || "Failed to post comment"); return; }
      setText("");
      const res = await fetch(
        `${SUPA_URL}/rest/v1/review_comments?select=*&case_id=eq.${caseId}&order=created_at.desc&limit=100`,
        { headers: HDRS }
      );
      if (res.ok) setItems(await res.json());
      if (onPosted) await onPosted();
    } finally {
      setPosting(false);
    }
  };

  const onKeyDownTextarea = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (!posting && text.trim()) submit();
    }
  };

  return (
    <section className="card-lg">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">Comments</h2>
        <span className="muted text-sm">{items.length}</span>
      </div>

      {!!loadError && (
        <div
          role="alert"
          className="mb-3 rounded-2xl border px-4 py-3 text-sm"
          style={{ background: "color-mix(in oklab, var(--color-danger) 10%, transparent)",
                   borderColor: "color-mix(in oklab, var(--color-danger) 55%, var(--border-alpha))" }}
        >
          {loadError}
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          <div className="skeleton h-8 w-full" />
          <div className="skeleton h-8 w-5/6" />
        </div>
      )}

      {!loading && !loadError && items.length === 0 && (
        <div className="empty">
          <div className="h-8 w-8 rounded-xl bg-white/5" />
          <p>No comments yet</p>
          <p className="text-sm muted">Be the first to leave feedback.</p>
        </div>
      )}

      {!loading && !loadError && items.length > 0 && (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="rounded-2xl border p-3">
              <div className="mb-1 flex items-center justify-between">
                <div className="text-sm font-medium">{c.by_user === session?.user?.id ? "You" : c.by_user}</div>
                <div className="muted text-xs">{new Date(c.created_at).toLocaleString()}</div>
              </div>
              <p className="text-[var(--color-text)]/95 whitespace-pre-line">{c.body}</p>
              {typeof c.target_version === "number" && (
                <div className="mt-2 text-xs muted">v{c.target_version}</div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canPost && (
        <div className="mt-4 space-y-2">
          <label htmlFor="fb-tech" className="label">Add feedback</label>

          {!!postError && (
            <div
              role="alert"
              className="rounded-2xl border px-4 py-2 text-sm"
              style={{ background: "color-mix(in oklab, var(--color-warning) 12%, transparent)",
                       borderColor: "color-mix(in oklab, var(--color-warning) 55%, var(--border-alpha))" }}
            >
              {postError}
            </div>
          )}

          <textarea
            id="fb-tech"
            className="textarea min-h=[88px]"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDownTextarea}
            placeholder="Write clear, actionable feedback…"
            disabled={posting || !session?.user?.id}
            aria-busy={posting}
          />
          <div className="muted text-xs">Tip: Ctrl/⌘ + Enter to send.</div>

          <div className="flex items-center justify-end gap-2">
            <button className="btn btn-primary" onClick={submit} disabled={!text.trim() || posting || !session?.user?.id}>
              {posting ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
