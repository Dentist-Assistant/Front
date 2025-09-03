import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const IMAGE_BUCKET = process.env.IMAGE_BUCKET || "cases";
const DEFAULT_TTL = Number(process.env.SIGNED_URL_TTL || "600");
const TTL_MIN = 60;
const TTL_MAX = 604800;

function admin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function clampTtl(n: unknown) {
  const x = Number(n);
  if (!Number.isFinite(x)) return DEFAULT_TTL;
  return Math.max(TTL_MIN, Math.min(TTL_MAX, Math.floor(x)));
}

const Point = z.object({ x: z.number(), y: z.number() });
const Cir = z.object({ cx: z.number(), cy: z.number(), r: z.number(), norm: z.boolean().optional() });
const Lin = z.object({ x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(), norm: z.boolean().optional() });
const Poly = z.object({ points: z.array(Point).min(3), norm: z.boolean().optional() });
const Box = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number(), norm: z.boolean().optional() });

const Geometry = z.object({
  circles: z.array(Cir).optional(),
  lines: z.array(Lin).optional(),
  polygons: z.array(Poly).optional(),
  boxes: z.array(Box).optional(),
});

const Overlay = z.object({
  finding_index: z.number().int().positive().optional(),
  label: z.string().optional(),
  color: z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i).optional(),
  geometry: Geometry,
});

const FindingLike = z.object({
  tooth_fdi: z.number().int().optional(),
  findings: z.array(z.string()).optional(),
  severity: z.string().optional(),
  confidence: z.number().optional(),
  image_index: z.number().int().optional(),
  image_id: z.string().optional(),
  geometry: Geometry.optional(),
});

const Body = z.object({
  caseId: z.string().uuid().optional(),
  basePath: z.string().min(1),
  outputPath: z.string().min(1).optional(),
  format: z.enum(["png", "webp"]).default("webp"),
  quality: z.number().int().min(1).max(100).default(90),
  alpha: z.number().min(0).max(1).default(1),
  strokeWidth: z.number().min(0.5).max(12).default(3),
  overlays: z.array(Overlay).default([]),
  findings: z.array(FindingLike).optional(),
  ttl: z.number().int().positive().optional(),
});

const SEV_COLOR = {
  high: "#EF4444",
  moderate: "#F59E0B",
  low: "#34D399",
};

function hexOrDefault(c?: string, d = "#22D3EE") {
  return c && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) ? c : d;
}

function hexToRgba(hex: string, a = 1) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((ch) => ch + ch).join("") : h;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

function centerOfBox(b: z.infer<typeof Box>) {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

function centerOfLine(l: z.infer<typeof Lin>) {
  return { x: (l.x1 + l.x2) / 2, y: (l.y1 + l.y2) / 2 };
}

function labelFor(o: z.infer<typeof Overlay>, idx: number) {
  if (o.label && o.label.trim()) return o.label.trim();
  if (o.finding_index) return `#${o.finding_index}`;
  return `#${idx}`;
}

function denorm(n: number, dim: number, isNorm?: boolean) {
  return isNorm ? n * dim : n;
}

function svgForOverlays(
  width: number,
  height: number,
  items: z.infer<typeof Overlay>[],
  strokeWidth: number,
  alpha: number
) {
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  );
  parts.push(`<g fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${alpha}" shape-rendering="geometricPrecision">`);
  items.forEach((o, idx) => {
    const color = hexOrDefault(o.color);
    const label = labelFor(o, idx + 1);
    const g = o.geometry || {};
    const texts: Array<{ x: number; y: number }> = [];
    if (Array.isArray(g.circles)) {
      g.circles.forEach((c) => {
        const cx = denorm(c.cx, width, c.norm);
        const cy = denorm(c.cy, height, c.norm);
        const r = denorm(c.r, Math.min(width, height), c.norm);
        parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${color}" stroke-width="${strokeWidth}" fill="none"/>`);
        texts.push({ x: cx, y: cy - r - 4 });
      });
    }
    if (Array.isArray(g.lines)) {
      g.lines.forEach((l) => {
        const x1 = denorm(l.x1, width, l.norm);
        const y1 = denorm(l.y1, height, l.norm);
        const x2 = denorm(l.x2, width, l.norm);
        const y2 = denorm(l.y2, height, l.norm);
        parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${strokeWidth}" />`);
        const c = centerOfLine(l);
        texts.push({ x: denorm(c.x, width, l.norm), y: denorm(c.y, height, l.norm) - 4 });
      });
    }
    if (Array.isArray(g.boxes)) {
      g.boxes.forEach((b) => {
        const x = denorm(b.x, width, b.norm);
        const y = denorm(b.y, height, b.norm);
        const w = denorm(b.w, width, b.norm);
        const h = denorm(b.h, height, b.norm);
        parts.push(
          `<rect x="${x}" y="${y}" width="${w}" height="${h}" stroke="${color}" stroke-width="${strokeWidth}" fill="${hexToRgba(
            color,
            0.14
          )}"/>`
        );
        const c = centerOfBox(b);
        texts.push({ x: denorm(c.x, width, b.norm), y: denorm(c.y, height, b.norm) - 4 });
      });
    }
    if (Array.isArray(g.polygons)) {
      g.polygons.forEach((p) => {
        const pts = p.points.map((pt) => `${denorm(pt.x, width, p.norm)},${denorm(pt.y, height, p.norm)}`).join(" ");
        parts.push(
          `<polygon points="${pts}" stroke="${color}" stroke-width="${strokeWidth}" fill="${hexToRgba(color, 0.14)}"/>`
        );
        const first = p.points[0];
        texts.push({ x: denorm(first.x, width, p.norm), y: denorm(first.y, height, p.norm) - 4 });
      });
    }
    texts.slice(0, 1).forEach((t) => {
      const tx = Math.max(2, Math.min(width - 2, t.x));
      const ty = Math.max(10, Math.min(height - 2, t.y));
      parts.push(
        `<g font-family="sans-serif" font-size="${Math.max(11, Math.round(width * 0.014))}" font-weight="600">` +
          `<rect x="${tx - 6}" y="${ty - 12}" width="${label.length * 7 + 12}" height="16" rx="3" ry="3" fill="rgba(0,0,0,0.5)" />` +
          `<text x="${tx}" y="${ty}" fill="#ffffff">${label}</text>` +
        `</g>`
      );
    });
  });
  parts.push(`</g></svg>`);
  return Buffer.from(parts.join(""));
}

