import { getApiBase } from "./config.js";
import { redact } from "./logger.js";
import type {
  CatalogThemeItem,
  ConflictItem,
  ConflictResult,
  InstallThemeResult,
  PreviewResult,
  PushResult,
  ReleaseAsset,
  ReleaseThemeResult,
  ThemeAsset,
  ThemeListItem,
  ThemeReleaseItem,
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
    return await res.json();
  } catch {
    return null;
  }
}

function toApiError(res: Response, fallback: string): Promise<never> {
  return readErrorBody(res).then((body) => {
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    const detail = record?.message ?? record?.error_description ?? record?.error;
    const message = typeof detail === "string" ? detail : fallback;
    throw new ApiError(res.status, `[${res.status}] ${message}`, body);
  });
}

const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);
const READ_TIMEOUT_MS = 30_000;
/** Escrituras: publicar un tema completo puede tardar; no se corta a los 30 s. */
// Una release sube el tema completo (más de 100 archivos) y puede tardar
// varios minutos; cortarla antes deja al catálogo a medias.
const WRITE_TIMEOUT_MS = 300_000;

interface RequestOptions {
  /** Tiempo máximo de espera. Por defecto 30 s (lecturas) / 300 s (escrituras). */
  timeoutMs?: number;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch con timeout y reintentos. Respeta `Retry-After`.
 *
 * Reglas para no duplicar escrituras: una lectura se reintenta ante error de red
 * o 5xx; una escritura sólo se reintenta en 429 (el límite se evalúa antes de
 * tocar datos). Un timeout de escritura NO se reintenta: el servidor pudo
 * haberla aplicado, y reintentar dejaría el tema en un estado confuso.
 */
async function request(
  input: string,
  init: RequestInit,
  label: string,
  options: RequestOptions = {},
): Promise<Response> {
  const isRead = (init.method ?? "GET").toUpperCase() === "GET";
  const timeoutMs = options.timeoutMs ?? (isRead ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS);
  const attempts = 3;
  let lastError: unknown = null;
  let timedOut = false;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      const retryable = res.status === 429 || (isRead && RETRYABLE_STATUS.has(res.status));
      if (retryable && attempt < attempts) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 400 * attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      timedOut = err instanceof Error && err.name === "TimeoutError";
      if (isRead && attempt < attempts) {
        await wait(400 * attempt);
        continue;
      }
      if (isRead) continue;
      break;
    }
  }

  if (timedOut && !isRead) {
    throw new ApiError(
      0,
      `${label}: el servidor no respondió en ${Math.round(timeoutMs / 1000)} s. ` +
        "Verifica con `velsefy theme pull` antes de reintentar.",
      null,
    );
  }
  const detail = lastError instanceof Error ? lastError.message : "error de red";
  throw new ApiError(0, `${label}: ${detail}`, null);
}

/** GET /v1/themes - temas instalados de la tienda. */
export async function listThemes(token: string): Promise<ThemeListItem[]> {
  const base = getApiBase();
  const res = await request(`${base}/themes`, { method: "GET", headers: authHeaders(token) }, "No se pudieron listar los temas");
  if (!res.ok) return toApiError(res, "No se pudieron listar los temas");
  const data = (await res.json()) as unknown;
  const array = Array.isArray(data) ? data : (data as { themes?: unknown })?.themes;
  return Array.isArray(array) ? (array as ThemeListItem[]) : [];
}

/** POST /v1/themes - instala un tema del catálogo en la tienda del token. */
export async function installThemeFromCatalog(
  token: string,
  sku: string,
  name?: string,
): Promise<InstallThemeResult> {
  const base = getApiBase();
  const res = await request(
    `${base}/themes`,
    { method: "POST", headers: authHeaders(token), body: JSON.stringify({ sku, name: name ?? null }) },
    "No se pudo instalar el tema",
  );
  if (!res.ok) return toApiError(res, "No se pudo instalar el tema");
  const data = (await res.json()) as { ok?: unknown; install_id?: unknown };
  return {
    ok: data.ok === true,
    install_id: typeof data.install_id === "string" ? data.install_id : "",
  };
}

/** GET /v1/themes/{installId}/assets - descarga de assets. */
export async function pullThemeAssets(token: string, installId: string): Promise<ThemeAsset[]> {
  const base = getApiBase();
  const res = await request(
    `${base}/themes/${encodeURIComponent(installId)}/assets`,
    { method: "GET", headers: authHeaders(token) },
    "No se pudieron descargar los assets",
  );
  if (!res.ok) return toApiError(res, "No se pudieron descargar los assets");
  const data = (await res.json()) as unknown;
  const array = Array.isArray(data) ? data : (data as { items?: unknown })?.items ?? (data as { assets?: unknown })?.assets;
  return Array.isArray(array) ? (array as ThemeAsset[]) : [];
}

