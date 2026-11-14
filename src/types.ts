export type TokenScope = "store" | "platform";

export interface ThemeListItem {
  id: string;
  installId?: string;
  theme_sku?: string | null;
  assets_theme_sku?: string | null;
  name: string;
  status: string;
  is_active?: boolean;
  version?: number;
  version_semver?: string | null;
  updated_at?: string | null;
  updatedAt?: string;
  catalog_info?: {
    name?: string;
    version?: number;
    version_semver?: string | null;
    is_paid?: boolean;
  } | null;
}

export interface ThemeAsset {
  path: string;
  content: string;
  updatedAt?: string;
  /** El API (api-v1) devuelve `updated_at` (snake_case, desde la RPC get_theme_assets). */
  updated_at?: string | null;
}

export interface ReleaseAsset {
  path: string;
  content: string;
}

/** Estado local (.velsefy-state.json): base para 409 y detección de bajas. */
export interface ThemeState {
  installId?: string;
  sku?: string;
  baseUpdatedAt?: string;
  /** path -> sha256 del contenido descargado la última vez. */
  files: Record<string, string>;
}

export interface ConflictItem {
  path: string;
  serverUpdatedAt: string;
  localUpdatedAt?: string;
}

export interface ConflictResult {
  status: 409;
  message: string;
  conflicts: ConflictItem[];
}

export type PushResult =
  | { status: "ok"; updatedAt: string; deleted?: number }
  | { status: "conflict"; conflict: ConflictResult };

export interface ReleaseThemeResult {
  ok?: boolean;
  release_id?: string;
  version?: number;
  version_semver?: string;
  from_version?: number;
  deleted?: number;
  assets?: number;
  sku?: string;
  [key: string]: unknown;
}

export interface ThemeReleaseItem {
  id: string;
  version: number;
  changelog: string | null;
  status: string;
  created_at: string;
}

export interface CatalogThemeItem {
  sku: string;
  name: string;
  version: number;
  version_semver: string | null;
  is_default?: boolean;
  is_paid?: boolean;
  theme_area?: string | null;
}

export interface InstallThemeResult {
  ok: boolean;
  install_id: string;
}

export interface PreviewResult {
  url: string;
}
