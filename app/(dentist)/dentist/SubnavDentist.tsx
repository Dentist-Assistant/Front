"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, FolderOpen, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "../../../lib/supabaseBrowser";
import type { SupabaseClient } from "@supabase/supabase-js";

export default function SubnavDentist() {
  const pathname = usePathname();
  const router = useRouter();

  const isOverview = pathname === "/dentist" || pathname === "/dentist/";
  const isCases = pathname?.startsWith("/dentist/cases");

  const baseBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-white/5 focus:bg-white/5";
  const active = "bg-white/10 ring-1 ring-white/10";

  const [authed, setAuthed] = useState(false);
  const supabaseRef = useRef<SupabaseClient | null>(null);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    supabaseRef.current = sb;

    sb.auth.getSession().then(({ data }) => setAuthed(!!data.session));

    const { data: { subscription } } = sb.auth.onAuthStateChange((_evt, session) => {
      setAuthed(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const onSignOut = async () => {
    await supabaseRef.current?.auth.signOut();
    router.replace("/login");
  };

  return (
    <nav aria-label="Dentist navigation" className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Link
          href="/dentist"
          aria-label="Overview"
          title="Overview"
          className={`${baseBtn} ${isOverview ? active : ""}`}
        >
          <LayoutDashboard className="h-5 w-5" />
        </Link>
        <Link
          href="/dentist/cases"
          aria-label="Cases"
          title="Cases"
          className={`${baseBtn} ${isCases ? active : ""}`}
        >
          <FolderOpen className="h-5 w-5" />
        </Link>
      </div>

      {authed ? (
        <button
          onClick={onSignOut}
          aria-label="Sign out"
          title="Sign out"
          className={baseBtn}
        >
          <LogOut className="h-5 w-5" />
        </button>
      ) : (
        <span className="h-9 w-9" aria-hidden />
      )}
    </nav>
  );
}
