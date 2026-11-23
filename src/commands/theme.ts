import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { logger } from "../lib/logger.js";
import { parseLivePort } from "../lib/liveReload.js";
import { openBrowser } from "../lib/openBrowser.js";
import { requireToken } from "../lib/credentials.js";
import {
  appendReleaseAssets,
  createCatalogTheme,
  createReleaseDraft,
  discardReleaseDraft,
  installThemeFromCatalog,
  listCatalogThemes,
  listReleases,
  listThemes,
  previewInstall,
  publishInstall,
  publishReleaseDraft,
  pullCatalogThemeAssets,
  pullThemeAssets,
  pushThemeAssets,
  rollbackRelease,
} from "../lib/api.js";
import { validate } from "../lib/validate.js";
import {
  hashOfAsset,
  matchesOnly,
  maxUpdatedAt,
  readAssetsFromDir,
  readState,
  writeAsset,
  writeState,
  walkTree,
  STATE_FILE,
} from "../lib/themeAssets.js";
import { registerWatchCommand } from "./watch.js";

interface PullOptions {
  install: string;
  output?: string;
  force?: boolean;
  only?: string[];
}

interface PullCatalogOptions {
  sku: string;
  output?: string;
  force?: boolean;
  only?: string[];
}

interface PushOptions {
  install: string;
  dir?: string;
  only?: string[];
  force?: boolean;
  dryRun?: boolean;
  skipValidate?: boolean;
}

interface ReleaseOptions {
  sku: string;
  changelog?: string;
  dir?: string;
  bump?: string;
  deleted?: string[];
  dryRun?: boolean;
  yes?: boolean;
}

interface ValidateOptions {
  dir?: string;
  json?: boolean;
}

interface CreateThemeOptions {
  sku: string;
  name: string;
  from?: string;
  themeVersion?: string;
  official?: boolean;
  listed?: boolean;
  previewUrl?: string;
}

interface InstallOptions {
  sku: string;
  name?: string;
}

interface InstallIdOptions {
  install: string;
}

interface ListOptions {
  json?: boolean;
}

/** El directorio de salida debe estar vacío (o usar --force). */
function assertWritableDir(dir: string, force?: boolean): void {
  if (!fs.existsSync(dir)) return;
  if (force) return;
  const entries = fs.readdirSync(dir).filter((name) => name !== STATE_FILE);
  if (entries.length > 0) {
    throw new Error(
      `El directorio ${dir} no está vacío. Usa --force para sobrescribir o elige otro -o.`,
    );
  }
}

/** Localiza el starter que viaja en el paquete (examples/default-theme). */
function resolveStarterDir(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i += 1) {
    const candidate = path.join(dir, "examples", "default-theme");
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  throw new Error("No se encontró el starter del tema (examples/default-theme).");
}

function copyDir(source: string, target: string): number {
  let count = 0;
  for (const file of walkTree(source)) {
    const relative = path.relative(source, file);
    const dest = path.join(target, relative);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
    count += 1;
  }
  return count;
}

/** Los comandos de catálogo son de plataforma: solo se registran con VELSEFY_INTERNAL=1. */
const IS_INTERNAL = process.env.VELSEFY_INTERNAL === "1";

