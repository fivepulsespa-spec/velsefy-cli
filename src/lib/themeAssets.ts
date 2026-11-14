import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { validateThemePath } from "@velsefy/theme-validate";
import type { ReleaseAsset, ThemeAsset, ThemeState } from "../types.js";

/** Carpetas del tema que viajan al servidor. La raíz nunca se sincroniza. */
export const ALLOWED_DIRS = ["assets", "sections", "layout", "snippets", "config", "templates"];

/** Archivo de sincronización local; vive en la raíz a propósito. */
export const STATE_FILE = ".velsefy-state.json";

/** Extensiones que viajan en base64 (binario real). El resto es texto UTF-8. */
const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "webp", "gif", "ico", "woff", "woff2", "ttf",
]);

/** Archivo del tema localizado en disco, con su ruta relativa normalizada. */
export interface ThemeFile {
  relative: string;
  full: string;
}

export function extOf(filePath: string): string {
  return path.extname(filePath).replace(/^\./, "").toLowerCase();
}

export function isBinary(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(extOf(filePath));
}

export function hashOf(content: Buffer | string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/** Hash del archivo tal como está en disco (binarios: bytes reales). */
export function hashOfAsset(assetPath: string, content: string): string {
  return hashOf(isBinary(assetPath) ? Buffer.from(content, "base64") : content);
}

export function walkTree(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
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

/** Une las opciones `--only` (paths o prefijos) con el listado completo. */
export function matchesOnly(relative: string, only?: string[]): boolean {
  if (!only || only.length === 0) return true;
  return only.some((entry) => relative === entry || relative.startsWith(entry.endsWith("/") ? entry : `${entry}/`));
}

/**
 * Recorre SOLO las carpetas permitidas y devuelve los archivos candidatos.
 * No valida rutas ni extensiones: cada comando decide cómo tratarlas.
 */
export function listThemeFiles(dir: string, only?: string[]): ThemeFile[] {
  if (!fs.existsSync(dir)) throw new Error(`El directorio del tema no existe: ${dir}`);
  const files: ThemeFile[] = [];
  for (const folder of ALLOWED_DIRS) {
    const fullFolder = path.join(dir, folder);
    if (!fs.existsSync(fullFolder)) continue;
    for (const file of walkTree(fullFolder)) {
      const relative = path.relative(dir, file).split(path.sep).join("/");
      if (!matchesOnly(relative, only)) continue;
      files.push({ relative, full: file });
    }
  }
  return files;
}

/** Lee los archivos indicados y calcula assets + hashes. */
export function readAssetsFromFiles(files: ThemeFile[]): {
  assets: ReleaseAsset[];
  hashes: Record<string, string>;
} {
  const assets: ReleaseAsset[] = [];
  const hashes: Record<string, string> = {};
  for (const file of files) {
    if (!validateThemePath(file.relative)) {
      throw new Error(`Path inválido en el tema local: ${file.relative}`);
    }
    const raw = fs.readFileSync(file.full);
    const content = isBinary(file.relative) ? raw.toString("base64") : raw.toString("utf8");
    assets.push({ path: file.relative, content });
    hashes[file.relative] = hashOf(raw);
  }
  return { assets, hashes };
}

/**
 * Lee el tema local: recorre SOLO las carpetas permitidas, ignora symlinks y
 * archivos ocultos, y codifica binarios en base64 (el servidor guarda texto).
 */
export function readAssetsFromDir(
  dir: string,
  only?: string[],
): { assets: ReleaseAsset[]; hashes: Record<string, string> } {
  return readAssetsFromFiles(listThemeFiles(dir, only));
}

/** Escribe un asset respetando binario (base64) vs texto. */
export function writeAsset(targetDir: string, assetPath: string, content: string): void {
  const target = path.join(targetDir, assetPath.split("/").join(path.sep));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (isBinary(assetPath)) {
    fs.writeFileSync(target, Buffer.from(content, "base64"));
  } else {
    fs.writeFileSync(target, content, "utf8");
  }
}

export function statePath(dir: string): string {
  return path.join(dir, STATE_FILE);
}

export function readState(dir: string): ThemeState | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(dir), "utf8")) as Partial<ThemeState>;
    return {
      installId: typeof parsed.installId === "string" ? parsed.installId : undefined,
      sku: typeof parsed.sku === "string" ? parsed.sku : undefined,
      baseUpdatedAt: typeof parsed.baseUpdatedAt === "string" ? parsed.baseUpdatedAt : undefined,
      files: parsed.files && typeof parsed.files === "object" ? (parsed.files as Record<string, string>) : {},
    };
  } catch {
    return null;
  }
}

export function writeState(dir: string, state: ThemeState): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statePath(dir), JSON.stringify(state, null, 2), "utf8");
}

export function maxUpdatedAt(assets: ThemeAsset[]): string | undefined {
  const max = assets.reduce<string | null>((acc, asset) => {
    const ts = asset.updated_at ?? asset.updatedAt ?? null;
    return ts && (!acc || new Date(ts).getTime() > new Date(acc).getTime()) ? ts : acc;
  }, null);
  return max ?? undefined;
}
