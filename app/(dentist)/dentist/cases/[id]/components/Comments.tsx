"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowser } from "../../../../../../lib/supabaseBrowser";

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  by_user: string;
  target_version: number | null;
};

type Props = {
  caseId: string;
  targetVersion?: number | null;
  canPost?: boolean;
  onPosted?: () => void;
};

export default function Comments({
  caseId,
  targetVersion = null,
  canPost = true,
  onPosted,
}: Props) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [items, setItems] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!isMounted.current) return;
      setMe(sessionData.session?.user?.id ?? null);
    })();
  }, [supabase]);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("review_comments")
      .select("id, body, created_at, by_user, target_version")
      .eq("case_id", caseId)
      .order("created_at", { ascending: true });

    if (!isMounted.current) return;

    if (error) {
      setError(error.message);
      setItems([]);
    } else {
      setItems((data as CommentRow[]) || []);
    }
    setLoading(false);
  }, [caseId, supabase]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPost || posting) return;

    const body = inputRef.current?.value?.trim() || "";
    if (!body) return;

    setPosting(true);
    setError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user?.id;
    if (!uid) {
      setError("Unauthorized");
      setPosting(false);
      return;
    }

    const { error } = await (supabase as any)
      .from("review_comments")
      .insert({
        case_id: caseId,
        by_user: uid,
        body,
        target_version: targetVersion,
      } as any)
      .select("id")
      .single();

    if (!isMounted.current) return;

    if (error) {
      setError(error.message);
    } else {
      if (inputRef.current) inputRef.current.value = "";
      await fetchComments();
      onPosted?.();
    }
    setPosting(false);
  };

  return (
    <section className="card-lg">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold">Comments</h3>
        <span className="badge badge-muted">{items.length} total</span>
      </div>

      {loading && (
        <div className="space-y-2">
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton h-4 w-1/2" />
          <div className="skeleton h-4 w-3/4" />
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="empty">
          <div className="h-8 w-8 rounded-xl bg-white/5" />
          <p>No comments yet</p>
          <p className="text-sm muted">Share a focused note for the current review.</p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <ul className="space-y-3">
          {items.map((c) => {
            const isMe = me && c.by_user === me;
            return (
              <li key={c.id} className="rounded-xl border bg-[var(--color-surface)] p-3">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium">
                    {isMe ? "You" : "Collaborator"}
                    {typeof c.target_version === "number" ? (
                      <span className="ml-2 badge badge-accent">v{c.target_version}</span>
                    ) : null}
                  </span>
                  <time className="muted">{new Date(c.created_at).toLocaleString()}</time>
                </div>
                <p className="text-sm leading-relaxed">{c.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="mt-4 rounded-xl border px-3 py-2 text-sm"
          style={{
            background: "color-mix(in oklab, var(--color-danger) 14%, transparent)",
            borderColor: "color-mix(in oklab, var(--color-danger) 55%, var(--border-alpha))",
          }}
        >
          {error}
        </div>
      )}

      {canPost && (
        <form onSubmit={onSubmit} className="mt-4 space-y-2">
          <label htmlFor="comment" className="label">
            Add a comment
          </label>
          <textarea
            id="comment"
            ref={inputRef}
            className="textarea min-h-[88px]"
            placeholder="Keep it focused and actionable…"
            disabled={posting}
          />
          <div className="flex items-center justify-between">
            {typeof targetVersion === "number" ? (
              <span className="text-xs muted">Targeting version v{targetVersion}</span>
            ) : (
              <span className="text-xs muted">No specific version</span>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={posting}
              aria-busy={posting}
            >
              {posting ? "Posting…" : "Post comment"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
