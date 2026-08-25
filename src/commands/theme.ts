import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { logger } from "../lib/logger.js";
import { requireToken } from "../lib/credentials.js";
import { listThemes, pullThemeAssets, pushThemeAssets, releaseTheme } from "../lib/api.js";
import { validate } from "../lib/validate.js";
import type { ReleaseAsset } from "../types.js";

interface InstallOption {
  install: string;
}

interface PullOptions extends InstallOption {
  output?: string;
}

interface PushOptions extends InstallOption {
  dir?: string;
}

interface ReleaseOptions {
  sku: string;
  changelog?: string;
  dir?: string;
}

interface ValidateOptions {
  dir?: string;
}

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

function readAssetsFromDir(dir: string): ReleaseAsset[] {
  if (!fs.existsSync(dir)) {
    throw new Error(`El directorio del tema no existe: ${dir}`);
  }
  return walkTree(dir).map((file) => {
    const relative = path.relative(dir, file).split(path.sep).join("/");
    return { path: relative, content: fs.readFileSync(file, "utf8") };
  });
}

export function themeCommand(program: Command): void {
  const theme = program
    .command("theme")
    .description("Gestiona temas de VELSEFY (Modelo A per-tienda / Modelo B catálogo)");

  theme
    .command("list")
    .description("Lista los temas instalados (Modelo A)")
    .action(async () => {
      const token = requireToken("theme list");
      const themes = await listThemes(token);
      if (themes.length === 0) {
        logger.warn("No hay temas.");
        return;
      }
      logger.bold("ID\tNOMBRE\tESTADO");
      for (const item of themes) {
        logger.info(`${item.id}\t${item.name}\t${item.status}`);
      }
    });

  theme
    .command("pull")
    .description("Descarga los assets de un tema a un directorio local")
    .requiredOption("--install <id>", "Install ID del tema")
    .option("-o, --output <dir>", "Directorio de salida", "./theme-local")
    .action(async (options: PullOptions) => {
      const token = requireToken("theme pull");
      const assets = await pullThemeAssets(token, options.install);
      for (const asset of assets) {
        const target = path.join(options.output as string, asset.path.split("/").join(path.sep));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, asset.content);
      }
      logger.success(`Descargados ${assets.length} asset(s) en ${options.output}.`);
    });

  theme
    .command("push")
    .description("Sube los assets del tema local al instalado (Modelo A)")
    .requiredOption("--install <id>", "Install ID del tema")
    .option("--dir <dir>", "Directorio del tema local", "./theme-local")
    .action(async (options: PushOptions) => {
      const token = requireToken("theme push");
      const assets = readAssetsFromDir(options.dir as string);
      const result = await pushThemeAssets(token, options.install, assets);
      if (result.status === "conflict") {
        logger.error("Conflicto 409: el tema fue modificado en otro lado.");
        for (const conflict of result.conflict.conflicts) {
          logger.warn(
            `  ${conflict.path} (servidor: ${conflict.serverUpdatedAt}${
              conflict.localUpdatedAt ? `, local: ${conflict.localUpdatedAt}` : ""
            })`,
          );
        }
        logger.warn("Resuelve los conflictos desde la web o vuelve a hacer pull y reintenta.");
        process.exitCode = 1;
        return;
      }
      logger.success(`Subidos ${assets.length} asset(s). updatedAt=${result.updatedAt}`);
    });

  theme
    .command("release")
    .description("Publica una release del tema en el catálogo (Modelo B)")
    .requiredOption("--sku <sku>", "SKU del catálogo")
    .option("--changelog <texto>", "Notas de la release")
    .option("--dir <dir>", "Directorio del tema local", "./theme-local")
    .action(async (options: ReleaseOptions) => {
      const token = requireToken("theme release");
      const assets = readAssetsFromDir(options.dir as string);
      const result = await releaseTheme(token, options.sku, options.changelog, assets);
      if (result.version) {
        logger.success(`Release creada: ${result.sku ?? options.sku}@${result.version}`);
      } else {
        logger.success("Release creada.");
      }
    });

  theme
    .command("validate")
    .description("Valida un tema local (Liquid balanceado, JSON, paths, semver)")
    .option("--dir <dir>", "Directorio del tema", "./theme-local")
    .action((options: ValidateOptions) => {
      // `theme validate` es una operación 100% LOCAL (no sube nada): NO pide
      // token. Sirve para pre-push y para CI sin credenciales.
      const result = validate(options.dir as string);
      if (result.themeVersion) {
        logger.info(`Versión del tema (theme_info): ${result.themeVersion}`);
      }
      if (result.valid) {
        logger.success("Tema válido.");
        return;
      }
      for (const issue of result.issues) {
        logger.warn(`${issue.file}: ${issue.message}`);
      }
      logger.error(`Tema inválido (${result.issues.length} problema(s)).`);
      process.exitCode = 1;
    });
}
