import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dentist Assistant · MVP",
  description: "Asistente clínico para dentistas y técnicos con IA.",
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  themeColor: "#F3F6FB",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh bg-[var(--color-bg)] text-[var(--color-text)] antialiased selection:bg-[var(--color-primary)]/20 selection:text-[var(--color-text)]">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-[var(--color-surface)] focus:px-4 focus:py-2 focus:text-[var(--color-text)] focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
        >
          Skip to content
        </a>

        <header
          id="top"
          className="sticky top-0 z-40 w-full border-b border-black/10 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60"
        >
          <div className="flex h-16 w-full items-center justify-between px-5 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="h-7 w-7 rounded-xl bg-[var(--color-primary)]" aria-hidden />
              <span className="text-sm font-semibold tracking-tight">Dentist Assistant</span>
            </div>
            <span className="badge badge-muted">MVP</span>
          </div>
        </header>

        <main id="main" className="flex-1 pb-16">{children}</main>

        <footer className="w-full border-t border-black/10 py-8">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 text-sm text-[var(--color-muted)] sm:px-8 lg:px-10">
            <p>© {new Date().getFullYear()} Dentist Assistant. Built with privacy in mind.</p>
            <a href="#top" aria-label="Back to top" className="btn btn-ghost p-2">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 19V5" />
                <path d="m5 12 7-7 7 7" />
              </svg>
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