/** GET /v1/catalog/themes/{sku}/assets - descarga los assets ACTUALES del catálogo. */
export async function pullCatalogThemeAssets(token: string, sku: string): Promise<ThemeAsset[]> {
  const base = getApiBase();
  const res = await request(
    `${base}/catalog/themes/${encodeURIComponent(sku)}/assets`,
    { method: "GET", headers: authHeaders(token) },
    "No se pudieron descargar los assets del catálogo",
  );
  if (!res.ok) return toApiError(res, "No se pudieron descargar los assets del catálogo");
  const data = (await res.json()) as unknown;
  const array = Array.isArray(data) ? data : (data as { assets?: unknown })?.assets;
  return Array.isArray(array) ? (array as ThemeAsset[]) : [];
}

export interface PushOptions {
  baseUpdatedAt?: string;
  deletedPaths?: string[];
  force?: boolean;
  /** Origen del push cuando no es un envío manual. */
  origin?: "watch";
}

/** PUT /v1/themes/{installId}/assets - subida de assets + bajas. 409 → conflicto. */
export async function pushThemeAssets(
  token: string,
  installId: string,
  assets: ReleaseAsset[],
  options: PushOptions = {},
): Promise<PushResult> {
  const base = getApiBase();
  const body = {
    items: assets,
    baseUpdatedAt: options.baseUpdatedAt,
    deleted_paths: options.deletedPaths ?? [],
    force: options.force === true,
  };
  const headers = authHeaders(token);
  if (options.origin) headers["x-velse-origin"] = options.origin;
  const res = await request(
    `${base}/themes/${encodeURIComponent(installId)}/assets`,
    { method: "PUT", headers, body: JSON.stringify(body) },
    "No se pudieron subir los assets",
  );

  if (res.status === 409) {
    const data = (await readErrorBody(res)) as Record<string, unknown> | null;
    const conflict: ConflictResult = {
      status: 409,
      message: "El tema fue modificado en otro lado. Resuelve los conflictos y reintenta.",
      conflicts: normalizeConflicts(data),
    };
    return { status: "conflict", conflict };
  }

  if (!res.ok) return toApiError(res, "No se pudieron subir los assets");

  const data = (await res.json()) as Record<string, unknown>;
  return {
    status: "ok",
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
    deleted: typeof data.deleted === "number" ? data.deleted : 0,
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

/** POST /v1/themes/{installId}/publish - activa el tema en la tienda. */
export async function publishInstall(token: string, installId: string): Promise<void> {
  const base = getApiBase();
  const res = await request(
    `${base}/themes/${encodeURIComponent(installId)}/publish`,
    { method: "POST", headers: authHeaders(token) },
    "No se pudo publicar el tema",
  );
  if (!res.ok) return toApiError(res, "No se pudo publicar el tema");
}

/** POST /v1/themes/{installId}/preview - URL de previsualización (preview_token). */
export async function previewInstall(
  token: string,
  installId: string,
  sessionToken: string,
  options?: { liveReload?: number },
): Promise<PreviewResult> {
  const base = getApiBase();
  const body: { session_token: string; live_reload?: number } = {
    session_token: sessionToken,
  };
  if (options?.liveReload) body.live_reload = options.liveReload;

  const res = await request(
    `${base}/themes/${encodeURIComponent(installId)}/preview`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
    "No se pudo generar el preview",
  );
  if (!res.ok) return toApiError(res, "No se pudo generar el preview");
  const data = (await res.json()) as { url?: unknown };
  return { url: typeof data.url === "string" ? data.url : "" };
}

/** POST /v1/catalog/themes - crea un tema BASE nuevo en el catálogo global. */
export async function createCatalogTheme(
  token: string,
  sku: string,
  name: string,
  fromSku?: string,
  options?: {
    versionSemver?: string;
    isOfficial?: boolean;
    isListed?: boolean;
    previewUrl?: string;
  },
): Promise<{ ok: boolean; sku: string }> {
  const base = getApiBase();
  const body: {
    sku: string;
    name: string;
    fromSku?: string;
    version_semver?: string;
    is_official?: boolean;
    is_listed?: boolean;
    preview_url?: string;
  } = { sku, name };
  if (fromSku && fromSku.trim().length > 0) body.fromSku = fromSku;
  if (options?.versionSemver?.trim()) body.version_semver = options.versionSemver.trim();
  if (typeof options?.isOfficial === "boolean") body.is_official = options.isOfficial;
  if (typeof options?.isListed === "boolean") body.is_listed = options.isListed;
  if (options?.previewUrl?.trim()) body.preview_url = options.previewUrl.trim();
  const res = await request(
    `${base}/catalog/themes`,
    { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) },
    "No se pudo crear el tema base",
  );
  if (!res.ok) return toApiError(res, "No se pudo crear el tema base");
  const data = (await res.json()) as { ok?: unknown; sku?: unknown };
  return { ok: data.ok === true, sku: typeof data.sku === "string" ? data.sku : sku };
}

/** GET /v1/catalog/themes - temas del catálogo global. */
export async function listCatalogThemes(token: string): Promise<CatalogThemeItem[]> {
  const base = getApiBase();
  const res = await request(
    `${base}/catalog/themes`,
    { method: "GET", headers: authHeaders(token) },
    "No se pudo listar el catálogo",
  );
  if (!res.ok) return toApiError(res, "No se pudo listar el catálogo");
  const data = (await res.json()) as { themes?: unknown };
  return Array.isArray(data.themes) ? (data.themes as CatalogThemeItem[]) : [];
}

/** POST /v1/catalog/themes/{sku}/releases - publica una release (con bajas). */
/** POST /v1/catalog/themes/{sku}/releases/drafts - abre un borrador de release. */
export async function createReleaseDraft(
  token: string,
  sku: string,
  changelog: string | undefined,
): Promise<{ release_id: string }> {
  const base = getApiBase();
  const res = await request(
    `${base}/catalog/themes/${encodeURIComponent(sku)}/releases/drafts`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ changelog: changelog ?? null }),
    },
    "No se pudo abrir el borrador de la release",
  );
  if (!res.ok) return toApiError(res, "No se pudo abrir el borrador de la release");
  const data = (await res.json()) as { release_id?: unknown };
  if (typeof data.release_id !== "string" || !data.release_id) {
    throw new ApiError(0, "El servidor no devolvió el borrador de la release.", null);
  }
  return { release_id: data.release_id };
}

