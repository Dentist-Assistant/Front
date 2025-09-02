// app/dentist/cases/[id]/components/LegendCallouts.tsx
"use client";

import { useMemo } from "react";

type Severity = "low" | "medium" | "high";

export type LegendItem = {
  id: number | string;
  label: string;
  tooth_fdi?: number | null;
  note?: string | null;
  severity?: Severity | null;
  selected?: boolean;
  disabled?: boolean;
};

type Props = {
  items: LegendItem[];
  title?: string;
  className?: string;
  onHover?: (id: string | number | null) => void;
  onSelect?: (id: string | number) => void;
  dense?: boolean;
};

function sevColors(sev: Severity | null | undefined) {
  if (sev === "high") {
    return {
      ring: "color-mix(in oklab, var(--color-danger) 70%, transparent)",
      pillBg: "color-mix(in oklab, var(--color-danger) 18%, transparent)",
      pillBorder: "color-mix(in oklab, var(--color-danger) 55%, var(--border-alpha))",
      pillText: "#FECACA",
    };
  }
  if (sev === "medium") {
    return {
      ring: "color-mix(in oklab, var(--color-warning) 70%, transparent)",
      pillBg: "color-mix(in oklab, var(--color-warning) 18%, transparent)",
      pillBorder: "color-mix(in oklab, var(--color-warning) 55%, var(--border-alpha))",
      pillText: "#FFEFC7",
    };
  }
  return {
    ring: "color-mix(in oklab, var(--color-success) 70%, transparent)",
    pillBg: "color-mix(in oklab, var(--color-success) 18%, transparent)",
    pillBorder: "color-mix(in oklab, var(--color-success) 55%, var(--border-alpha))",
    pillText: "#DCFCE7",
  };
}

function sevLabel(s?: Severity | null) {
  if (s === "high") return "High";
  if (s === "medium") return "Medium";
  if (s === "low") return "Low";
  return "—";
}

export default function LegendCallouts({
  items,
  title = "Legend",
  className = "",
  onHover,
  onSelect,
  dense = false,
}: Props) {
  const count = items.length;

  const rows = useMemo(
    () =>
      items.map((it) => {
        const sev = (it.severity ?? "low") as Severity | null;
        const c = sevColors(sev);
        return { ...it, sev, c };
      }),
    [items]
  );

  return (
    <section className={`rounded-2xl border ${className}`}>
      <header className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="badge badge-muted">{count}</span>
      </header>

      {count === 0 ? (
        <div className="p-4">
          <div className="empty">
            <div className="h-8 w-8 rounded-xl bg-white/5" />
            <p>No callouts</p>
            <p className="text-sm muted">Run draft or add annotations to see the legend.</p>
          </div>
        </div>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-auto p-3">
          {rows.map((row) => {
            const selected = !!row.selected;
            const disabled = !!row.disabled;
            return (
              <li
                key={row.id}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-pressed={selected}
                aria-disabled={disabled}
                onMouseEnter={() => !disabled && onHover?.(row.id)}
                onMouseLeave={() => !disabled && onHover?.(null)}
                onClick={() => !disabled && onSelect?.(row.id)}
                onKeyDown={(e) => {
                  if (disabled) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect?.(row.id);
                  }
                }}
                className={`flex items-center justify-between gap-3 rounded-xl border px-2 py-2 transition ${
                  disabled ? "opacity-60" : "cursor-pointer hover:bg-white/[0.04]"
                }`}
                style={{
                  borderColor: selected ? row.c.ring : "var(--border-alpha)",
                  boxShadow: selected ? `0 0 0 2px ${row.c.ring} inset` : "none",
                }}
              >
                <div className="min-w-0 flex items-center gap-3">
                  <span
                    className="grid h-7 w-7 place-items-center rounded-full text-[12px] font-semibold"
                    style={{
                      background: row.c.pillBg,
                      border: `1px solid ${row.c.pillBorder}`,
                      color: "#0B1220",
                      boxShadow: `0 0 0 2px ${row.c.ring}`,
                    }}
                    aria-label={`#${row.label}`}
                  >
                    <span
                      className="grid h-5 w-5 place-items-center rounded-full"
                      style={{ background: row.c.pillText, color: "#0B1220" }}
                    >
                      {row.label}
                    </span>
                  </span>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {typeof row.tooth_fdi === "number" ? `Tooth ${row.tooth_fdi}` : "Tooth —"}
                      </span>
                      <span
                        className="badge"
                        style={{
                          background: row.c.pillBg,
                          borderColor: row.c.pillBorder,
                          color: row.c.pillText,
                        }}
                      >
                        {sevLabel(row.severity)}
                      </span>
                    </div>
                    {!dense && (
                      <p className="truncate text-xs muted" title={row.note || ""}>
                        {row.note || "—"}
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-xs muted">#{String(row.id)}</div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
