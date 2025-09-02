// app/dentist/cases/[id]/components/ImageGallerySelector.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Star, GripVertical, Check, X } from "lucide-react";

export type GalleryItem = {
  id: string;
  url: string;
  caption?: string | null;
  isPrimary?: boolean | null;
  hasAnnotations?: boolean | null;
};

export type ChangePayload = {
  selectedIds: string[];
  primaryId: string | null;
  primaryIndex: number | null;
  orderIds: string[];
};

type Props = {
  items: GalleryItem[];
  selectedIds?: string[];
  primaryId?: string | null;
  maxSelected?: number;
  showToolbar?: boolean;
  onChange?: (p: ChangePayload) => void;
  className?: string;
};

function guessAnnotated(it: GalleryItem) {
  if (typeof it.hasAnnotations === "boolean") return it.hasAnnotations;
  const blob = `${it.id} ${it.url} ${it.caption ?? ""}`.toLowerCase();
  return /(\/annotated\/)|(\bannotated\b)|(\boverlay\b)|(\.ann\.)/.test(blob);
}

export default function ImageGallerySelector({
  items,
  selectedIds: controlledSelected,
  primaryId: controlledPrimary,
  maxSelected,
  showToolbar = true,
  onChange,
  className = "",
}: Props) {
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(controlledSelected ?? []);
  const [primaryId, setPrimaryId] = useState<string | null>(controlledPrimary ?? null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [showAnnotatedOnly, setShowAnnotatedOnly] = useState(false);

  const byId = useMemo(() => {
    const m = new Map<string, GalleryItem>();
    items.forEach((it) => m.set(it.id, it));
    return m;
  }, [items]);

  useEffect(() => {
    setOrderIds((prev) => {
      const existing = prev.filter((id) => byId.has(id));
      const missing = items.map((i) => i.id).filter((id) => !existing.includes(id));
      return existing.concat(missing);
    });
  }, [items, byId]);

  useEffect(() => {
    if (controlledSelected) setSelectedIds(controlledSelected);
  }, [controlledSelected?.join("|")]);

  useEffect(() => {
    if (typeof controlledPrimary !== "undefined") setPrimaryId(controlledPrimary ?? null);
  }, [controlledPrimary]);

  useEffect(() => {
    setPrimaryId((curr) => {
      if (curr && byId.has(curr)) return curr;
      const flagged = items.find((i) => i.isPrimary)?.id;
      if (flagged) return flagged;
      const firstSelected = selectedIds.find((id) => byId.has(id));
      if (firstSelected) return firstSelected;
      const firstInOrder = orderIds[0] ?? null;
      return firstInOrder ?? null;
    });
  }, [items, orderIds.join("|"), selectedIds.join("|")]);

  const primaryIndex = primaryId ? orderIds.indexOf(primaryId) : -1;

  useEffect(() => {
    onChange?.({
      selectedIds,
      primaryId,
      primaryIndex: primaryIndex >= 0 ? primaryIndex : null,
      orderIds,
    });
  }, [selectedIds.join("|"), primaryId, primaryIndex, orderIds.join("|")]);

  const orderedItems = useMemo(() => {
    const arr = orderIds.map((id) => byId.get(id)).filter(Boolean) as GalleryItem[];
    const withAnno = arr.map((it) => ({ ...it, hasAnnotations: guessAnnotated(it) }));
    let out = withAnno;
    if (showSelectedOnly) {
      const sel = new Set(selectedIds);
      out = out.filter((it) => sel.has(it.id));
    }
    if (showAnnotatedOnly) {
      out = out.filter((it) => guessAnnotated(it));
    }
    return out;
  }, [orderIds, byId, showSelectedOnly, showAnnotatedOnly, selectedIds.join("|")]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const set = new Set(prev);
      if (set.has(id)) {
        set.delete(id);
        if (primaryId === id) setPrimaryId(null);
      } else {
        if (typeof maxSelected === "number" && prev.length >= maxSelected) return prev;
        set.add(id);
      }
      return Array.from(set);
    });
  };

  const selectAll = () => {
    const all = [...orderIds];
    const capped = typeof maxSelected === "number" ? all.slice(0, maxSelected) : all;
    setSelectedIds(capped);
    if (primaryId && !capped.includes(primaryId)) setPrimaryId(capped[0] ?? null);
  };

  const clearAll = () => {
    setSelectedIds([]);
    setPrimaryId(null);
  };

  const invertSelection = () => {
    const all = new Set(orderIds);
    const current = new Set(selectedIds);
    const next: string[] = [];
    all.forEach((id) => {
      if (!current.has(id)) next.push(id);
    });
    const capped = typeof maxSelected === "number" && next.length > maxSelected ? next.slice(0, maxSelected) : next;
    setSelectedIds(capped);
    if (primaryId && !capped.includes(primaryId)) setPrimaryId(capped[0] ?? null);
  };

  const makePrimary = (id: string) => {
    setPrimaryId(id);
    setSelectedIds((s) => {
      if (s.includes(id)) return s;
      if (typeof maxSelected === "number" && s.length >= maxSelected) return s;
      return [...s, id];
    });
  };

  const onDragStart = (id: string, e: React.DragEvent) => {
    setDragId(id);
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const onDrop = (targetId: string, e: React.DragEvent) => {
    e.preventDefault();
    const sourceId = dragId || e.dataTransfer.getData("text/plain");
    if (!sourceId || sourceId === targetId) {
      setDragId(null);
      return;
    }
    setOrderIds((curr) => {
      const next = [...curr];
      const from = next.indexOf(sourceId);
      const to = next.indexOf(targetId);
      if (from === -1 || to === -1) return curr;
      next.splice(from, 1);
      next.splice(to, 0, sourceId);
      return next;
    });
    setDragId(null);
  };

  const annotatedCount = useMemo(() => orderedItems.filter((it) => guessAnnotated(it)).length, [orderedItems]);

  return (
    <section className={`card-lg ${className}`}>
      {showToolbar && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="space-x-2">
            <button onClick={selectAll} className="btn btn-outline">Select all</button>
            <button onClick={clearAll} className="btn btn-ghost">Clear</button>
            <button onClick={invertSelection} className="btn btn-ghost">Invert</button>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-current"
                checked={showSelectedOnly}
                onChange={(e) => setShowSelectedOnly(e.target.checked)}
              />
              Show selected only
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-current"
                checked={showAnnotatedOnly}
                onChange={(e) => setShowAnnotatedOnly(e.target.checked)}
              />
              Con anotaciones
              <span className="badge badge-muted">{annotatedCount}</span>
            </label>
            <span className="text-sm muted">
              {selectedIds.length} selected{typeof maxSelected === "number" ? ` / ${maxSelected}` : ""}
            </span>
          </div>
        </div>
      )}

      {orderedItems.length === 0 ? (
        <div className="empty">
          <div className="h-8 w-8 rounded-xl bg-white/5" />
          <p>No images</p>
          <p className="text-sm muted">Upload images to enable selection and reordering.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {orderedItems.map((it) => {
            const isSelected = selectedIds.includes(it.id);
            const isPrimary = primaryId === it.id;
            const orderIndex = orderIds.indexOf(it.id);
            const annotated = guessAnnotated(it);
            return (
              <li
                key={it.id}
                draggable
                onDragStart={(e) => onDragStart(it.id, e)}
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(it.id, e)}
                className={`group relative overflow-hidden rounded-2xl border transition ${dragId === it.id ? "opacity-70" : ""}`}
                style={{
                  borderColor: isSelected
                    ? "color-mix(in oklab, var(--color-primary) 65%, var(--border-alpha))"
                    : "var(--border-alpha)",
                  boxShadow: isSelected ? "0 0 0 2px color-mix(in oklab, var(--color-primary) 35%, transparent) inset" : "none",
                }}
              >
                <div className="absolute left-2 top-2 z-10 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-xl border bg-black/40 px-2 py-1 text-xs text-white backdrop-blur transition hover:bg-black/60"
                    onClick={() => toggleSelect(it.id)}
                    aria-pressed={isSelected}
                  >
                    {isSelected ? (
                      <span className="inline-flex items-center gap-1">
                        <Check className="h-3.5 w-3.5" /> Selected
                      </span>
                    ) : (
                      "Select"
                    )}
                  </button>
                  <button
                    type="button"
                    className={`rounded-xl border px-2 py-1 text-xs backdrop-blur transition ${
                      isPrimary ? "bg-yellow-400/20 border-yellow-400/40 text-white" : "bg-black/40 text-white hover:bg-black/60"
                    }`}
                    onClick={() => (isPrimary ? setPrimaryId(null) : makePrimary(it.id))}
                    aria-pressed={isPrimary}
                    title="Set as primary"
                  >
                    <span className="inline-flex items-center gap-1">
                      <Star className={`h-3.5 w-3.5 ${isPrimary ? "" : "opacity-70"}`} />
                      {isPrimary ? "Primary" : "Primary"}
                    </span>
                  </button>
                </div>

                <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
                  {annotated && (
                    <span
                      className="rounded-lg border px-2 py-1 text-xs backdrop-blur"
                      style={{
                        color: "#E2E8F0",
                        background: "color-mix(in oklab, var(--color-success) 20%, rgba(0,0,0,.45))",
                        borderColor: "color-mix(in oklab, var(--color-success) 55%, var(--border-alpha))",
                      }}
                      title="Contains annotations"
                    >
                      Annotated
                    </span>
                  )}
                  <span className="rounded-lg border bg-black/40 px-2 py-1 text-xs text-white backdrop-blur">#{orderIndex + 1}</span>
                </div>

                <div className="relative aspect-[4/3] w-full overflow-hidden bg-black">
                  <img
                    src={it.url}
                    alt={it.caption || "Image"}
                    className="h-full w-full object-contain transition group-hover:scale-[1.01]"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 border-t px-2 py-1.5">
                  <div className="truncate text-xs muted" title={it.caption || it.id}>
                    {it.caption || it.id}
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <GripVertical className="h-4 w-4 opacity-70" />
                    Drag to reorder
                  </div>
                </div>

                {isSelected && (
                  <button
                    type="button"
                    onClick={() => toggleSelect(it.id)}
                    className="absolute bottom-2 right-2 z-10 rounded-xl border bg-black/40 p-1 text-white backdrop-blur hover:bg-black/60"
                    aria-label="Remove from selection"
                    title="Remove from selection"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
