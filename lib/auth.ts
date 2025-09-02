export const ROLES = ["dentist", "tech", "admin"] as const;

export type AppRole = (typeof ROLES)[number];

export type SafeUser = {
  id: string;
  email: string | null;
  name: string | null;
  role: AppRole | null;
};

export function extractRole(input: unknown): AppRole | null {
  if (!input || typeof input !== "object") return null;
  const anyInput = input as {
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  };
  const candidate =
    (anyInput.app_metadata?.role as unknown) ??
    (anyInput.user_metadata?.role as unknown);
  if (typeof candidate !== "string") return null;
  return ROLES.includes(candidate as AppRole) ? (candidate as AppRole) : null;
}

export function toSafeUser(input: unknown): SafeUser | null {
  if (!input || typeof input !== "object") return null;
  const anyInput = input as {
    id?: unknown;
    email?: unknown;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  };
  const id = typeof anyInput.id === "string" ? anyInput.id : "";
  if (!id) return null;
  const email = typeof anyInput.email === "string" ? anyInput.email : null;
  const nameRaw =
    (anyInput.user_metadata?.name as unknown) ??
    (anyInput.user_metadata?.full_name as unknown) ??
    (anyInput.user_metadata?.display_name as unknown);
  const name = typeof nameRaw === "string" ? nameRaw : null;
  const role = extractRole(anyInput);
  return { id, email, name, role };
}

export function isAllowed(
  allowed: "any" | AppRole[] | AppRole,
  role: AppRole | null
): boolean {
  if (allowed === "any") return true;
  const list = Array.isArray(allowed) ? allowed : [allowed];
  return role ? list.includes(role) : false;
}

export function dashboardPathFor(role: AppRole | null): string {
  if (role === "dentist") return "/dentist";
  if (role === "tech") return "/tech";
  if (role === "admin") return "/dentist";
  return "/login";
}

export function labelForRole(role: AppRole | null): string {
  if (role === "dentist") return "Dentist";
  if (role === "tech") return "Tech";
  if (role === "admin") return "Admin";
  return "Guest";
}
