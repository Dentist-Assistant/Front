export class HttpError extends Error {
    status: number;
    statusText: string;
    data: unknown;
    constructor(res: Response, data: unknown) {
      const message =
        typeof data === "object" && data !== null && "message" in data
          ? String((data as Record<string, unknown>).message)
          : res.statusText || "Request failed";
      super(message);
      this.name = "HttpError";
      this.status = res.status;
      this.statusText = res.statusText;
      this.data = data;
    }
  }
  
  type JSONInit = Omit<RequestInit, "body"> & { headers?: HeadersInit };
  const JSON_HEADERS: HeadersInit = { "Content-Type": "application/json" };
  
  function isJsonResponse(res: Response) {
    const ct = res.headers.get("content-type");
    return ct ? ct.includes("application/json") : false;
  }
  
  async function parseResponse<T>(res: Response): Promise<T> {
    if (res.status === 204) return undefined as unknown as T;
    const payload = isJsonResponse(res) ? await res.json() : await res.text();
    if (!res.ok) throw new HttpError(res, payload);
    return payload as T;
  }
  
  export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(path, init);
    return parseResponse<T>(res);
  }
  
  export async function getJSON<T>(path: string, init: JSONInit = {}): Promise<T> {
    const res = await fetch(path, {
      ...init,
      method: "GET",
      headers: { ...JSON_HEADERS, ...init.headers },
    });
    return parseResponse<T>(res);
  }
  
  export async function postJSON<T>(
    path: string,
    body?: unknown,
    init: JSONInit = {}
  ): Promise<T> {
    const res = await fetch(path, {
      ...init,
      method: "POST",
      headers: { ...JSON_HEADERS, ...init.headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return parseResponse<T>(res);
  }
  
  export async function putJSON<T>(
    path: string,
    body?: unknown,
    init: JSONInit = {}
  ): Promise<T> {
    const res = await fetch(path, {
      ...init,
      method: "PUT",
      headers: { ...JSON_HEADERS, ...init.headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return parseResponse<T>(res);
  }
  
  export async function patchJSON<T>(
    path: string,
    body?: unknown,
    init: JSONInit = {}
  ): Promise<T> {
    const res = await fetch(path, {
      ...init,
      method: "PATCH",
      headers: { ...JSON_HEADERS, ...init.headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return parseResponse<T>(res);
  }
  
  export async function deleteJSON<T>(
    path: string,
    body?: unknown,
    init: JSONInit = {}
  ): Promise<T> {
    const res = await fetch(path, {
      ...init,
      method: "DELETE",
      headers: { ...JSON_HEADERS, ...init.headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return parseResponse<T>(res);
  }
  
  export type QueryParams = Record<
    string,
    string | number | boolean | null | undefined
  >;
  
  export function buildQuery(params?: QueryParams): string {
    if (!params) return "";
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      usp.append(k, String(v));
    });
    const s = usp.toString();
    return s ? `?${s}` : "";
  }
  
  export function withQuery(path: string, params?: QueryParams): string {
    return `${path}${buildQuery(params)}`;
  }
  