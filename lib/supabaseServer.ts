import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export function createClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

  const cookieStore = cookies();

  const safeSet = (name: string, value: string, options: CookieOptions) => {
    try {
      if (typeof (cookieStore as any)?.set === "function") {
        (cookieStore as any).set({ name, value, ...options });
      }
    } catch {}
  };
  const safeRemove = (name: string, options: CookieOptions) => {
    try {
      if (typeof (cookieStore as any)?.delete === "function") {
        (cookieStore as any).delete(name);
      } else if (typeof (cookieStore as any)?.set === "function") {
        (cookieStore as any).set({ name, value: "", ...options, maxAge: 0 });
      }
    } catch {}
  };

  return createServerClient(url, anon, {
    cookies: {
      async get(name: string) {
        return (await cookieStore).get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        safeSet(name, value, options);
      },
      remove(name: string, options: CookieOptions) {
        safeRemove(name, options);
      },
    },
  });
}
