"use client";

import { useMemo, useRef, useState } from "react";
import { getSupabaseBrowser } from "../../../../../../lib/supabaseBrowser";

type Props = { caseId: string; onUploaded?: () => void };

type Pending = {
  file: File;
  path: string; 
  status: "queued" | "uploading" | "saving" | "done" | "error";
  error?: string;
};

const BUCKET = "cases";

export default function UploadImages({ caseId, onUploaded }: Props) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [items, setItems] = useState<Pending[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const resetPicker = () => {
    if (inputRef.current) inputRef.current.value = "";
  };

  const pick = () => inputRef.current?.click();

  const extFromFile = (f: File) => {
    const fromName = (f.name.split(".").pop() || "").toLowerCase();
    const fromType = (f.type.split("/").pop() || "").toLowerCase();
    const ext = (fromName || fromType || "bin").replace(/[^\w]/g, "");
    return ext || "bin";
  };

  const onChoose = (files: FileList | null) => {
    if (!files || !files.length) return;
    const next: Pending[] = Array.from(files).map((f) => {
      const ext = extFromFile(f);
      const path = `original/${caseId}/${crypto.randomUUID()}.${ext}`;
      return { file: f, path, status: "queued" as const };
    });
    setItems((s) => [...s, ...next]);
    resetPicker(); 
  };

  const removeQueued = (path: string) => {
    setItems((s) => s.filter((i) => !(i.status === "queued" && i.path === path)));
    resetPicker(); 
  };

  const clearQueued = () => {
    setItems((s) => s.filter((i) => i.status !== "queued"));
    resetPicker();
  };

  const deleteUploaded = async (path: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/storage/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: BUCKET, path, caseId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Delete failed");

      setItems((s) => s.filter((i) => i.path !== path));
      onUploaded?.();
    } catch (e: any) {
      alert(e?.message || "Delete failed");
    } finally {
      setBusy(false);
      resetPicker();
    }
  };

  const uploadOne = async (item: Pending) => {
    setItems((s) => s.map((i) => (i.path === item.path ? { ...i, status: "uploading", error: undefined } : i)));

    const signRes = await fetch("/api/storage/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: item.path, bucket: BUCKET }),
    });
    if (!signRes.ok) {
      const msg = await signRes.text();
      setItems((s) =>
        s.map((i) => (i.path === item.path ? { ...i, status: "error", error: msg || "Sign error" } : i))
      );
      return;
    }
    const { bucket, path, token } = (await signRes.json()) as { bucket: string; path: string; token: string };

    const up = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, item.file, {
      contentType: item.file.type || "application/octet-stream",
      upsert: false,
    });
    if (up.error) {
      setItems((s) =>
        s.map((i) =>
          i.path === item.path ? { ...i, status: "error", error: up.error.message || "Upload failed" } : i
        )
      );
      return;
    }

    setItems((s) => s.map((i) => (i.path === item.path ? { ...i, status: "saving" } : i)));

    let width: number | null = null;
    let height: number | null = null;
    try {
      const bmp = await createImageBitmap(item.file);
      width = bmp.width;
      height = bmp.height;
    } catch {
    }

    const { error: dbErr } = await (supabase as any)
      .from("case_images")
      .insert({
        case_id: caseId,
        storage_path: path,
        width,
        height,
        md5: null,
        is_original: true,
      })
      .select("id")
      .single();

    if (dbErr) {
      setItems((s) =>
        s.map((i) =>
          i.path === item.path ? { ...i, status: "error", error: dbErr.message || "DB save failed" } : i
        )
      );
      return;
    }

    setItems((s) => s.map((i) => (i.path === item.path ? { ...i, status: "done" } : i)));
  };

  const startUpload = async () => {
    setBusy(true);
    for (const it of items.filter((x) => x.status === "queued")) {
      await uploadOne(it);
    }
    setBusy(false);
    onUploaded?.();
    resetPicker();
  };

  return (
    <section className="card-lg">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Upload images</h3>
          <p className="text-xs muted">
            Formats: JPG, PNG, WEBP. Files are stored privately in the <code>{BUCKET}</code> bucket under{" "}
            <code>/original/{caseId}/</code>.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline" onClick={pick} disabled={busy}>
            Choose files
          </button>
          <button
            className="btn btn-primary"
            onClick={startUpload}
            disabled={busy || !items.some((i) => i.status === "queued")}
            aria-disabled={busy || !items.some((i) => i.status === "queued")}
            aria-busy={busy}
            title="Start uploading queued files"
          >
            {busy ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>

      <div
        className={`rounded-xl border p-6 text-center ${dragOver ? "bg-white/5" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onChoose(e.dataTransfer.files);
        }}
      >
        <p className="text-sm muted">Drag & drop or click “Choose files”.</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => onChoose(e.target.files)}
          onClick={(e) => {
            (e.target as HTMLInputElement).value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <>
          <ul className="mt-4 space-y-2">
            {items.map((it) => (
              <li key={it.path} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{it.file.name}</p>
                  <p className="muted text-xs">{(it.file.size / 1024).toFixed(1)} KB</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="badge">
                    {it.status === "queued" && "Queued"}
                    {it.status === "uploading" && "Uploading…"}
                    {it.status === "saving" && "Saving…"}
                    {it.status === "done" && "Done"}
                    {it.status === "error" && `Error: ${it.error ?? ""}`}
                  </span>

                  {it.status === "queued" && (
                    <button
                      className="btn btn-ghost"
                      onClick={() => removeQueued(it.path)}
                      disabled={busy}
                      title="Remove from queue"
                    >
                      Remove
                    </button>
                  )}

                  {it.status === "done" && (
                    <button
                      className="btn btn-outline"
                      onClick={() => deleteUploaded(it.path)}
                      disabled={busy}
                      title="Delete from case"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {items.some((i) => i.status === "queued") && (
            <div className="mt-3 flex justify-end">
              <button className="btn btn-ghost" onClick={clearQueued} disabled={busy} title="Clear queued files">
                Clear queued
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
