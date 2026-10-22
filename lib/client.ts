export const SESSION_STORAGE_KEY = "patient_portal_session";

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;

  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export function readStoredSessionId(): string | null {
  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeSessionId(id: string): void {
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, id);
  } catch {
    return;
  }
}

export function clearStoredSessionId(): void {
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    return;
  }
}

export async function api<T>(
  url: string,
  options: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort);
  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(
        typeof data.error === "string" ? data.error : "Something went wrong. Please try again.",
        response.status,
        data.fields
      );
    }
    return data as T;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
