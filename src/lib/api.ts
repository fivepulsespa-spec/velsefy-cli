import { getApiBase } from "./config.js";
import { redact } from "./logger.js";
import type {
  ConflictItem,
  ConflictResult,
  PushResult,
  ReleaseAsset,
  ReleaseThemeResult,
  ThemeAsset,
  ThemeListItem,
} from "../types.js";

export class ApiError extends Error {
  readonly status: number;
  readonly body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(redact(message));
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function readErrorBody(res: Response): Promise<unknown> {
  try {
    const json = await res.json();
    return json;
  } catch {
    return null;
  }
}

function toApiError(res: Response, fallback: string): Promise<never> {
  return readErrorBody(res).then((body) => {
    const detail =
      body && typeof body === "object"
        ? (body as Record<string, unknown>).message ?? (body as Record<string, unknown>).error_description
        : body;
    const message = typeof detail === "string" ? detail : fallback;
    throw new ApiError(res.status, `[${res.status}] ${message}`, body);
  });
}

/** GET /v1/themes — temas instalados de la tienda. */
export async function listThemes(token: string): Promise<ThemeListItem[]> {
  const base = getApiBase();
  const res = await fetch(`${base}/themes`, { method: "GET", headers: authHeaders(token) });
  if (!res.ok) return toApiError(res, "No se pudieron listar los temas");
  const data = (await res.json()) as unknown;
  const array = Array.isArray(data) ? data : (data as { themes?: unknown })?.themes;
  return Array.isArray(array) ? (array as ThemeListItem[]) : [];
}

/** GET /v1/themes/{installId}/assets — descarga de assets. */
export async function pullThemeAssets(token: string, installId: string): Promise<ThemeAsset[]> {
  const base = getApiBase();
  const res = await fetch(`${base}/themes/${installId}/assets`, {
    method: "GET",
    headers: authHeaders(token),
  });
  if (!res.ok) return toApiError(res, "No se pudieron descargar los assets");
  const data = (await res.json()) as unknown;
  const array = Array.isArray(data) ? data : (data as { items?: unknown })?.items ?? (data as { assets?: unknown })?.assets;
  return Array.isArray(array) ? (array as ThemeAsset[]) : [];
}

/** PUT /v1/themes/{installId}/assets — subida de assets. 409 → conflicto. */
export async function pushThemeAssets(
  token: string,
  installId: string,
  assets: ReleaseAsset[],
  baseUpdatedAt?: string,
): Promise<PushResult> {
  const base = getApiBase();
  const res = await fetch(`${base}/themes/${installId}/assets`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ items: assets, baseUpdatedAt }),
  });

  if (res.status === 409) {
    const body = (await readErrorBody(res)) as Record<string, unknown> | null;
    const conflicts = normalizeConflicts(body);
    const conflict: ConflictResult = {
      status: 409,
      message: "El tema fue modificado en otro lado. Resuelve los conflictos y reintenta.",
      conflicts,
    };
    return { status: "conflict", conflict };
  }

  if (!res.ok) return toApiError(res, "No se pudieron subir los assets");

  const data = (await res.json()) as Record<string, unknown>;
  return {
    status: "ok",
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
  };
}

function normalizeConflicts(body: Record<string, unknown> | null): ConflictItem[] {
  const source = body?.conflicts ?? (Array.isArray(body) ? body : undefined);
  if (!Array.isArray(source)) return [];
  return source.map((item) => {
    const record = item as Record<string, unknown>;
    return {
      path: typeof record.path === "string" ? record.path : "unknown",
      serverUpdatedAt:
        typeof record.serverUpdatedAt === "string"
          ? record.serverUpdatedAt
          : typeof record.updatedAt === "string"
            ? record.updatedAt
            : new Date().toISOString(),
      localUpdatedAt: typeof record.localUpdatedAt === "string" ? record.localUpdatedAt : undefined,
    };
  });
}

/** POST /v1/catalog/themes/{sku}/releases — publica una release del catálogo. */
export async function releaseTheme(
  token: string,
  sku: string,
  changelog: string | undefined,
  assets: ReleaseAsset[],
): Promise<ReleaseThemeResult> {
  const base = getApiBase();
  const res = await fetch(`${base}/catalog/themes/${sku}/releases`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ changelog: changelog ?? null, assets }),
  });
  if (!res.ok) return toApiError(res, "No se pudo publicar la release");
  return (await res.json()) as ReleaseThemeResult;
}
