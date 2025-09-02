"use client";

import { ReactNode } from "react";

type SpinnerSize = "sm" | "md" | "lg" | "xl";

type Props = {
  size?: SpinnerSize;
  label?: string;
  className?: string;
  overlay?: boolean;
  children?: ReactNode;
};

export default function Spinner({
  size = "md",
  label = "Loading",
  className = "",
  overlay = false,
  children,
}: Props) {
  const sizeClass: Record<SpinnerSize, string> = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-8 w-8",
    xl: "h-10 w-10",
  };
  const borderClass = size === "lg" || size === "xl" ? "border-[3px]" : "border-2";

  const core = (
    <div role="status" aria-live="polite" className={`inline-flex items-center gap-3 ${className}`}>
      <span
        className={`${sizeClass[size]} ${borderClass} rounded-full border-muted/30 border-t-primary animate-spin`}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );

  if (overlay) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-bg/60 backdrop-blur-sm">
        <div className="rounded-2xl border border-muted/20 bg-surface/90 px-6 py-5 shadow-lg">
          <div className="flex flex-col items-center">
            {core}
            <p className="mt-3 text-sm text-muted">{label}</p>
          </div>
        </div>
      </div>
    );
  }

  return core;
}
