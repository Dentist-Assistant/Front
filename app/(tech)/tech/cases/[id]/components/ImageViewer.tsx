"use client";

import { useState } from "react";
import useSignedUrl from "../../../../../../hooks/useSignedUrl";

type Props = {
  path?: string;
  caption?: string;
};

export default function ImageViewer({ path, caption }: Props) {
  const { url, isLoading } = useSignedUrl(path);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  const zoomIn = () => setScale((s) => Math.min(3, +(s + 0.25).toFixed(2)));
  const zoomOut = () => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)));
  const resetView = () => {
    setScale(1);
    setRotation(0);
  };
  const rotate = () => setRotation((r) => (r + 90) % 360);

  return (
    <section className="card-lg p-0">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-medium">Image</h2>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost" onClick={zoomOut} aria-label="Zoom out" title="Zoom out">
            −
          </button>
          <span className="text-sm tabular-nums">{Math.round(scale * 100)}%</span>
          <button className="btn btn-ghost" onClick={zoomIn} aria-label="Zoom in" title="Zoom in">
            +
          </button>
          <button className="btn btn-ghost" onClick={rotate} aria-label="Rotate" title="Rotate">
            ↻
          </button>
          <button className="btn" onClick={resetView} aria-label="Reset view" title="Reset">
            Reset
          </button>
        </div>
      </div>

      <div className="relative h-[360px] w-full overflow-auto bg-[var(--color-surface)]">
        {isLoading && <div className="skeleton absolute inset-0" />}
        {!isLoading && url && (
          <div className="flex h-full w-full items-center justify-center">
            <img
              src={url}
              alt="Case image"
              className="max-h-full max-w-full select-none"
              style={{
                transform: `scale(${scale}) rotate(${rotation}deg)`,
                transformOrigin: "center center",
                transition: "transform 200ms ease",
              }}
            />
          </div>
        )}
        {!isLoading && !url && (
          <div className="empty h-full">
            <div className="h-8 w-8 rounded-xl bg-white/5" />
            <p>No image to display</p>
            <p className="text-sm muted">Upload or share an image for this case.</p>
          </div>
        )}
      </div>

      {caption && (
        <div className="border-t px-4 py-2 text-sm text-[var(--color-text)]/85">
          {caption}
        </div>
      )}
    </section>
  );
}
