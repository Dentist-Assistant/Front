import { UUID } from "../types/common";
import { CaseFinding, FindingSeverity } from "../types/db";

export type DraftInput = {
  caseId: UUID;
  prompt: string;
  findings?: CaseFinding[];
  lang?: "es" | "en";
  tone?: "concise" | "detailed";
};

export type RebuttalInput = {
  caseId: UUID;
  claim: string;
  context?: string;
  lang?: "es" | "en";
};

export type AIModelParams = {
  temperature: number;
  maxTokens: number;
  topP?: number;
};

export const DEFAULT_MODEL_PARAMS: AIModelParams = {
  temperature: 0.2,
  maxTokens: 800,
  topP: 1,
};


export type Normalized = number;


export type NormalizedPoint = [Normalized, Normalized];


export type OverlayNormalized =
  | {
      type: "circle";
      center: NormalizedPoint;
      radius: Normalized;
      points: null;
      bbox: null;
      label?: string | null;
    }
  | {
    type: "line";
    center: null;
    radius: null;
    points: [NormalizedPoint, NormalizedPoint];
    bbox: null;
    label?: string | null;
  }
  | {
      type: "polyline";
      center: null;
      radius: null;
      points: NormalizedPoint[]; 
      bbox: null;
      label?: string | null;
    }
  | {
      type: "polygon";
      center: null;
      radius: null;
      points: NormalizedPoint[]; 
      bbox: null;
      label?: string | null;
    }
  | {
      type: "bbox";
      center: null;
      radius: null;
      points: null;
      bbox: [Normalized, Normalized, Normalized, Normalized]; 
      label?: string | null;
    };


export type GeometryNormalized = {
  overlays: OverlayNormalized[];
  coordSpace: "normalized_0_1";
};

const uuidRx =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUUID(value: unknown): value is UUID {
  return typeof value === "string" && uuidRx.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function stripOuterQuotes(text: string) {
  let out = String(text ?? "").trim();
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ["“", "”"],
    ["‘", "’"],
    ["«", "»"],
    ["`", "`"],
  ];
  for (const [l, r] of pairs) {
    if (out.startsWith(l) && out.endsWith(r) && out.length >= 2) {
      out = out.slice(l.length, -r.length).trim();
      break;
    }
  }
  return out;
}

function sanitizeText(text: string, limit = 4000) {
  const unquoted = stripOuterQuotes(text);
  return unquoted.replace(/\s+/g, " ").trim().slice(0, limit);
}


export function normalizeCritiqueToList(input: unknown, maxItems = 50): string[] {
  let merged = "";
  if (isStringArray(input)) {
    merged = input.filter(isNonEmptyString).join("\n");
  } else if (isNonEmptyString(input)) {
    merged = input;
  } else {
    return [];
  }

  let s = stripOuterQuotes(merged).trim();

  s = s
    .replace(/\u2022|•|·/g, "\n")
    .replace(/(?:^|\s)(\d+[\.\)]\s+)/g, "\n$1")
    .replace(/;\s*/g, "\n")
    .replace(/\r?\n{2,}/g, "\n")
    .trim();

  const parts = s
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*(\d+[\.\)]\s+|[-–—]\s+|•\s+|·\s+)?/, "")
        .trim()
    )
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const clean = sanitizeText(p);
    if (!clean) continue;
    if (!seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
      if (out.length >= maxItems) break;
    }
  }
  return out;
}

