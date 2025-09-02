import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabaseServer";
import SubnavTech from "./SubnavTech";

function normalizeRole(input?: unknown): "dentist" | "tech" | "admin" | null {
  if (!input || typeof input !== "string") return null;
  const v = input.toLowerCase();
  if (v === "technician") return "tech";
  if (v === "tech" || v === "dentist" || v === "admin") return v as any;
  return null;
}

export const metadata: Metadata = { title: "Tech | Dentist Assistant" };

export default async function TechLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login");

  let role =
    normalizeRole((user as any)?.app_metadata?.role) ??
    normalizeRole((user as any)?.user_metadata?.role);

  if (!role) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle<{ role: string | null }>();
    role = normalizeRole(profile?.role ?? null) ?? "tech";
  }

  if (role !== "tech" && role !== "admin") redirect("/");

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="container-app">
        <div className="w-full max-w-none px-6 pt-4">
          <SubnavTech />
        </div>
      </div>
      <main className="container-app">
        <div className="w-full max-w-none px-6 pb-10">{children}</div>
      </main>
    </div>
  );
}
