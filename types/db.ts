import { UUID, CaseStatus } from "./common";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      [table: string]: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships?: {
          foreignKeyName: string;
          columns: string[];
          referencedRelation: string;
          referencedColumns: string[];
        }[];
      };
    };
    Views: {
      [view: string]: {
        Row: Record<string, unknown>;
      };
    };
    Functions: {
      [fn: string]: {
        Args: Record<string, unknown>;
        Returns: unknown;
      };
    };
    Enums: {
      [enumName: string]: string;
    };
    CompositeTypes: {
      [typeName: string]: Record<string, unknown>;
    };
  };
};

export type UserId = UUID;
export type CaseId = UUID;
export type CommentId = UUID;
export type FileId = UUID;
export type ReviewPacketId = UUID;

export type User = {
  id: UserId;
  email: string;
  name: string;
  role: "dentist" | "tech" | "admin";
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type CasePriority = "low" | "normal" | "high";

export type Case = {
  id: CaseId;
  code: string;
  patientName: string;
  status: CaseStatus;
  priority?: CasePriority;
  dentistId?: UserId;
  techId?: UserId;
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CaseListItem = {
  id: CaseId;
  code: string;
  patientName: string;
  status: CaseStatus;
  priority?: CasePriority;
  createdAt: string;
  dentistName?: string;
  techName?: string;
};

export type CaseImage = {
  id: FileId;
  caseId: CaseId;
  label?: string;
  filePath: string;
  mimeType: string;
  width?: number;
  height?: number;
  createdAt: string;
};

export type FindingSeverity = "low" | "medium" | "high";

export type CaseFinding = {
  id: UUID;
  caseId: CaseId;
  tooth?: string | number;
  code?: string;
  description: string;
  severity?: FindingSeverity;
  source?: "ai" | "human";
  createdAt: string;
};

export type CaseComment = {
  id: CommentId;
  caseId: CaseId;
  authorId: UserId;
  authorName?: string;
  authorRole?: "dentist" | "tech" | "admin";
  message: string;
  isInternal?: boolean;
  createdAt: string;
};

export type ReviewPacket = {
  id: ReviewPacketId;
  caseId: CaseId;
  title: string;
  filePath: string;
  pageCount?: number;
  createdBy: UserId;
  createdAt: string;
};

export type SignedUrl = {
  url: string;
  path: string;
  expiresAt?: string;
  mimeType?: string;
  size?: number;
};

export type CaseWithRelations = Case & {
  images: CaseImage[];
  findings: CaseFinding[];
  comments: CaseComment[];
  reviewPacket?: ReviewPacket;
};

export type CreateCaseInput = {
  patientName: string;
  code: string;
  priority?: CasePriority;
  dentistId?: UserId;
  techId?: UserId;
};

export type UpdateCaseInput = Partial<
  Omit<Case, "id" | "createdAt" | "updatedAt">
> & { id: CaseId };

export type CreateCommentInput = {
  caseId: CaseId;
  message: string;
  isInternal?: boolean;
};

export type AddFindingInput = {
  caseId: CaseId;
  description: string;
  tooth?: string | number;
  code?: string;
  severity?: FindingSeverity;
  source?: "ai" | "human";
};

export type AddImageInput = {
  caseId: CaseId;
  label?: string;
  filePath: string;
  mimeType: string;
  width?: number;
  height?: number;
};

export type CreateReviewPacketInput = {
  caseId: CaseId;
  title: string;
  filePath: string;
  pageCount?: number;
};

export type CasesQuery = {
  q?: string;
  status?: CaseStatus | "all";
  page?: number;
  pageSize?: number;
  dentistId?: UserId;
  techId?: UserId;
  sort?: "createdAt" | "priority" | "status";
  order?: "asc" | "desc";
};
