// lib/supabaseServer.ts
import "server-only";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/db";

export function createClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient<Database>(url, anon, {
    cookies: {
      async get(name: string) {
        try {
          const jar = await cookies();
          return jar.get(name)?.value;
        } catch {
          return undefined;
        }
      },
      async set(name: string, value: string, options: CookieOptions) {
        try {
          const jar: any = await cookies();
          jar.set?.({ name, value, ...options });
        } catch {}
      },
      async remove(name: string, options: CookieOptions) {
        try {
          const jar: any = await cookies();
          if (typeof jar.delete === "function") {
            jar.delete(name);
          } else if (typeof jar.set === "function") {
            jar.set({ name, value: "", ...options, maxAge: 0 });
          }
        } catch {}
      },
    },
  });
}
