import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

function normalizeRole(input?: unknown): "dentist" | "tech" | "admin" | null {
  if (!input || typeof input !== "string") return null;
  const v = input.toLowerCase();
  if (v === "technician") return "tech";
  if (v === "tech" || v === "dentist" || v === "admin") return v as any;
  return null;
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const url = req.nextUrl.clone();
  const path = url.pathname;

  const needsAuth = path.startsWith("/tech") || path.startsWith("/dentist");
  if (!needsAuth) return res;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = encodeURIComponent(path + (url.search || ""));
    url.pathname = "/login";
    url.search = next ? `?next=${next}` : "";
    return NextResponse.redirect(url);
  }

  let role =
    normalizeRole((user as any)?.app_metadata?.role) ??
    normalizeRole((user as any)?.user_metadata?.role);

  if (!role) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    role = normalizeRole(profile?.role);
  }

  if (path.startsWith("/tech") && !(role === "tech" || role === "admin")) {
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (path.startsWith("/dentist") && !(role === "dentist" || role === "admin")) {
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/tech/:path*", "/dentist/:path*"],
};