export function parseDraftInput(payload: unknown): DraftInput {
  if (!isObject(payload)) {
    throw new Error("Invalid body");
  }
  const caseId = payload.caseId;
  const prompt = payload.prompt;
  const findings = payload.findings;
  const lang = payload.lang;
  const tone = payload.tone;
  if (!isUUID(caseId)) {
    throw new Error("Invalid caseId");
  }
  if (!isNonEmptyString(prompt)) {
    throw new Error("Invalid prompt");
  }
  let parsedFindings: CaseFinding[] | undefined;
  if (Array.isArray(findings)) {
    parsedFindings = findings
      .filter(isObject)
      .map((raw) => {
        const rawId = (raw as any).id;
        const id: UUID = isUUID(rawId) ? rawId : (cryptoRandomId() as UUID);
        const toothRaw = (raw as any).tooth;
        const tooth: string | number | undefined =
          typeof toothRaw === "number" || typeof toothRaw === "string" ? toothRaw : undefined;
        const codeRaw = (raw as any).code;
        const code = isNonEmptyString(codeRaw) ? String(codeRaw) : undefined;
        const sevRaw = (raw as any).severity;
        const severity: FindingSeverity | undefined =
          sevRaw === "low" || sevRaw === "medium" || sevRaw === "high" ? (sevRaw as FindingSeverity) : undefined;
        const srcRaw = (raw as any).source;
        const source: CaseFinding["source"] =
          srcRaw === "ai" || srcRaw === "human" ? srcRaw : "human";
        const createdAt = String((raw as any).createdAt ?? new Date().toISOString());
        const description = String((raw as any).description ?? "");
        return {
          id,
          caseId: caseId as UUID,
          description,
          tooth,
          code,
          severity,
          source,
          createdAt,
        };
      })
      .filter((f) => isNonEmptyString(f.description));
  }
  const parsed: DraftInput = {
    caseId: caseId as UUID,
    prompt: sanitizeText(String(prompt)),
    findings: parsedFindings,
    lang: lang === "en" || lang === "es" ? lang : "es",
    tone: tone === "detailed" || tone === "concise" ? tone : "concise",
  };
  return parsed;
}

export function parseRebuttalInput(payload: unknown): RebuttalInput {
  if (!isObject(payload)) {
    throw new Error("Invalid body");
  }
  const caseId = payload.caseId;
  const claimRaw = (payload as any).claim;
  const contextRaw = (payload as any).context;
  const lang = (payload as any).lang;

  if (!isUUID(caseId)) {
    throw new Error("Invalid caseId");
  }

  let claim = "";
  if (isStringArray(claimRaw)) {
    claim = claimRaw.filter(isNonEmptyString).map(stripOuterQuotes).join("\n");
  } else if (isNonEmptyString(claimRaw)) {
    claim = stripOuterQuotes(claimRaw);
  } else {
    throw new Error("Invalid claim");
  }

  const context = isNonEmptyString(contextRaw) ? sanitizeText(String(contextRaw)) : undefined;

  const parsed: RebuttalInput = {
    caseId: caseId as UUID,
    claim: sanitizeText(String(claim)),
    context,
    lang: lang === "en" || lang === "es" ? lang : "es",
  };
  return parsed;
}

export function buildSystemPrompt(kind: "draft" | "rebuttal", lang: "en" | "es") {
  const baseEn =
    "You are a clinical assistant for dental cases. Be precise, structured, and professional. Prefer bullet points and short paragraphs.";
  const baseEs =
    "Eres un asistente clínico para casos dentales. Sé preciso, estructurado y profesional. Prefiere viñetas y párrafos cortos.";
  const draftEn =
    "Generate a concise draft with key findings, considerations, and suggested next steps.";
  const draftEs =
    "Genera un borrador conciso con hallazgos clave, consideraciones y próximos pasos sugeridos.";
  const rebuttalEn =
    "Write a clear and respectful rebuttal that addresses the claim with evidence and reasoning.";
  const rebuttalEs =
    "Redacta una refutación clara y respetuosa que aborde la afirmación con evidencia y razonamiento.";
  const base = lang === "en" ? baseEn : baseEs;
  const spec =
    kind === "draft"
      ? lang === "en"
        ? draftEn
        : draftEs
      : lang === "en"
      ? rebuttalEn
      : rebuttalEs;
  return `${base} ${spec}`;
}

export function cryptoRandomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as any).randomUUID() as string;
  }
  const s4 = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
}
