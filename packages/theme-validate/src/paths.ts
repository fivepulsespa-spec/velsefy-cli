const ALLOWED_TOP_LEVEL = new Set([
  "assets",
  "sections",
  "layout",
  "snippets",
  "config",
  "templates",
]);

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

/**
 * Valida un path relativo de tema.
 * Bloquea: rutas con "..", backslashes, símbolos "%" y carpetas raíz no permitidas.
 */
export function validateThemePath(relativePath: string): boolean {
  if (relativePath.includes("\\")) return false;
  if (relativePath.includes("%")) return false;

  const segments = relativePath.split("/");
  if (segments.length === 0) return false;
  if (segments.some((segment) => segment === "..")) return false;

  if (!ALLOWED_TOP_LEVEL.has(segments[0])) return false;

  for (let i = 1; i < segments.length; i += 1) {
    const segment = segments[i];
    if (!segment || !SAFE_SEGMENT.test(segment)) return false;
  }

  return true;
}

/** Extensiones que el servidor acepta para assets del tema. */
export const ALLOWED_EXTENSIONS = new Set([
  "css", "js", "mjs", "json", "svg", "png", "jpg", "jpeg", "webp", "gif",
  "ico", "woff", "woff2", "ttf", "txt", "xml", "liquid",
]);

/** true si la extensión (sin punto) está permitida en un tema. */
export function isAllowedThemeExtension(ext: string): boolean {
  return ALLOWED_EXTENSIONS.has(ext.toLowerCase().replace(/^\./, ""));
}

