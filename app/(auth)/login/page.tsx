"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "../../../lib/supabaseBrowser";

type Role = "dentist" | "tech" | "admin";
function normalizeRole(input?: unknown): Role | null {
  if (!input || typeof input !== "string") return null;
  const v = input.toLowerCase();
  if (v === "technician") return "tech";
  if (v === "tech" || v === "dentist" || v === "admin") return v as Role;
  return null;
}

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();

  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setSupabase(getSupabaseBrowser());
  }, []);

  const goByRole = useCallback(async (sb: SupabaseClient) => {
    const next = search.get("next");
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;

    if (next) {
      router.replace(next);
      return;
    }

    let role =
      normalizeRole((user as any)?.app_metadata?.role) ??
      normalizeRole((user as any)?.user_metadata?.role);

    if (!role) {
      const { data: prof } = await (sb as any)
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      role = normalizeRole(prof?.role) ?? "dentist";
    }

    router.replace(role === "tech" ? "/tech" : "/dentist");
  }, [router, search]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;

      await fetch("/api/auth/set-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }),
      });

      await goByRole(supabase);
    };

    run();
    return () => { cancelled = true; };
  }, [supabase, goByRole]);

  const onSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!supabase) return;
    setErr(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error, data } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        if (data.session) {
          await fetch("/api/auth/set-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
            }),
          });
        }
      } else {
        const { error, data } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        if (data.session) {
          await fetch("/api/auth/set-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
            }),
          });
        }
      }

      await goByRole(supabase);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [supabase, mode, email, password, goByRole]);

  return (
    <div className="container-page grid min-h-dvh place-items-center py-10">
      <div className="w-full max-w-sm rounded-2xl border bg-[var(--color-surface)] p-6 shadow-[var(--shadow-soft)]">
        <div className="mb-6 space-y-1">
          <div className="inline-flex items-center gap-2">
            <span className="inline-block h-6 w-6 rounded-xl bg-[var(--color-primary)]" />
            <h1 className="text-lg font-semibold">Sign in to Dentist Assistant</h1>
          </div>
          <p className="text-sm text-[var(--color-muted)]">Secure access for dentists and technicians</p>
        </div>

        {err && (
          <div
            role="alert"
            aria-live="polite"
            className="mb-4 rounded-xl border border-[color:var(--color-danger)]/40 bg-[color:var(--color-danger)]/10 px-3 py-2 text-sm"
          >
            {err}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="label">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
            />
            <p className="help">Min. 8 characters</p>
          </div>

          <button
            type="submit"
            disabled={loading || !supabase}
            className="btn btn-primary w-full"
            aria-busy={loading}
          >
            {loading ? "Loading…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          {mode === "signin" ? (
            <button onClick={() => setMode("signup")} className="btn btn-ghost w-full">
              New here? Create an account
            </button>
          ) : (
            <button onClick={() => setMode("signin")} className="btn btn-ghost w-full">
              Already have an account? Sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-6">Cargando…</div>}>
      <LoginInner />
    </Suspense>
  );
}
