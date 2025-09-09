// hooks/useSignedUrl.ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "../lib/supabaseBrowser";

type Options = { expiresIn?: number; enabled?: boolean };
type State = { url: string | null; isLoading: boolean; error: string | null };

function parseStorageSpec(raw?: string | null): { bucket?: string; key?: string } {
  if (!raw) return {};
  const s = raw.trim();
  if (!s) return {};
  if (s.startsWith("bucket://")) {
    const rest = s.slice("bucket://".length);
    const slash = rest.indexOf("/");
    if (slash === -1) return { bucket: rest || undefined, key: "" };
    return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
  }
  if (s.includes("::")) {
    const [bucket, key] = s.split("::");
    return { bucket: bucket || undefined, key: key || "" };
  }
  if (s.startsWith("@")) {
    const rest = s.slice(1);
    const slash = rest.indexOf("/");
    if (slash === -1) return { bucket: rest || undefined, key: "" };
    return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
  }
  return { key: s };
}

function buildAnnotatedCandidates(key: string): string[] {
  const candidates = new Set<string>();
  const k = key.replace(/^\/+/, "");
  candidates.add(k);
  if (!/(^|\/)annotated(\/|$)/i.test(k)) {
    candidates.add(`annotated/${k}`);
    candidates.add(k.replace(/(^|\/)(originals|normalized)(\/)/i, "$1annotated$3"));
  }
  return Array.from(candidates);
}

export default function useSignedUrl(path?: string | null, options?: Options) {
  const { expiresIn = 3600, enabled = true } = options ?? {};
  const [state, setState] = useState<State>({ url: null, isLoading: !!(enabled && path), error: null });
  const [tick, setTick] = useState(0);

  const run = useCallback(async (signal: AbortSignal) => {
    if (!enabled || !path?.trim()) {
      setState({ url: null, isLoading: false, error: null });
      return;
    }
    if (/^(https?:\/\/|data:)/i.test(path)) {
      setState({ url: path, isLoading: false, error: null });
      return;
    }

    setState((s) => ({ ...s, isLoading: true, error: null }));

    try {
      const supabase = getSupabaseBrowser();
      const { data: sess } = await supabase.auth.getSession();
      const authHeader =
        sess?.session?.access_token ? { Authorization: `Bearer ${sess.session.access_token}` } : undefined;

      const { bucket, key } = parseStorageSpec(path);
      const finalKey = (key ?? path).replace(/^\/+/, "");
      const keysToTry = buildAnnotatedCandidates(finalKey);

      let lastErr: string | null = null;

      for (const candidate of keysToTry) {
        const qs = new URLSearchParams({ path: candidate, expiresIn: String(expiresIn) });
        if (bucket) qs.set("bucket", bucket);

        const res = await fetch(`/api/storage/sign?${qs.toString()}`, {
          method: "GET",
          headers: { ...(authHeader || {}) },
          signal,
        });

        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            url?: string;
            signedUrl?: string;
            signed_url?: string;
          };
          const signed = data.signedUrl ?? data.signed_url ?? data.url ?? null;
          if (signed) {
            setState({ url: signed, isLoading: false, error: null });
            return;
          }
        } else {
          const txt = await res.text().catch(() => "");
          lastErr = txt || `Failed to sign: ${candidate}`;
        }
      }

      throw new Error(lastErr || "Failed to sign url");
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setState({ url: null, isLoading: false, error: e?.message || "Unknown error" });
    }
  }, [enabled, path, expiresIn]);

  useEffect(() => {
    const ac = new AbortController();
    run(ac.signal);
    return () => ac.abort();
  }, [run, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const clear = useCallback(() => setState({ url: null, isLoading: false, error: null }), []);

  return useMemo(
    () => ({ url: state.url, isLoading: state.isLoading, error: state.error, refresh, clear }),
    [state, refresh, clear]
  );
}
