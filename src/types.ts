export type TokenScope = "store" | "platform";

export interface ThemeListItem {
  id: string;
  installId?: string;
  name: string;
  status: string;
  updatedAt?: string;
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
  | { status: "ok"; updatedAt: string }
  | { status: "conflict"; conflict: ConflictResult };

export interface ReleaseThemeResult {
  id?: string;
  version?: string;
  sku?: string;
  [key: string]: unknown;
}
