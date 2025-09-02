"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, FolderOpen, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "../../../lib/supabaseBrowser"; 
import type { SupabaseClient } from "@supabase/supabase-js";

export default function SubnavTech() {
  const pathname = usePathname();
  const router = useRouter();

  const isHome = pathname === "/tech" || pathname === "/tech/";
  const isCases = pathname?.startsWith("/tech/cases");

  const baseBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-white/5 focus:bg-white/5";
  const active = "bg-white/10 ring-1 ring-white/10";

  const [authed, setAuthed] = useState<boolean>(false);
  const supabaseRef = useRef<SupabaseClient | null>(null);

  useEffect(() => {
    const supa = getSupabaseBrowser();
    supabaseRef.current = supa;

    supa.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session);
    });

    const {
      data: { subscription },
    } = supa.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const onSignOut = async () => {
    await supabaseRef.current?.auth.signOut();
    router.replace("/login");
  };

  return (
    <nav aria-label="Tech navigation" className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Link
          href="/tech"
          aria-label="Dashboard"
          title="Dashboard"
          className={`${baseBtn} ${isHome ? active : ""}`}
        >
          <LayoutDashboard className="h-5 w-5" />
        </Link>
        <Link
          href="/tech/cases"
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