export function themeCommand(program: Command): void {
  const theme = program.command("theme").description("Gestiona los temas de VELSEFY");

  theme
    .command("init [dir]")
    .description("Crea un tema local desde el starter oficial")
    .option("--force", "Sobrescribe si el directorio no está vacío")
    .action((dir: string | undefined, options: { force?: boolean }) => {
      const target = path.resolve(dir || "./mi-tema");
      try {
        assertWritableDir(target, options.force);
        const starter = resolveStarterDir();
        const copied = copyDir(starter, target);
        logger.success(`Tema inicializado en ${target} (${copied} archivo(s)).`);
        logger.muted("Siguiente paso: `velsefy theme validate --dir " + target + "`.");
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  theme
    .command("list")
    .description("Lista los temas instalados en tu tienda")
    .option("--json", "Salida JSON")
    .action(async (options: ListOptions) => {
      const token = requireToken("theme list");
      const themes = await listThemes(token);
      if (options.json) {
        console.log(JSON.stringify({ themes }, null, 2));
        return;
      }
      if (themes.length === 0) {
        logger.warn("No hay temas.");
        return;
      }
      logger.bold("ID\tNOMBRE\tVERSIÓN\tACTIVO\tESTADO");
      for (const item of themes) {
        const version = item.version_semver ?? item.catalog_info?.version_semver ?? "-";
        logger.info(
          `${item.id}\t${item.name}\t${version}\t${item.is_active ? "sí" : "no"}\t${item.status}`,
        );
      }
    });

  theme
    .command("pull")
    .description("Descarga un tema instalado a un directorio local")
    .requiredOption("--install <id>", "Install ID del tema")
    .option("-o, --output <dir>", "Directorio de salida", "./theme-local")
    .option("--force", "Sobrescribe el directorio si no está vacío")
    .option("--only <paths...>", "Descarga solo estos paths o carpetas")
    .action(async (options: PullOptions) => {
      const token = requireToken("theme pull");
      const output = options.output as string;
      assertWritableDir(output, options.force);
      const all = await pullThemeAssets(token, options.install);
      const assets = all.filter((asset) => matchesOnly(asset.path, options.only));
      for (const asset of assets) writeAsset(output, asset.path, asset.content);
      const files: Record<string, string> = {};
      for (const asset of assets) files[asset.path] = hashOfAsset(asset.path, asset.content);
      writeState(output, {
        installId: options.install,
        baseUpdatedAt: maxUpdatedAt(assets),
        files,
      });
      logger.success(`Descargados ${assets.length} asset(s) en ${output}.`);
    });

  // Los comandos de catálogo son de plataforma: un token de tienda responde 403.
  // Solo se registran con VELSEFY_INTERNAL=1 para no exponerlos en el --help público.
  if (IS_INTERNAL) {
    theme
      .command("pull-catalog")
      .description("Descarga los assets del tema base del catálogo")
      .requiredOption("--sku <sku>", "SKU del tema del catálogo")
      .option("-o, --output <dir>", "Directorio de salida", "./theme-local")
      .option("--force", "Sobrescribe el directorio si no está vacío")
      .option("--only <paths...>", "Descarga solo estos paths o carpetas")
      .action(async (options: PullCatalogOptions) => {
        const token = requireToken("theme pull-catalog");
        const output = options.output as string;
        assertWritableDir(output, options.force);
        const all = await pullCatalogThemeAssets(token, options.sku);
        const assets = all.filter((asset) => matchesOnly(asset.path, options.only));
        for (const asset of assets) writeAsset(output, asset.path, asset.content);
        const files: Record<string, string> = {};
        for (const asset of assets) files[asset.path] = hashOfAsset(asset.path, asset.content);
        writeState(output, { sku: options.sku, files });
        logger.success(`Descargados ${assets.length} asset(s) del catálogo en ${output}.`);
      });
  }

  theme
    .command("push")
    .description("Sube el tema local al tema instalado (valida antes)")
    .requiredOption("--install <id>", "Install ID del tema")
    .option("--dir <dir>", "Directorio del tema local", "./theme-local")
    .option("--only <paths...>", "Sube solo estos paths o carpetas")
    .option("--force", "Sobrescribe sin base (omite el 409) y sin validación previa")
    .option("--dry-run", "Muestra qué se subiría sin escribir")
    .option("--skip-validate", "No valida el tema antes de subir")
    .action(async (options: PushOptions) => {
      const token = requireToken("theme push");
      const dir = options.dir as string;
      try {
        if (!options.skipValidate) {
          const result = validate(dir);
          if (!result.valid) {
            for (const issue of result.issues) logger.warn(`${issue.file}: ${issue.message}`);
            throw new Error("El tema no es válido. Corrige los errores o usa --skip-validate.");
          }
        }
        const { assets, hashes } = readAssetsFromDir(dir, options.only);
        if (assets.length === 0) throw new Error("No hay archivos para subir en ese directorio.");

        const state = readState(dir);
        const deletedPaths = state && !options.only
          ? Object.keys(state.files).filter((p) => !(p in hashes))
          : [];
        const changed = state
          ? assets.filter((asset) => state.files[asset.path] !== hashes[asset.path])
          : assets;

        if (!state?.baseUpdatedAt && !options.force && !options.dryRun) {
          throw new Error(
            "Falta la base de sincronización (.velsefy-state.json). Haz `theme pull` primero o usa --force.",
          );
        }

        if (options.dryRun) {
          logger.info(
            `[dry-run] ${changed.length} archivo(s) modificado(s), ${deletedPaths.length} a borrar.`,
          );
          for (const p of deletedPaths) logger.muted(`  - ${p}`);
          return;
        }

        if (state && changed.length === 0 && deletedPaths.length === 0 && !options.force) {
          logger.success("No hay cambios para subir.");
          return;
        }

        const result = await pushThemeAssets(token, options.install, assets, {
          baseUpdatedAt: state?.baseUpdatedAt,
          deletedPaths,
          force: options.force,
        });

        if (result.status === "conflict") {
          logger.error("Conflicto 409: el tema fue modificado en otro lado.");
          for (const conflict of result.conflict.conflicts) {
            logger.warn(
              `  ${conflict.path} (servidor: ${conflict.serverUpdatedAt}${
                conflict.localUpdatedAt ? `, local: ${conflict.localUpdatedAt}` : ""
              })`,
            );
          }
          logger.warn("Haz `theme pull` (guarda tus cambios locales) y reintenta, o usa --force.");
          process.exitCode = 1;
          return;
        }

        // El estado refleja el servidor: se suman los subidos y se quitan los borrados.
        const nextFiles: Record<string, string> = { ...(state?.files ?? {}) };
        for (const p of deletedPaths) delete nextFiles[p];
        Object.assign(nextFiles, hashes);

        writeState(dir, {
          installId: options.install,
          baseUpdatedAt: result.updatedAt,
          sku: state?.sku,
          files: nextFiles,
        });
        logger.success(
          `Subidos ${assets.length} archivo(s)${deletedPaths.length ? `, eliminados ${deletedPaths.length}` : ""}.`,
        );
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

  registerWatchCommand(theme);

  theme
    .command("install")
    .description("Instala un tema del catálogo en tu tienda")
    .requiredOption("--sku <sku>", "SKU del tema del catálogo")
    .option("--name <nombre>", "Nombre de la copia instalada")
    .action(async (options: InstallOptions) => {
      const token = requireToken("theme install");
      const result = await installThemeFromCatalog(token, options.sku, options.name);
      if (!result.ok || !result.install_id) throw new Error("No se pudo instalar el tema.");
      logger.success(`Tema instalado. install_id=${result.install_id}`);
      logger.muted("Siguiente: `velsefy theme pull --install " + result.install_id + "`.");
    });

  theme
    .command("publish")
    .description("Activa un tema instalado en la tienda")
    .requiredOption("--install <id>", "Install ID del tema")
    .action(async (options: InstallIdOptions) => {
      const token = requireToken("theme publish");
      await publishInstall(token, options.install);
      logger.success(`Tema ${options.install} publicado (activo).`);
    });

  theme
    .command("preview")
    .description("Genera la URL de vista previa del tema instalado (lista para abrir)")
    .requiredOption("--install <id>", "Install ID del tema")
    .option("--session <token>", "Sesión de usuario de la tienda (también VELSEFY_SESSION_TOKEN)")
    .option("--live-port <port>", "Puerto del live reload activo, para que la página se recargue sola")
    .option("--open", "Abre la vista previa en el navegador")
    .action(
      async (options: {
        install: string;
        session?: string;
        livePort?: string;
        open?: boolean;
      }) => {
        const token = requireToken("theme preview");
        const sessionToken = (options.session ?? process.env.VELSEFY_SESSION_TOKEN ?? "").trim();
        if (!sessionToken) {
          logger.error(
            "Falta la sesión de usuario: la vista previa abre la tienda como su dueño.\n" +
              "  Abre el editor de temas en el POS y copia el token de la sesión, o pásalo con --session / VELSEFY_SESSION_TOKEN.",
          );
          process.exitCode = 1;
          return;
        }
        const livePort = options.livePort ? (parseLivePort(options.livePort) ?? undefined) : undefined;
        const result = await previewInstall(token, options.install, sessionToken, {
          liveReload: livePort,
        });
        if (!result.url) throw new Error("El servidor no devolvió una URL de preview.");
        logger.success(result.url);
        if (livePort) {
          logger.muted(`Con recarga automática del puerto ${livePort}.`);
        }
        if (options.open && !openBrowser(result.url)) {
          logger.warn("No se pudo abrir el navegador; copia la dirección de arriba.");
        }
      },
    );

  if (IS_INTERNAL) {
    theme
      .command("catalog")
      .description("Lista los temas del catálogo global")
      .option("--json", "Salida JSON")
      .action(async (options: ListOptions) => {
        const token = requireToken("theme catalog");
        const themes = await listCatalogThemes(token);
        if (options.json) {
          console.log(JSON.stringify({ themes }, null, 2));
          return;
        }
        logger.bold("SKU\tNOMBRE\tVERSIÓN\tBASE");
        for (const item of themes) {
          logger.info(`${item.sku}\t${item.name}\t${item.version_semver ?? "-"}\t${item.is_default ? "sí" : "no"}`);
        }
      });

    theme
      .command("create")
      .description("Crea un tema base nuevo en el catálogo global")
      .requiredOption("--sku <sku>", "SKU del nuevo tema base")
      .requiredOption("--name <nombre>", "Nombre del nuevo tema base")
      .option("--from <baseSku>", "SKU del tema base del que clonar (opcional)")
      .option("--theme-version <semver>", "Versión semver inicial (1.0.0 por defecto)")
      .option("--no-official", "No marcar el tema como oficial (por defecto oficial)")
      .option("--no-listed", "Crear el tema oculto del catálogo (por defecto visible)")
      .option("--preview-url <url>", "Portada del tema (http/https)")
      .action(async (options: CreateThemeOptions) => {
        const token = requireToken("theme create");
        const result = await createCatalogTheme(token, options.sku, options.name, options.from, {
          versionSemver: options.themeVersion,
          isOfficial: options.official,
          isListed: options.listed,
          previewUrl: options.previewUrl,
        });
        logger.success(`Tema base creado: ${result.sku}`);
      });

  theme
    .command("release")
    .description("Publica una release del tema local al catálogo")
    .requiredOption("--sku <sku>", "SKU del catálogo")
    .option("--changelog <texto>", "Notas de la release")
    .option("--dir <dir>", "Directorio del tema local", "./theme-local")
    .option("--bump <tipo>", "Tipo de bump: patch | minor | major", "patch")
    .option("--deleted <paths...>", "Paths eliminados que se borran del catálogo")
    .option("--dry-run", "Muestra qué se publicaría sin escribir")
    .option("--yes", "No pide confirmación")
    .action(async (options: ReleaseOptions) => {
      const token = requireToken("theme release");
      const dir = options.dir as string;
      try {
        const result = validate(dir);
        if (!result.valid) {
          for (const issue of result.issues) logger.warn(`${issue.file}: ${issue.message}`);
          throw new Error("El tema no es válido: la release fue cancelada.");
        }
        const { assets, hashes } = readAssetsFromDir(dir);

        const state = readState(dir);
        const sameBase = state?.sku === options.sku;
        const deletedPaths =
          options.deleted && options.deleted.length > 0
            ? options.deleted
            : sameBase
              ? Object.keys(state.files).filter((p) => !(p in hashes))
              : [];

        if (assets.length === 0 && deletedPaths.length === 0) {
          throw new Error("No hay archivos para publicar en ese directorio.");
        }

        // Sin cambios reales no se crea una versión vacía (ensuciaría el historial).
        const changed = sameBase
          ? assets.filter((asset) => state.files[asset.path] !== hashes[asset.path])
          : assets;
        if (sameBase && changed.length === 0 && deletedPaths.length === 0) {
          throw new Error(
            "No hay cambios desde la última versión: la release sería idéntica. " +
              "Modifica archivos (o usa `theme pull-catalog` si el tema local está viejo).",
          );
        }

        const bump = (options.bump || "patch").toLowerCase();
        if (!["patch", "minor", "major"].includes(bump)) {
          throw new Error("--bump debe ser patch, minor o major.");
        }
        const changelog = `${bump !== "patch" ? `[${bump}] ` : ""}${options.changelog ?? ""}`.trim();

        if (options.dryRun) {
          logger.info(
            `[dry-run] release ${options.sku}: ${changed.length} archivo(s) modificado(s), ` +
              `${deletedPaths.length} baja(s), bump=${bump}.`,
          );
          return;
        }
        if (!options.yes) {
          logger.warn(
            `Vas a publicar ${assets.length} archivo(s) (${changed.length} modificado(s)) y ` +
              `${deletedPaths.length} baja(s) en ${options.sku}. Repite con --yes para confirmar.`,
          );
          process.exitCode = 1;
          return;
        }

        // El tema completo viaja por lotes: una sola petición grande se corta
        // en la puerta. El catálogo no cambia hasta que se publica el borrador.
        const MAX_FILES = 30;
        const MAX_BYTES = 240_000;
        const batches: typeof assets[] = [];
        let batch: typeof assets = [];
        let batchBytes = 0;
        for (const asset of assets) {
          const size = Buffer.byteLength(asset.path) + Buffer.byteLength(asset.content) + 48;
          if (
            batch.length > 0 &&
            (batch.length >= MAX_FILES || batchBytes + size > MAX_BYTES)
          ) {
            batches.push(batch);
            batch = [];
            batchBytes = 0;
          }
          batch.push(asset);
          batchBytes += size;
        }
        if (batch.length > 0) batches.push(batch);

        const draft = await createReleaseDraft(token, options.sku, changelog || undefined);
        let res: Awaited<ReturnType<typeof publishReleaseDraft>>;
        try {
          for (let i = 0; i < batches.length; i += 1) {
            logger.muted(
              `Enviando lote ${i + 1}/${batches.length} (${batches[i].length} archivos)…`,
            );
            await appendReleaseAssets(token, options.sku, draft.release_id, batches[i]);
          }
          res = await publishReleaseDraft(token, options.sku, draft.release_id);
        } catch (err) {
          // Un borrador a medias no debe quedar en el historial.
          await discardReleaseDraft(token, options.sku, draft.release_id).catch(() => {});
          throw err;
        }

        const version = res.version_semver ?? (res.version !== undefined ? String(res.version) : "");
        logger.success(`Release creada: ${options.sku}@${version}`);

        // El tema local queda sincronizado con lo publicado.
        const nextFiles: Record<string, string> = { ...(state?.files ?? {}) };
        for (const p of deletedPaths) delete nextFiles[p];
        Object.assign(nextFiles, hashes);
        writeState(dir, {
          installId: state?.installId,
          baseUpdatedAt: state?.baseUpdatedAt,
          sku: options.sku,
          files: nextFiles,
        });
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });

    theme
      .command("releases")
      .description("Lista las releases del catálogo")
      .requiredOption("--sku <sku>", "SKU del catálogo")
      .option("--json", "Salida JSON")
      .action(async (options: { sku: string; json?: boolean }) => {
        const token = requireToken("theme releases");
        const releases = await listReleases(token, options.sku);
        if (options.json) {
          console.log(JSON.stringify({ releases }, null, 2));
          return;
        }
        logger.bold("ID\tVERSIÓN\tESTADO\tCHANGELOG");
        for (const item of releases) {
          logger.info(`${item.id}\t${item.version}\t${item.status}\t${item.changelog ?? ""}`);
        }
      });

    theme
      .command("rollback")
      .description("Revierte el catálogo a una release anterior")
      .requiredOption("--sku <sku>", "SKU del catálogo")
      .requiredOption("--release <id>", "ID de la release")
      .action(async (options: { sku: string; release: string }) => {
        const token = requireToken("theme rollback");
        const result = await rollbackRelease(token, options.sku, options.release);
        const version = result.version_semver ?? (result.version !== undefined ? String(result.version) : "");
        logger.success(
          `Rollback publicado: ${options.sku}@${version} (vuelve a la versión ${result.from_version ?? "?"}).`,
        );
      });
  }

  theme
    .command("validate")
    .description("Valida un tema local (Liquid, JSON, schema, semver, paths)")
    .option("--dir <dir>", "Directorio del tema", "./theme-local")
    .option("--json", "Salida JSON")
    .action((options: ValidateOptions) => {
      const result = validate(options.dir as string);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        if (!result.valid) process.exitCode = 1;
        return;
      }
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
