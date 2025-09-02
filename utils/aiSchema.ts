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
  topP: 1
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

function sanitizeText(text: string, limit = 4000) {
  return text.replace(/\s+/g, " ").trim().slice(0, limit);
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
          createdAt
        };
      })
      .filter((f) => isNonEmptyString(f.description));
  }
  const parsed: DraftInput = {
    caseId: caseId as UUID,
    prompt: sanitizeText(String(prompt)),
    findings: parsedFindings,
    lang: lang === "en" || lang === "es" ? lang : "es",
    tone: tone === "detailed" || tone === "concise" ? tone : "concise"
  };
  return parsed;
}

export function parseRebuttalInput(payload: unknown): RebuttalInput {
  if (!isObject(payload)) {
    throw new Error("Invalid body");
  }
  const caseId = payload.caseId;
  const claim = payload.claim;
  const context = payload.context;
  const lang = payload.lang;
  if (!isUUID(caseId)) {
    throw new Error("Invalid caseId");
  }
  if (!isNonEmptyString(claim)) {
    throw new Error("Invalid claim");
  }
  const parsed: RebuttalInput = {
    caseId: caseId as UUID,
    claim: sanitizeText(String(claim)),
    context: isNonEmptyString(context) ? sanitizeText(String(context)) : undefined,
    lang: lang === "en" || lang === "es" ? lang : "es"
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
