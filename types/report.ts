// types/report.ts

export type Severity = "low" | "medium" | "high";

export type Point = { x: number; y: number; norm?: boolean };
export type CircleShape = { type: "circle"; cx: number; cy: number; r: number; norm?: boolean };
export type LineShape = { type: "line"; x1: number; y1: number; x2: number; y2: number; norm?: boolean };
export type PolygonShape = { type: "polygon"; points: Point[]; norm?: boolean };
export type BoxShape = { type: "box"; x: number; y: number; w: number; h: number; norm?: boolean };

export type AnnotationShape = CircleShape | LineShape | PolygonShape | BoxShape;

export type Geometry = {
  circles?: CircleShape[];
  lines?: LineShape[];
  polygons?: PolygonShape[];
  boxes?: BoxShape[];
};

export type AnnotationStyle = {
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  fill?: string;
  fillOpacity?: number;
  dasharray?: string | number[];
  label?: string;
};

export type Finding = {
  tooth_fdi: number;
  findings: string[];
  severity: Severity;
  confidence?: number | null;
  image_index?: number | null;
  image_id?: string | null;
  note?: string | null;
};

export type FindingWithGeometry = Finding & {
  geometry?: Geometry | null;
  style?: AnnotationStyle;
  callout_index?: number | null;
  callout_label?: string | null;
};

export type RebuttalUpdate = {
  topic: string;
  action: "add" | "modify" | "remove";
  text: string;
  rationale: string;
  source?: "feedback" | "ai";
  feedback_ref?: number;
  tooth_fdi?: number;
  image_index?: number;
  image_id?: string;
  geometry?: Geometry;
};

export type FeedbackAlignment = {
  item_number: number;
  item_text: string;
  decision: "accept" | "partial" | "reject";
  reason: string;
  linked_updates: number[];
};

export type Measurements = {
  overjet_mm?: number | null;
  overbite_percent?: number | null;
  midline_deviation_mm?: number | null;
  crowding_upper_mm?: number | null;
  crowding_lower_mm?: number | null;
};

export type Occlusion = {
  class_right?: "I" | "II" | "III";
  class_left?: "I" | "II" | "III";
  open_bite?: boolean;
  crossbite?: boolean;
};

export type Hygiene = {
  plaque?: string | null;
  calculus?: string | null;
  gingival_inflammation?: string | null;
};

export type TreatmentGoalFinal = {
  summary?: string;
  goals?: string[];
  duration_months?: number | null;
  notes?: string;
};

export type ReportImage = {
  index?: number;
  id?: string;
  path?: string;
  url?: string;
  caption?: string | null;
  annotated?: boolean;
  annotated_path?: string;
  primary?: boolean;
};

export type RebuttalPayload = {
  narrative?: string;
  updates?: RebuttalUpdate[];
  feedback_alignment?: FeedbackAlignment[];
};

export type ReportPayload = {
  summary?: string;
  findings?: FindingWithGeometry[];
  images?: ReportImage[];
  measurements?: Measurements;
  occlusion?: Occlusion;
  hygiene?: Hygiene;
  recommendations?: string[];
  treatment_goal_final?: TreatmentGoalFinal;
  confidence_overall?: number | null;
  rebuttal?: RebuttalPayload;
  _meta?: Record<string, unknown>;
};

export type ReviewPacketData = {
  caseId: string;
  patientName: string;
  doctorName?: string;
  technicianName?: string;
  createdAt?: string | Date;
  summary?: string;
  findings?: Array<{
    tooth: string;
    note: string;
    severity: Severity;
    image_index?: number | null;
    image_id?: string | null;
  }>;
  images?: Array<{
    url: string;
    caption?: string;
    id?: string;
    path?: string;
    primary?: boolean;
  }>;
  footerNote?: string;
  rebuttal?: {
    narrative?: string;
    updates?: RebuttalUpdate[];
    feedback_alignment?: FeedbackAlignment[];
  };
};

export type OverlaySpec = {
  findingIndex?: number;
  label?: string;
  severity?: Severity;
  geometry: Geometry;
  style?: AnnotationStyle;
};

export type ReportRecord = {
  case_id: string;
  version: number;
  narrative?: string | null;
  payload?: ReportPayload | null;
};
