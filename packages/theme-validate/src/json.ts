export interface ParseResult {
  ok: boolean;
  value?: unknown;
  error?: string;
}

export function parseJson(raw: string): ParseResult {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function normalizePath(relativePath: string): string {
  return relativePath.split("\\").join("/");
}

export function isSettingsSchema(value: unknown): boolean {
  return Array.isArray(value) && value.some((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    return (entry as Record<string, unknown>).name === "theme_info";
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validación de JSON genérico + estructura mínima de archivos especiales
 * (`settings_schema.json`, `settings_data.json`, plantillas `*.json` del
 * carpeta `templates`).
 */
export function validateJsonFile(raw: string, relativePath: string): string[] {
  const issues: string[] = [];
  const parsed = parseJson(raw);
  if (!parsed.ok) {
    issues.push(`JSON inválido: ${parsed.error ?? "error desconocido"}`);
    return issues;
  }

  const value = parsed.value;
  const norm = normalizePath(relativePath);

  if (norm.endsWith("settings_schema.json")) {
    if (!isSettingsSchema(value)) {
      issues.push(
        "settings_schema.json debe ser un arreglo que contenga un grupo 'theme_info'",
      );
    }
  } else if (norm.endsWith("settings_data.json")) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      issues.push("settings_data.json debe ser un objeto JSON");
    }
  } else if (norm.startsWith("templates/")) {
    if (!isPlainObject(value)) {
      issues.push("Las plantillas de templates/*.json deben ser un objeto");
    } else if (!("sections" in value)) {
      issues.push("La plantilla debe tener una propiedad 'sections'");
    }
  }

  return issues;
}
