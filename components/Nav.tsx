"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [elevated, setElevated] = useState(false);

  useEffect(() => {
    const onScroll = () => setElevated(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const casesHref = useMemo(() => {
    if (pathname?.startsWith("/tech")) return "/tech/tech/cases";
    if (pathname?.startsWith("/dentist")) return "/dentist/dentist/cases";
    return "/dentist/dentist/cases";
  }, [pathname]);

  const links = useMemo(
    () => [
      { name: "Home", href: "/" },
      { name: "Dentist", href: "/dentist/dentist" },
      { name: "Tech", href: "/tech/tech" },
      { name: "Cases", href: casesHref },
    ],
    [casesHref]
  );

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + "/");

  return (
    <header
      className={cx(
        "sticky top-0 z-50 w-full backdrop-blur supports-[backdrop-filter]:bg-surface/60",
        "border-b border-muted/20",
        elevated && "shadow-[0_4px_24px_rgba(0,0,0,0.25)]"
      )}
      role="banner"
    >
      <nav aria-label="Global" className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-xl">
            <Image src="/logo.svg" alt="DentistFlow logo" width={24} height={24} priority />
            <span className="text-sm font-semibold tracking-tight text-text">DentistFlow</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.name}
                href={l.href}
                className={cx(
                  "px-3 py-2 rounded-xl text-sm font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  isActive(l.href)
                    ? "text-primary bg-primary/10"
                    : "text-muted hover:text-text hover:bg-muted/10"
                )}
              >
                {l.name}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex items-center rounded-2xl px-3 py-2 text-sm font-semibold text-bg bg-primary hover:bg-primary/90 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              Sign in
            </Link>
          </div>

          <button
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="md:hidden inline-flex items-center justify-center rounded-xl p-2 text-text/80 hover:text-text hover:bg-muted/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition"
          >
            <span className="sr-only">Menu</span>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {open && (
          <div className="md:hidden border-t border-muted/20 pb-3 pt-2">
            <div className="flex flex-col gap-1">
              {links.map((l) => (
                <Link
                  key={l.name}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={cx(
                    "px-3 py-2 rounded-xl text-sm font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                    isActive(l.href)
                      ? "text-primary bg-primary/10"
                      : "text-muted hover:text-text hover:bg-muted/10"
                  )}
                >
                  {l.name}
                </Link>
              ))}
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="mt-1 inline-flex w-full items-center justify-center rounded-2xl px-3 py-2 text-sm font-semibold text-bg bg-primary hover:bg-primary/90 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                Sign in
              </Link>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
