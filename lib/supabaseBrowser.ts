// lib/supabaseBrowser.ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/db";

let singleton: SupabaseClient<Database> | null = null;

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return { url, key };
}

export function getSupabaseBrowser(): SupabaseClient<Database> {
  if (typeof window === "undefined") {
    throw new Error("getSupabaseBrowser must be called in the browser");
  }
  if (!singleton) {
    const { url, key } = getEnv();
    singleton = createClient<Database>(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
      global: { headers: { "X-Client-Info": "dentistfront-browser" } },
    });
  }
  return singleton;
}
