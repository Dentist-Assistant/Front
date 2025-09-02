"use client";

import { useCallback, useId, useRef, useState } from "react";
import Spinner from "./Spinner";

type UploadedFile = {
  name: string;
  url: string;
};

type Props = {
  accept?: string;
  multiple?: boolean;
  maxFiles?: number;
  maxSizeMB?: number;
  label?: string;
  className?: string;
  onComplete?: (files: UploadedFile[]) => void;
};

type ItemState = {
  name: string;
  status: "idle" | "uploading" | "done" | "error";
  url?: string;
  error?: string;
};

export default function Uploader({
  accept = "image/*",
  multiple = true,
  maxFiles = 10,
  maxSizeMB = 20,
  label = "Upload files",
  className = "",
  onComplete,
}: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [items, setItems] = useState<ItemState[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = () => inputRef.current?.click();

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setError(null);

      const files = Array.from(fileList).slice(0, maxFiles);
      const tooBig = files.find((f) => f.size > maxSizeMB * 1024 * 1024);
      if (tooBig) {
        setError(`One or more files exceed ${maxSizeMB}MB`);
        return;
      }

      setBusy(true);
      const startItems: ItemState[] = files.map((f) => ({
        name: f.name,
        status: "uploading",
      }));
      setItems((prev) => [...startItems, ...prev]);

      const uploaded: UploadedFile[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const signRes = await fetch("/api/storage/sign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: file.name,
              contentType: file.type || "application/octet-stream",
            }),
          });

          if (!signRes.ok) {
            throw new Error("Failed to get signed URL");
          }

          const { uploadUrl, publicUrl } = (await signRes.json()) as {
            uploadUrl: string;
            publicUrl: string;
          };

          const putRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file,
          });

          if (!putRes.ok) {
            throw new Error("Upload failed");
          }

          uploaded.push({ name: file.name, url: publicUrl });
          setItems((prev) => {
            const next = [...prev];
            const idx = next.findIndex((x) => x.name === file.name && x.status === "uploading");
            if (idx !== -1) next[idx] = { name: file.name, status: "done", url: publicUrl };
            return next;
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Upload error";
          setItems((prev) => {
            const next = [...prev];
            const idx = next.findIndex((x) => x.name === file.name && x.status === "uploading");
            if (idx !== -1) next[idx] = { name: file.name, status: "error", error: message };
            return next;
          });
          setError(message);
        }
      }

      setBusy(false);
      if (uploaded.length && onComplete) onComplete(uploaded);
      if (inputRef.current) inputRef.current.value = "";
    },
    [maxFiles, maxSizeMB, onComplete]
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleFiles(e.target.files);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    void handleFiles(e.dataTransfer.files);
  };

  const zoneClasses =
    "relative flex flex-col items-center justify-center rounded-2xl border border-muted/20 bg-surface p-6 text-center transition-colors duration-200 focus-within:ring-2 focus-within:ring-primary/60 focus-within:ring-offset-0";
  const activeClasses = dragOver ? "ring-2 ring-primary/60 bg-surface/80" : "";

  return (
    <div className={`w-full ${className}`}>
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={pick}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && pick()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`${zoneClasses} ${activeClasses}`}
      >
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          onChange={onInputChange}
        />
        <div className="pointer-events-none flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-muted/30">
            {busy ? <Spinner size="md" label="Uploading" /> : <span className="text-2xl">⬆️</span>}
          </div>
          <div className="mt-1 text-sm text-text">
            {busy ? "Uploading..." : label}
          </div>
          <p className="text-xs text-muted">
            {multiple ? "Drop files or click to select" : "Drop a file or click to select"}
          </p>
          <p className="text-[11px] text-muted">Max {maxFiles} files • {maxSizeMB}MB each</p>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((it, i) => (
            <li
              key={`${it.name}-${i}`}
              className="flex items-center justify-between rounded-xl border border-muted/20 bg-surface px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-muted" />
                <div className="text-sm text-text">{it.name}</div>
              </div>
              <div className="flex items-center gap-3">
                {it.status === "uploading" && <Spinner size="sm" label="Uploading" />}
                {it.status === "done" && (
                  <a
                    href={it.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
                  >
                    View
                  </a>
                )}
                {it.status === "error" && <span className="text-sm text-danger">Error</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
