// src/services/apiClient.ts
//
// Thin HTTP wrapper for server API calls. All methods are fire-and-forget
// safe — callers can await or ignore the returned promise.

const BASE = "/api";
const TIMEOUT_MS = 8_000;

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ApiError(res.status, `${method} ${path} → ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const api = {
  // Health
  health: () => request<{ ok: boolean }>("GET", "/health"),

  // Profiles
  listProfiles: () => request<Record<string, unknown>[]>("GET", "/profiles"),
  createProfile: (data: { name: string; avatarEmoji: string }) =>
    request<Record<string, unknown>>("POST", "/profiles", data),
  updateProfile: (id: number, patch: Record<string, unknown>) =>
    request("PATCH", `/profiles/${id}`, patch),
  deleteProfile: (id: number) => request("DELETE", `/profiles/${id}`),

  // Snapshot
  getSnapshot: (profileId: number) =>
    request<Record<string, unknown>>("GET", `/profiles/${profileId}/snapshot`),
  putSnapshot: (profileId: number, data: Record<string, unknown>) =>
    request("PUT", `/profiles/${profileId}/snapshot`, data),

  // Per-table sync
  syncProgress: (profileId: number, wp: Record<string, unknown>) =>
    request("POST", `/profiles/${profileId}/progress`, wp),
  syncAttempts: (profileId: number, attempts: Record<string, unknown>[]) =>
    request("POST", `/profiles/${profileId}/attempts`, attempts),
  syncSettings: (profileId: number, settings: Record<string, unknown>) =>
    request("PUT", `/profiles/${profileId}/settings`, settings),
  syncPet: (profileId: number, pet: Record<string, unknown>) =>
    request("PUT", `/profiles/${profileId}/pet`, pet),
  syncPetEvents: (profileId: number, events: Record<string, unknown>[]) =>
    request("POST", `/profiles/${profileId}/pet-events`, events),
  syncShow: (profileId: number, show: Record<string, unknown>) =>
    request("POST", `/profiles/${profileId}/shows`, show),
  syncSession: (profileId: number, session: Record<string, unknown>) =>
    request("POST", `/profiles/${profileId}/sessions`, session),
};
