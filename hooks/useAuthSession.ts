"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

export default function useAuthSession() {
  const supabase = useMemo(() => getSupabaseBrowser(), []);

  const [state, setState] = useState<AuthState>({
    status: "loading",
    session: null,
    user: null,
    role: null,
  });

  const resolveRole = useCallback(
    async (u: SupaUser | null): Promise<Role | null> => {
      if (!u) return null;

      const metaRole =
        typeof u.user_metadata?.role === "string"
          ? (u.user_metadata.role as Role)
          : null;
      if (metaRole) return metaRole;

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", u.id)
          .maybeSingle<{ role: Role | null }>(); 

        if (error || !data) return null;
        return data.role ?? null;
      } catch {
        return null;
      }
    },
    [supabase]
  );

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const s = data.session ?? null;
    const u = s?.user ?? null;
    const r = await resolveRole(u);
    setState({
      status: s ? "authenticated" : "unauthenticated",
      session: s,
      user: u,
      role: r,
    });
  }, [resolveRole, supabase]);

  useEffect(() => {
    let alive = true;

    refresh();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, s: Session | null) => {
        const u = s?.user ?? null;
        resolveRole(u).then((r) => {
          if (!alive) return;
          setState({
            status: s ? "authenticated" : "unauthenticated",
            session: s,
            user: u,
            role: r,
          });
        });
      }
    );

    return () => {
      alive = false;
      authListener.subscription.unsubscribe();
    };
  }, [resolveRole, refresh, supabase]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    await refresh();
  }, [refresh, supabase]);

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
