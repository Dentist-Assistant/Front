    // app/dentist/cases/[id]/components/AnnotationsLayer.tsx
    "use client";

    import React, {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
    } from "react";

    type Severity = "low" | "medium" | "high";

    type Point = { x: number; y: number; norm?: boolean };
    type Circle = { cx: number; cy: number; r: number; norm?: boolean };
    type Line = { x1: number; y1: number; x2: number; y2: number; norm?: boolean };
    type Polygon = { points: Point[]; norm?: boolean };
    type Box = { x: number; y: number; w: number; h: number; norm?: boolean };
    type Geometry = { circles?: Circle[]; lines?: Line[]; polygons?: Polygon[]; boxes?: Box[] };

    export type AnnotationItem = {
    id: string | number;
    label?: string;
    geometry: Geometry;
    severity?: Severity;
    color?: string;
    visible?: boolean;
    dashed?: boolean;
    };

    export type AnnotationsLayerHandle = {
    highlight: (id: string | number | null) => void;
    clearHighlight: () => void;
    flash: (id: string | number, ms?: number) => void;
    };

    type Props = {
    items: AnnotationItem[];
    width: number;
    height: number;
    className?: string;
    style?: React.CSSProperties;
    showLabels?: boolean;
    strokeWidth?: number;
    onHover?: (id: string | number | null) => void;
    onClick?: (id: string | number) => void;
    pointerEvents?: boolean;
    opacity?: number;
    };

    function toPx(v: number, size: number, norm?: boolean) {
    return norm ? v * size : v;
    }
    function toPxR(v: number, w: number, h: number, norm?: boolean) {
    if (!norm) return v;
    const ref = Math.min(w, h);
    return v * ref;
    }
    function centroidPolygon(points: Array<{ x: number; y: number }>) {
    let area = 0;
    let cx = 0;
    let cy = 0;
    const n = points.length;
    if (n < 3) {
        const mx = points.reduce((a, p) => a + p.x, 0) / Math.max(1, n);
        const my = points.reduce((a, p) => a + p.y, 0) / Math.max(1, n);
        return { x: mx, y: my };
    }
    for (let i = 0; i < n; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % n];
        const cross = p1.x * p2.y - p2.x * p1.y;
        area += cross;
        cx += (p1.x + p2.x) * cross;
        cy += (p1.y + p2.y) * cross;
    }
    area *= 0.5;
    if (area === 0) {
        const mx = points.reduce((a, p) => a + p.x, 0) / Math.max(1, n);
        const my = points.reduce((a, p) => a + p.y, 0) / Math.max(1, n);
        return { x: mx, y: my };
    }
    cx /= 6 * area;
    cy /= 6 * area;
    return { x: cx, y: cy };
    }
    function centerBox(b: { x: number; y: number; w: number; h: number }) {
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    }
    function midpoint(l: { x1: number; y1: number; x2: number; y2: number }) {
    return { x: (l.x1 + l.x2) / 2, y: (l.y1 + l.y2) / 2 };
    }
    function anchorForGeometry(g: Geometry, w: number, h: number) {
    if (g.circles && g.circles.length) {
        const c = g.circles[0];
        return { x: toPx(c.cx, w, c.norm), y: toPx(c.cy, h, c.norm) };
    }
    if (g.boxes && g.boxes.length) {
        const b = g.boxes[0];
        const bx = toPx(b.x, w, b.norm);
        const by = toPx(b.y, h, b.norm);
        const bw = toPx(b.w, w, b.norm);
        const bh = toPx(b.h, h, b.norm);
        return centerBox({ x: bx, y: by, w: bw, h: bh });
    }
    if (g.lines && g.lines.length) {
        const l = g.lines[0];
        return midpoint({
        x1: toPx(l.x1, w, l.norm),
        y1: toPx(l.y1, h, l.norm),
        x2: toPx(l.x2, w, l.norm),
        y2: toPx(l.y2, h, l.norm),
        });
    }
    if (g.polygons && g.polygons.length) {
        const p = g.polygons[0];
        const pts = (p.points || []).map((pt) => ({
        x: toPx(pt.x, w, p.norm || pt.norm),
        y: toPx(pt.y, h, p.norm || pt.norm),
        }));
        return centroidPolygon(pts);
    }
    return { x: w * 0.5, y: h * 0.5 };
    }

    const SEV_COLOR: Record<Severity, string> = {
    low: "#34D399",
    medium: "#F59E0B",
    high: "#EF4444",
    };

    export const AnnotationsLayer = forwardRef<AnnotationsLayerHandle, Props>(
    (
        {
        items,
        width,
        height,
        className = "",
        style,
        showLabels = true,
        strokeWidth = 2,
        onHover,
        onClick,
        pointerEvents = true,
        opacity = 1,
        },
        ref
    ) => {
        const [highlightId, setHighlightId] = useState<string | number | null>(null);
        const [flashId, setFlashId] = useState<string | number | null>(null);
        const flashTimer = useRef<number | null>(null);

        useImperativeHandle(ref, () => ({
        highlight: (id) => setHighlightId(id),
        clearHighlight: () => setHighlightId(null),
        flash: (id, ms = 750) => {
            if (flashTimer.current) {
            window.clearTimeout(flashTimer.current);
            flashTimer.current = null;
            }
            setFlashId(id);
            flashTimer.current = window.setTimeout(() => {
            setFlashId(null);
            flashTimer.current = null;
            }, ms) as unknown as number;
        },
        }));

        useEffect(() => {
        return () => {
            if (flashTimer.current) window.clearTimeout(flashTimer.current);
        };
        }, []);

        const visibleItems = useMemo(
        () => items.filter((i) => i && (i.visible ?? true)),
        [items]
        );

        const defs = (
        <defs>
            <filter id="glow-low" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
            <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
            </feMerge>
            </filter>
            <filter id="glow-medium" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.25" result="coloredBlur" />
            <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
            </feMerge>
            </filter>
            <filter id="glow-high" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
            </feMerge>
            </filter>
        </defs>
        );

        const renderItem = (it: AnnotationItem) => {
        const sev = (it.severity || "low") as Severity;
        const color = it.color || SEV_COLOR[sev];
        const isHot = it.id === highlightId || it.id === flashId;
        const sw = isHot ? strokeWidth * 1.6 : strokeWidth;
        const dash = it.dashed ? "6 6" : undefined;
        const filter =
            sev === "high" ? "url(#glow-high)" : sev === "medium" ? "url(#glow-medium)" : "url(#glow-low)";
        const anchor = anchorForGeometry(it.geometry, width, height);

        const nodes: React.ReactNode[] = [];

        (it.geometry.circles || []).forEach((c, idx) => {
            const cx = toPx(c.cx, width, c.norm);
            const cy = toPx(c.cy, height, c.norm);
            const r = toPxR(c.r, width, height, c.norm);
            nodes.push(
            <circle
                key={`c-${idx}`}
                cx={cx}
                cy={cy}
                r={Math.max(1, r)}
                fill="none"
                stroke={color}
                strokeWidth={sw}
                strokeDasharray={dash}
                filter={filter}
                vectorEffect="non-scaling-stroke"
            />
            );
        });

        (it.geometry.lines || []).forEach((l, idx) => {
            const x1 = toPx(l.x1, width, l.norm);
            const y1 = toPx(l.y1, height, l.norm);
            const x2 = toPx(l.x2, width, l.norm);
            const y2 = toPx(l.y2, height, l.norm);
            nodes.push(
            <line
                key={`l-${idx}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeWidth={sw}
                strokeDasharray={dash}
                filter={filter}
                vectorEffect="non-scaling-stroke"
            />
            );
        });

        (it.geometry.boxes || []).forEach((b, idx) => {
            const x = toPx(b.x, width, b.norm);
            const y = toPx(b.y, height, b.norm);
            const w = toPx(b.w, width, b.norm);
            const h = toPx(b.h, height, b.norm);
            nodes.push(
            <rect
                key={`b-${idx}`}
                x={x}
                y={y}
                width={Math.max(1, w)}
                height={Math.max(1, h)}
                rx={4}
                ry={4}
                fill="none"
                stroke={color}
                strokeWidth={sw}
                strokeDasharray={dash}
                filter={filter}
                vectorEffect="non-scaling-stroke"
            />
            );
        });

        (it.geometry.polygons || []).forEach((p, idx) => {
            const pts = (p.points || [])
            .map((pt) => `${toPx(pt.x, width, p.norm || pt.norm)},${toPx(pt.y, height, p.norm || pt.norm)}`)
            .join(" ");
            nodes.push(
            <polygon
                key={`p-${idx}`}
                points={pts}
                fill="none"
                stroke={color}
                strokeWidth={sw}
                strokeDasharray={dash}
                filter={filter}
                vectorEffect="non-scaling-stroke"
            />
            );
        });

        const labelText = it.label ?? "";
        const label = showLabels && labelText ? (
            <g key="label" aria-label={`callout ${labelText}`}>
            <circle cx={anchor.x} cy={anchor.y} r={Math.max(10, 10 + (isHot ? 2 : 0))} fill="rgba(0,0,0,.55)" />
            <circle
                cx={anchor.x}
                cy={anchor.y}
                r={Math.max(9, 9 + (isHot ? 2 : 0))}
                fill={color}
                opacity={0.9}
                stroke="#000"
                strokeWidth={1}
            />
            <text
                x={anchor.x}
                y={anchor.y + 3}
                textAnchor="middle"
                fontSize={12}
                fontWeight={700}
                fill="#0B1220"
                style={{ fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" }}
            >
                {labelText}
            </text>
            </g>
        ) : null;

        return (
            <g
            key={String(it.id)}
            role="group"
            data-id={String(it.id)}
            opacity={isHot ? 1 : 0.92}
            onMouseEnter={() => {
                if (!pointerEvents) return;
                setHighlightId(it.id);
                onHover?.(it.id);
            }}
            onMouseLeave={() => {
                if (!pointerEvents) return;
                if (highlightId === it.id) setHighlightId(null);
                onHover?.(null);
            }}
            onClick={() => {
                if (!pointerEvents) return;
                onClick?.(it.id);
            }}
            style={{ cursor: pointerEvents ? "pointer" : "default", pointerEvents: pointerEvents ? "auto" : "none" }}
            >
            {nodes}
            {label}
            </g>
        );
        };

        return (
        <svg
            className={className}
            style={{ display: "block", width: "100%", height: "100%", ...style, opacity }}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="xMidYMid meet"
            aria-label="Annotations overlay"
        >
            {defs}
            {visibleItems.map(renderItem)}
        </svg>
        );
    }
    );

    AnnotationsLayer.displayName = "AnnotationsLayer";

    export default AnnotationsLayer;
