import fs from "node:fs";
import path from "node:path";
import {
  extractThemeInfoVersion,
  isAllowedThemeExtension,
  isSemverValid,
  validateLiquid,
  validateJsonFile,
  validateSectionSchema,
  validateThemePath,
  validateHomeTemplate,
} from "@velsefy/theme-validate";

export interface ValidationIssue {
  file: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  themeVersion: string | null;
}

const ALLOWED_DIRS = ["assets", "sections", "layout", "snippets", "config", "templates"];

/** Une separadores y normaliza. Devuelve null si la ruta es absoluta o sale del tema. */
function normalizeThemeRelative(relativePath: string): string | null {
  const unified = relativePath.replace(/\\/g, "/");
  if (path.posix.isAbsolute(unified) || /^[A-Za-z]:\//.test(unified)) return null;
  const normalized = path.posix.normalize(unified);
  if (normalized === "." || normalized === "") return null;
  if (normalized === ".." || normalized.startsWith("../")) return null;
  return normalized;
}

function walkTree(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    // lstat: no seguir symlinks (evita ciclos y subir archivos externos).
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(current)) {
        if (name.startsWith(".")) continue;
        stack.push(path.join(current, name));
      }
    } else {
      out.push(current);
    }
  }
  return out;
}

/** Recolecta los archivos del tema dentro de las carpetas permitidas. */
export function collectThemeFiles(themeDir: string): string[] {
  const files: string[] = [];
  for (const dir of ALLOWED_DIRS) {
    const fullDir = path.join(themeDir, dir);
    if (!fs.existsSync(fullDir)) continue;
    for (const file of walkTree(fullDir)) {
      files.push(file);
    }
  }
  return files;
}

/**
 * Valida un tema local: paths/extensiones, Liquid balanceado, JSON,
 * `{% schema %}` obligatorio en secciones, semver y plantilla de inicio.
 */
export function validate(themeDir: string): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!fs.existsSync(themeDir)) {
    return {
      valid: false,
      issues: [{ file: "(raíz)", message: `El directorio del tema no existe: ${themeDir}` }],
      themeVersion: null,
    };
  }

  const files = collectThemeFiles(themeDir);

  for (const file of files) {
    const relative = path.relative(themeDir, file);
    const normalized = relative.split(path.sep).join("/");
    const ext = path.extname(file).toLowerCase();

    if (!validateThemePath(normalized)) {
      issues.push({ file: relative, message: `Path no permitido: ${normalized}` });
    }
    if (!isAllowedThemeExtension(ext)) {
      issues.push({ file: relative, message: `Extensión no permitida: ${ext || "(sin extensión)"}` });
    }

    if (ext === ".liquid") {
      const source = fs.readFileSync(file, "utf8");
      for (const message of validateLiquid(source)) {
        issues.push({ file: relative, message });
      }
      // Toda sección DEBE declarar su {% schema %}: el servidor lo exige y sin
      // él la sección no se puede configurar desde el editor.
      if (normalized.startsWith("sections/") && !/\{%-?\s*schema\s*-?%\}/.test(source)) {
        issues.push({ file: relative, message: "La sección no incluye {% schema %}." });
      }
      for (const issue of validateSectionSchema(source)) {
        issues.push({ file: relative, message: `${issue.path}: ${issue.message}` });
      }
    } else if (ext === ".json") {
      const source = fs.readFileSync(file, "utf8");
      for (const message of validateJsonFile(source, normalized)) {
        issues.push({ file: relative, message });
      }
    }
  }

  // El layout base es obligatorio (sin él no hay documento que renderizar).
  const layoutPath = path.join(themeDir, "layout", "theme.liquid");
  if (!fs.existsSync(layoutPath)) {
    issues.push({ file: "layout/theme.liquid", message: "Falta el layout base del tema." });
  }

  // Integridad del inicio: secciones existentes, sin fijas, orden coherente.
  for (const message of validateHomeTemplate(themeDir)) {
    issues.push({ file: "templates/index.json", message });
  }

  let themeVersion: string | null = null;
  const schemaPath = path.join(themeDir, "config", "settings_schema.json");
  if (!fs.existsSync(schemaPath)) {
    issues.push({ file: "config/settings_schema.json", message: "Falta settings_schema.json (theme_info)." });
  } else {
    try {
      const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as unknown;
      themeVersion = extractThemeInfoVersion(schema);
      if (!themeVersion) {
        issues.push({
          file: "config/settings_schema.json",
          message: "Falta theme_info.theme_version (la versión vive solo ahí).",
        });
      } else if (!isSemverValid(themeVersion)) {
        issues.push({
          file: "config/settings_schema.json",
          message: `theme_info.theme_version '${themeVersion}' no es semver (MAJOR.MINOR.PATCH).`,
        });
      }
    } catch {
      // el JSON inválido ya se reporta por validateJsonFile
    }
  }

  return { valid: issues.length === 0, issues, themeVersion };
}

/**
 * Valida un solo archivo del tema antes de enviarlo. No corre las comprobaciones
 * globales del tema (layout base, settings_schema ni templates/index.json).
 */
export function validateThemeFile(themeDir: string, relativePath: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const normalized = normalizeThemeRelative(relativePath);
  if (!normalized || !validateThemePath(normalized)) {
    return [{ file: normalized ?? relativePath, message: "Ruta no permitida" }];
  }

  const ext = path.posix.extname(normalized).toLowerCase();
  if (!isAllowedThemeExtension(ext)) {
    return [
      {
        file: normalized,
        message: `Extensión no permitida: ${ext || "(sin extensión)"}`,
      },
    ];
  }

  const full = path.join(themeDir, ...normalized.split("/"));
  if (!fs.existsSync(full)) {
    return [{ file: normalized, message: "El archivo no existe" }];
  }

  if (ext === ".liquid") {
    const source = fs.readFileSync(full, "utf8");
    for (const message of validateLiquid(source)) {
      issues.push({ file: normalized, message });
    }
    if (normalized.startsWith("sections/") && !/\{%-?\s*schema\s*-?%\}/.test(source)) {
      issues.push({ file: normalized, message: "La sección no incluye {% schema %}." });
    }
    for (const issue of validateSectionSchema(source)) {
      issues.push({ file: normalized, message: `${issue.path}: ${issue.message}` });
    }
  } else if (ext === ".json") {
    const source = fs.readFileSync(full, "utf8");
    for (const message of validateJsonFile(source, normalized)) {
      issues.push({ file: normalized, message });
    }
  }

  return issues;
}
