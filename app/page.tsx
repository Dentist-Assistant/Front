import Link from "next/link";

export default function Page() {
  return (
    <div className="relative">
      <section className="container-page pt-28 pb-24 sm:pt-32 sm:pb-28">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-28 -z-10 h-[460px] bg-[radial-gradient(900px_380px_at_25%_-10%,rgba(34,211,238,0.12),transparent_60%),radial-gradient(700px_300px_at_80%_-20%,rgba(167,139,250,0.10),transparent_60%)]"
        />
        <div className="mx-auto max-w-3xl text-center space-y-7">
          <span className="badge badge-accent">MVP</span>
          <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
            Clinical dental reports with AI and clear approvals
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-[var(--color-muted)]">
            Upload radiographs, generate a precise draft with AI, collaborate with a technician, and approve confidently.
          </p>
          <div className="mt-2 flex items-center justify-center gap-3">
            <Link href="/login" className="btn btn-primary">
              Sign in
            </Link>
            <a href="#features" className="btn btn-outline">
              Learn more
            </a>
          </div>
        </div>
      </section>

      <section id="features" className="container-page pb-24">
        <div className="grid gap-10 sm:grid-cols-3">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="rounded-2xl border bg-white p-4 shadow-[var(--shadow-soft)]">
              <svg className="h-8 w-8 text-[var(--color-primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M3 12h18" />
                <path d="M12 3v18" />
              </svg>
            </div>
            <h3 className="text-base font-semibold">AI Draft</h3>
            <p className="max-w-xs text-sm text-[var(--color-muted)]">Vision+text with FDI mapping and clear findings.</p>
          </div>

          <div className="flex flex-col items-center text-center gap-4">
            <div className="rounded-2xl border bg-white p-4 shadow-[var(--shadow-soft)]">
              <svg className="h-8 w-8 text-[var(--color-accent)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M8 12h8" />
                <path d="M12 8v8" />
                <circle cx="12" cy="12" r="9" />
              </svg>
            </div>
            <h3 className="text-base font-semibold">Tech review</h3>
            <p className="max-w-xs text-sm text-[var(--color-muted)]">Share a minimal packet: selected images + one version.</p>
          </div>

          <div className="flex flex-col items-center text-center gap-4">
            <div className="rounded-2xl border bg-white p-4 shadow-[var(--shadow-soft)]">
              <svg className="h-8 w-8 text-[var(--color-success)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h3 className="text-base font-semibold">Approvals</h3>
            <p className="max-w-xs text-sm text-[var(--color-muted)]">Versioned flow. Lock when signed and export.</p>
          </div>
        </div>

       

        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          <div className="rounded-2xl border bg-white p-6 text-center shadow-[var(--shadow-soft)]">
            <div className="text-2xl font-semibold">RLS</div>
            <p className="mt-1 text-xs text-[var(--color-muted)]">Row Level Security</p>
          </div>
          <div className="rounded-2xl border bg-white p-6 text-center shadow-[var(--shadow-soft)]">
            <div className="text-2xl font-semibold">Versions</div>
            <p className="mt-1 text-xs text-[var(--color-muted)]">Draft → Rebuttal → Signed</p>
          </div>
          <div className="rounded-2xl border bg-white p-6 text-center shadow-[var(--shadow-soft)]">
            <div className="text-2xl font-semibold">Fast</div>
            <p className="mt-1 text-xs text-[var(--color-muted)]">Short paths and clear actions</p>
          </div>
        </div>
      </section>
    </div>
  );
}
