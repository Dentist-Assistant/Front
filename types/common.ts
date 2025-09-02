export type UUID = string;

export type UserRole = "dentist" | "tech" | "admin";

export type CaseStatus = "draft" | "pending" | "in_review" | "approved" | "rejected";

export type Maybe<T> = T | null | undefined;

export type Result<T, E = string> = { ok: true; data: T } | { ok: false; error: E };

export type ApiResponse<T> =
  | { status: "success"; data: T }
  | { status: "error"; message: string; code?: string };

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface TableColumn<T> {
  key: keyof T | string;
  header: string;
  className?: string;
  width?: number | string;
  align?: "left" | "center" | "right";
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

export type Paginated<T> = {
  items: T[];
  meta: PageMeta;
};

export interface RangeFilter {
  from?: string;
  to?: string;
}

export interface CaseListFilter {
  q?: string;
  status?: CaseStatus | "all";
  date?: RangeFilter;
  dentistId?: UUID;
  techId?: UUID;
}

export type WithId<T> = T & { id: UUID };

export interface FileRef {
  name: string;
  size: number;
  type: string;
  url?: string;
}

export interface UploadToken {
  url: string;
  method?: "PUT" | "POST";
  headers?: Record<string, string>;
  fields?: Record<string, string>;
}

export interface UploadResult {
  path: string;
  publicUrl?: string;
  mimeType?: string;
  size?: number;
}
