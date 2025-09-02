export type AILanguage = "es" | "en";
export type AIDraftTone = "concise" | "detailed" | "friendly" | "technical";
export type AISeverity = "low" | "medium" | "high";

export type UUID = string;

export interface AIFinding {
  code: string;
  title: string;
  severity?: AISeverity;
  tooth?: number | string;
  surfaces?: string[];
  notes?: string;
}

export interface AIUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs?: number;
}

export interface AIMeta {
  model?: string;
  usage?: AIUsage;
}

export interface AIDraftRequest {
  caseId: UUID;
  findings: AIFinding[];
  notes?: string;
  tone?: AIDraftTone;
  language?: AILanguage;
  patientName?: string;
  context?: string[];
}

export interface AIDraftResponse extends AIMeta {
  draft: string;
}

export interface AIRebuttalRequest {
  caseId: UUID;
  findings?: AIFinding[];
  denialReason?: string;
  insurer?: string;
  draft?: string;
  language?: AILanguage;
  context?: string[];
}

export interface AIRebuttalResponse extends AIMeta {
  rebuttal: string;
}

export interface AIErrorPayload {
  message: string;
  code?: string;
  details?: unknown;
}

export type AIResult<T> =
  | { status: "success"; data: T; meta?: AIMeta }
  | { status: "error"; error: AIErrorPayload };

export type DraftEndpointResponse = AIResult<AIDraftResponse>;
export type RebuttalEndpointResponse = AIResult<AIRebuttalResponse>;
