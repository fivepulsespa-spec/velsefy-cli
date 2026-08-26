import fs from "node:fs";
import path from "node:path";
import {
  extractThemeInfoVersion,
  validateLiquid,
  validateJsonFile,
  validateSectionSchema,
  validateThemePath,
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

function walkTree(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(current)) {
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
 * Valida un tema local: paths, balanceo de Liquid, JSON + estructura mínima,
 * y extrae la versión del grupo `theme_info`.
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

    if (ext === ".liquid") {
      const source = fs.readFileSync(file, "utf8");
      for (const message of validateLiquid(source)) {
        issues.push({ file: relative, message });
      }
      // Validación del bloque {% schema %}: tipos de settings permitidos + id.
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

  let themeVersion: string | null = null;
  const schemaPath = path.join(themeDir, "config", "settings_schema.json");
  if (fs.existsSync(schemaPath)) {
    try {
      const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as unknown;
      themeVersion = extractThemeInfoVersion(schema);
    } catch {
      // el JSON inválido ya se reporta por validateJsonFile
    }
  }

  return { valid: issues.length === 0, issues, themeVersion };
}
