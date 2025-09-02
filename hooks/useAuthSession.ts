// hooks/useAuthSession.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User as SupaUser, AuthChangeEvent } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "../lib/supabaseBrowser";

type Role = "dentist" | "tech" | "admin" | "user";
type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthState = {
  status: AuthStatus;
  session: Session | null;
  user: SupaUser | null;
  role: Role | null;
};

function metaRoleOf(u: SupaUser | null): Role | null {
  if (!u) return null;
  const fromApp = typeof (u as any)?.app_metadata?.role === "string" ? (u as any).app_metadata.role : null;
  const fromUser = typeof u.user_metadata?.role === "string" ? u.user_metadata.role : null;
  const cand = (fromApp ?? fromUser)?.toLowerCase();
  if (cand === "technician") return "tech";
  if (cand === "dentist" || cand === "tech" || cand === "admin" || cand === "user") return cand as Role;
  return null;
}

export default function useAuthSession() {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [state, setState] = useState<AuthState>({
    status: "loading",
    session: null,
    user: null,
    role: null,
  });
  const lastKeyRef = useRef<string>("");

  const resolveRole = useCallback(
    async (u: SupaUser | null): Promise<Role | null> => {
      const meta = metaRoleOf(u);
      if (meta) return meta;
      if (!u) return null;
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", u.id)
          .maybeSingle<{ role: string | null }>();
        if (error || !data) return null;
        const raw = data.role?.toLowerCase() ?? null;
        if (raw === "technician") return "tech";
        if (raw === "dentist" || raw === "tech" || raw === "admin" || raw === "user") return raw as Role;
        return null;
      } catch {
        return null;
      }
    },
    [supabase]
  );

  const applyState = useCallback(
    async (s: Session | null) => {
      const u = s?.user ?? null;
      const r = await resolveRole(u);
      const key = `${s ? "1" : "0"}:${u?.id ?? ""}:${r ?? ""}`;
      if (key === lastKeyRef.current) return;
      lastKeyRef.current = key;
      setState({
        status: s ? "authenticated" : "unauthenticated",
        session: s,
        user: u,
        role: r,
      });
    },
    [resolveRole]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      await applyState(data.session ?? null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event: AuthChangeEvent, s: Session | null) => {
        if (!mounted) return;
        await applyState(s);
      }
    );

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, applyState]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await applyState(data.session ?? null);
  }, [supabase, applyState]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    await refresh();
  }, [supabase, refresh]);

  return {
    status: state.status,
    session: state.session,
    user: state.user,
    role: state.role,
    refresh,
    signOut,
    isAuthenticated: state.status === "authenticated",
    isLoading: state.status === "loading",
  };
}