function overlaysFromFindings(findings?: z.infer<typeof FindingLike>[]) {
  const out: z.infer<typeof Overlay>[] = [];
  if (!Array.isArray(findings)) return out;
  findings.forEach((f, i) => {
    if (!f.geometry) return;
    const sev = String(f.severity || "").toLowerCase();
    const color =
      sev.includes("high")
        ? SEV_COLOR.high
        : sev.includes("mod")
        ? SEV_COLOR.moderate
        : SEV_COLOR.low;
    out.push({
      finding_index: i + 1,
      label: f.tooth_fdi ? `FDI ${f.tooth_fdi}` : undefined,
      color,
      geometry: f.geometry,
    });
  });
  return out;
}

function inferCaseIdFromPath(p: string): string | null {
  const parts = p.replace(/^\/+/, "").split("/");
  if (parts.length >= 3 && ["original", "normalized", "annotated"].includes(parts[0])) return parts[1] || null;
  return null;
}

function buildAnnotatedPath(basePath: string, caseId: string, format: "png" | "webp", explicitOutput?: string) {
  const posix = path.posix;
  if (explicitOutput && explicitOutput.startsWith(`annotated/${caseId}/`)) {
    const fname = explicitOutput.split("/").pop() || "image";
    const name = fname.replace(/\.[^.]+$/, "");
    const dir = explicitOutput.slice(0, explicitOutput.length - fname.length).replace(/\/+$/g, "");
    return posix.join(dir, `${name}.${format}`);
  }
  const clean = basePath.replace(/^\/+/, "");
  const parts = clean.split("/");
  let subfolders: string[] = [];
  let fname = parts[parts.length - 1] || `image.${format}`;
  if (parts.length >= 3 && ["original", "normalized", "annotated"].includes(parts[0])) {
    subfolders = parts.slice(2, -1);
  }
  const name = fname.replace(/\.[^.]+$/, "");
  return posix.join("annotated", caseId, ...subfolders, `${name}.${format}`);
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 204 });
}

export async function POST(req: Request) {
  try {
    const sb = admin();
    const json = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.flatten() }, { status: 400 });
    }

    const {
      caseId,
      basePath,
      outputPath,
      format,
      quality,
      alpha,
      strokeWidth,
      overlays,
      findings,
      ttl,
    } = parsed.data;

    const cid = caseId || inferCaseIdFromPath(basePath);
    if (!cid) {
      return NextResponse.json({ error: "missing_caseId", details: "Provide caseId or include it in basePath under original/{caseId}/..." }, { status: 400 });
    }

    const baseObj = await sb.storage.from(IMAGE_BUCKET).download(basePath);
    if (baseObj.error || !baseObj.data) {
      return NextResponse.json({ error: "download_failed", details: baseObj.error?.message || "no_data" }, { status: 400 });
    }
    const baseBuf = Buffer.from(await baseObj.data.arrayBuffer());
    const meta = await sharp(baseBuf).metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;
    if (!width || !height) {
      return NextResponse.json({ error: "invalid_image", details: "missing_dimensions" }, { status: 400 });
    }

    const overlaysInput = overlays.length ? overlays : overlaysFromFindings(findings);
    const svg = svgForOverlays(width, height, overlaysInput, strokeWidth, alpha);

    const outSharp = sharp(baseBuf).composite([{ input: svg, top: 0, left: 0, blend: "over" }]);
    let outBuf: Buffer;
    let contentType: string;
    if (format === "png") {
      outBuf = await outSharp.png({ quality, compressionLevel: 9 }).toBuffer();
      contentType = "image/png";
    } else {
      outBuf = await outSharp.webp({ quality }).toBuffer();
      contentType = "image/webp";
    }

    const targetPath = buildAnnotatedPath(basePath, cid, format, outputPath);
    const up = await sb.storage.from(IMAGE_BUCKET).upload(targetPath, outBuf, {
      contentType,
      upsert: true,
    });
    if (up.error) {
      return NextResponse.json({ error: "upload_failed", details: up.error.message }, { status: 500 });
    }

    await sb
      .from("case_images")
      .insert({
        case_id: cid,
        storage_path: targetPath,
        width: width || null,
        height: height || null,
        is_original: false,
      })
      .select("id")
      .maybeSingle();

    const signedTtl = clampTtl(ttl);
    const signed = await sb.storage.from(IMAGE_BUCKET).createSignedUrl(targetPath, signedTtl);
    const url = signed.data?.signedUrl || null;

    return NextResponse.json(
      {
        ok: true,
        bucket: IMAGE_BUCKET,
        base: { path: basePath, width, height },
        output: {
          path: targetPath,
          format,
          bytes: outBuf.length,
          contentType,
          url,
          ttl: signedTtl,
        },
        overlay: {
          overlays_count: overlaysInput.length,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: "annotate_failed", details: e?.message || "Unknown error" }, { status: 500 });
  }
}
