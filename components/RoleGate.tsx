"use client";

import { ReactNode } from "react";
import Link from "next/link";
import useAuthSession from "../hooks/useAuthSession";
import Spinner from "./Spinner";
import Badge from "./Badge";

type Role = "dentist" | "tech" | "admin";

type Props = {
  allowed: Role[];
  children: ReactNode;
  fallback?: ReactNode;
};

export default function RoleGate({ allowed, children, fallback }: Props) {
  const { user, isLoading, role, isAuthenticated } = useAuthSession();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
        <div className="rounded-2xl border border-muted/20 bg-surface p-8 flex items-center gap-3">
          <Spinner />
          <p className="text-sm text-muted">Loading access</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10">
        <div className="rounded-2xl border border-muted/20 bg-surface p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-text">Authentication required</h2>
              <p className="mt-1 text-sm text-muted">Sign in to continue.</p>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center rounded-2xl px-4 py-2 text-sm font-semibold text-bg bg-primary hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const roleInGate = role as Role | undefined;

  if (!roleInGate || !allowed.includes(roleInGate)) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10" role="alert">
        <div className="rounded-2xl border border-muted/20 bg-surface p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-text">Access denied</h2>
              <p className="mt-1 text-sm text-muted">
                Your role does not have permission to view this content.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant="neutral">Your role: {roleInGate ?? "unknown"}</Badge>
                <Badge variant="neutral">Allowed: {allowed.join(", ")}</Badge>
              </div>
            </div>
            <Link
              href="/"
              className="inline-flex items-center rounded-2xl px-4 py-2 text-sm font-semibold text-text border border-muted/20 hover:bg-muted/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition"
            >
              Go home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