/** PUT /v1/catalog/themes/{sku}/releases/{id}/assets - guarda un lote. */
export async function appendReleaseAssets(
  token: string,
  sku: string,
  releaseId: string,
  assets: ReleaseAsset[],
): Promise<void> {
  const base = getApiBase();
  const res = await request(
    `${base}/catalog/themes/${encodeURIComponent(sku)}/releases/${encodeURIComponent(releaseId)}/assets`,
    {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ assets }),
    },
    "No se pudo enviar un lote de la release",
  );
  if (!res.ok) return toApiError(res, "No se pudo enviar un lote de la release");
}

/** POST /v1/catalog/themes/{sku}/releases/{id}/publish - cierra el borrador. */
export async function publishReleaseDraft(
  token: string,
  sku: string,
  releaseId: string,
): Promise<ReleaseThemeResult> {
  const base = getApiBase();
  const res = await request(
    `${base}/catalog/themes/${encodeURIComponent(sku)}/releases/${encodeURIComponent(releaseId)}/publish`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({}),
    },
    "No se pudo publicar la release",
  );
  if (!res.ok) return toApiError(res, "No se pudo publicar la release");
  return (await res.json()) as ReleaseThemeResult;
}

/** DELETE /v1/catalog/themes/{sku}/releases/{id} - descarta un borrador. */
export async function discardReleaseDraft(
  token: string,
  sku: string,
  releaseId: string,
): Promise<void> {
  const base = getApiBase();
  const res = await request(
    `${base}/catalog/themes/${encodeURIComponent(sku)}/releases/${encodeURIComponent(releaseId)}`,
    { method: "DELETE", headers: authHeaders(token) },
    "No se pudo descartar el borrador de la release",
  );
  if (!res.ok) return toApiError(res, "No se pudo descartar el borrador de la release");
}

/** POST /v1/catalog/themes/{sku}/releases - publica una release en una sola llamada. */
export async function releaseTheme(
  token: string,
  sku: string,
  changelog: string | undefined,
  assets: ReleaseAsset[],
  deletedPaths: string[] = [],
): Promise<ReleaseThemeResult> {
  const base = getApiBase();
  const res = await request(
    `${base}/catalog/themes/${encodeURIComponent(sku)}/releases`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ changelog: changelog ?? null, assets, deleted_paths: deletedPaths }),
    },
    "No se pudo publicar la release",
  );
  if (!res.ok) return toApiError(res, "No se pudo publicar la release");
  return (await res.json()) as ReleaseThemeResult;
}

/** GET /v1/catalog/themes/{sku}/releases - historial de releases. */
export async function listReleases(token: string, sku: string): Promise<ThemeReleaseItem[]> {
  const base = getApiBase();
  const res = await request(
    `${base}/catalog/themes/${encodeURIComponent(sku)}/releases`,
    { method: "GET", headers: authHeaders(token) },
    "No se pudieron listar las releases",
  );
  if (!res.ok) return toApiError(res, "No se pudieron listar las releases");
  const data = (await res.json()) as { releases?: unknown };
  return Array.isArray(data.releases) ? (data.releases as ThemeReleaseItem[]) : [];
}

/** POST /v1/catalog/themes/{sku}/releases/{id}/rollback - revierte a un release. */
export async function rollbackRelease(
  token: string,
  sku: string,
  releaseId: string,
): Promise<ReleaseThemeResult> {
  const base = getApiBase();
  const res = await request(
    `${base}/catalog/themes/${encodeURIComponent(sku)}/releases/${encodeURIComponent(releaseId)}/rollback`,
    { method: "POST", headers: authHeaders(token) },
    "No se pudo revertir la release",
  );
  if (!res.ok) return toApiError(res, "No se pudo revertir la release");
  return (await res.json()) as ReleaseThemeResult;
}
