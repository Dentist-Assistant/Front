import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/db";

let singleton: SupabaseClient<Database> | null = null;

export function getSupabaseBrowser(): SupabaseClient<Database> {
  if (!singleton) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
    if (!key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");

    const isBrowser = typeof window !== "undefined";

    singleton = createClient<Database>(url, key, {
      auth: {
        persistSession: isBrowser,
        autoRefreshToken: isBrowser,
      },
      global: { headers: { "X-Client-Info": "dentistfront-browser" } },
    });
  }
  return singleton;
}
