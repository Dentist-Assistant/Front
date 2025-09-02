import Link from "next/link";
import { FolderOpen, Home as HomeIcon } from "lucide-react";

export default function TechHomePage() {
  return (
    <section className="card-lg">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Welcome, Technician</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Review your assigned cases and share clear, actionable feedback.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
         
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="card">
          <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <FolderOpen className="h-4 w-4" />
            Assigned
          </div>
          <div className="mt-1 text-[var(--color-text)]">
            Open your queue and start with the newest case.
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M3 4h18M3 10h18M3 16h18" />
            </svg>
            Review
          </div>
          <div className="mt-1 text-[var(--color-text)]">
            Check the shared image and latest report version.
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Collaborate
          </div>
          <div className="mt-1 text-[var(--color-text)]">
            Leave concise comments and keep the dentist in the loop.
          </div>
        </div>
      </div>
    </section>
  );
}
