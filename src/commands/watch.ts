import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { isAllowedThemeExtension, validateThemePath } from "@velsefy/theme-validate";
import { ApiError, getThemeInstall, previewInstall, pushThemeAssets } from "../lib/api.js";
import { requireToken } from "../lib/credentials.js";
import { getAdminBase } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import {
  ALLOWED_DIRS,
  extOf,
  listThemeFiles,
  matchesOnly,
  readAssetsFromFiles,
  readState,
  writeState,
  type ThemeFile,
} from "../lib/themeAssets.js";
import { validate, validateThemeFile } from "../lib/validate.js";
import { planWatchChanges } from "../lib/watchPlan.js";
import { parseLivePort, startLiveReloadServer, type LiveReloadServer } from "../lib/liveReload.js";
import { openBrowser } from "../lib/openBrowser.js";
import type { ConflictResult, PushResult, ReleaseAsset, ThemeState } from "../types.js";

const DEFAULT_DEBOUNCE_MS = 400;
const THEME_MANIFEST = "theme.json";

interface WatchOptions {
  install: string;
  dir?: string;
  debounce?: string;
  only?: string[];
  force?: boolean;
  skipValidate?: boolean;
  dryRun?: boolean;
  liveReload?: boolean;
  livePort?: string;
  session?: string;
  open?: boolean;
}

export function registerWatchCommand(theme: Command): void {
  theme
    .command("watch")
    .description("Vigila el tema local y sube los cambios automáticamente")
    .requiredOption("--install <id>", "Install ID del tema")
    .option("--dir <dir>", "Directorio del tema local", "./theme-local")
    .option(
      "--debounce <ms>",
      "Espera tras el último cambio antes de subir",
      String(DEFAULT_DEBOUNCE_MS),
    )
    .option("--only <paths...>", "Vigila y sube solo estos paths o carpetas")
    .option("--force", "Omite la base de sincronización y los conflictos")
    .option("--skip-validate", "No valida el tema antes del primer envío")
    .option("--dry-run", "Muestra qué se subiría sin llamar a la API")
    .option("--live-port <port>", "Puerto fijo del live reload (1024..65535)")
    .option(
      "--session <token>",
      "Sesión de la tienda para armar la URL de vista previa (también VELSEFY_SESSION_TOKEN)",
    )
    .option("--open", "Abre la vista previa en el navegador al arrancar")
    .option("--no-live-reload", "Desactiva la recarga automática de la vista previa")
    .action(async (options: WatchOptions) => {
      try {
        await startWatch(options);
      } catch (err) {
        logger.error(errorMessage(err));
        process.exitCode = 1;
      }
    });
}

function parseDebounce(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_DEBOUNCE_MS;
  const value = raw.trim();
  if (!/^\d+$/.test(value)) {
    throw new Error("--debounce debe ser un número entero de milisegundos (por ejemplo 400).");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error("--debounce es demasiado grande. Usa un número de milisegundos razonable.");
  }
  return parsed;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Temporales de editor y ruido del sistema operativo que nunca se sincronizan. */
function isIgnoredSegment(segment: string): boolean {
  const lower = segment.toLowerCase();
  if (segment.startsWith(".")) return true;
  if (lower === "node_modules") return true;
  if (lower.endsWith(".tmp") || lower.endsWith(".swp") || lower.endsWith("~")) return true;
  if (segment === "4913") return true;
  if (segment.startsWith("~$")) return true;
  return false;
}

function normalizeRelative(relative: string): string {
  return relative.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * Segunda capa: descarta todo lo que no pertenece a una carpeta del tema.
 * El estado (.velsefy-state.json) vive en la raíz y cae aquí por diseño.
 */
function isIgnoredRelative(relative: string): boolean {
  const normalized = normalizeRelative(relative);
  if (normalized.length === 0) return true;
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) return true;
  if (!ALLOWED_DIRS.includes(segments[0])) return true;
  return segments.some(isIgnoredSegment);
}

function isRelevantEvent(relative: string, only?: string[]): boolean {
  if (isIgnoredRelative(relative)) return false;
  return matchesOnly(normalizeRelative(relative), only);
}

function warnOnce(seen: Set<string>, key: string, message: string): void {
  if (seen.has(key)) return;
  seen.add(key);
  logger.warn(message);
}

/**
 * La raíz queda fuera del watcher, así que un theme.json creado ahí no genera
 * eventos. Se avisa al arrancar y en cada sincronización que lo detecte.
 */
function warnThemeManifest(dir: string, seen: Set<string>): void {
  if (seen.has(THEME_MANIFEST)) return;
  if (!fs.existsSync(path.join(dir, THEME_MANIFEST))) return;
  seen.add(THEME_MANIFEST);
  logger.warn(`Se ignora ${THEME_MANIFEST}: la raíz del tema no se sincroniza.`);
}

/** Lee solo archivos válidos; los que el servidor rechazaría se ignoran con aviso. */
function readWatchedAssets(
  dir: string,
  only: string[] | undefined,
  warned: Set<string>,
): { assets: ReleaseAsset[]; hashes: Record<string, string> } {
  const usable: ThemeFile[] = [];
  for (const file of listThemeFiles(dir, only)) {
    if (isIgnoredRelative(file.relative)) continue;
    if (!validateThemePath(file.relative)) {
      warnOnce(warned, `path:${file.relative}`, `Se ignora ${file.relative}: ruta no permitida.`);
      continue;
    }
    if (!isAllowedThemeExtension(extOf(file.relative))) {
      warnOnce(
        warned,
        `ext:${file.relative}`,
        `Se ignora ${file.relative}: extensión no permitida.`,
      );
      continue;
    }
    usable.push(file);
  }
  return readAssetsFromFiles(usable);
}

function isTransient(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 0 || err.status >= 500);
}

const NETWORK_ERROR_CODES = new Set(["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"]);

/** Fallo de red del fetch (TypeError) o código de socket/red transitorio. */
function isNetworkError(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === 0;
  if (err instanceof TypeError) return true;
  if (err instanceof Error && "code" in err) {
    const code = (err as NodeJS.ErrnoException).code;
    return typeof code === "string" && NETWORK_ERROR_CODES.has(code);
  }
  return false;
}

/** Un reintento ante error de red o caída del servidor; después se sigue vigilando. */
async function pushWithRetry(
  token: string,
  installId: string,
  assets: ReleaseAsset[],
  options: {
    baseUpdatedAt?: string;
    deletedPaths: string[];
    force?: boolean;
    origin?: "watch";
  },
): Promise<PushResult> {
  try {
    return await pushThemeAssets(token, installId, assets, options);
  } catch (err) {
    if (!isTransient(err)) throw err;
    logger.warn("No se pudo conectar con el servidor. Reintentando una vez...");
    await delay(800);
    return await pushThemeAssets(token, installId, assets, options);
  }
}

function isRecursiveUnsupported(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  return code === "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM" || /recursive/i.test(err.message);
}

function filenameToString(filename: string | Buffer | null): string {
  if (!filename) return "";
  return filename.toString();
}

async function startWatch(options: WatchOptions): Promise<void> {
  const displayDir = options.dir && options.dir.length > 0 ? options.dir : "./theme-local";
  const installId = options.install;
  const debounceMs = parseDebounce(options.debounce);
  const only = options.only;
  const root = path.resolve(displayDir);

  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`El directorio del tema no existe: ${displayDir}`);
  }

  let state: ThemeState | null = readState(root);
  if (!state?.baseUpdatedAt && !options.force && !options.dryRun) {
    throw new Error(
      "Falta la base de sincronización (.velsefy-state.json). Haz `theme pull` primero o usa --force.",
    );
  }

  if (!options.skipValidate) {
    const result = validate(displayDir);
    if (!result.valid) {
      for (const issue of result.issues) logger.warn(`${issue.file}: ${issue.message}`);
      throw new Error("El tema no es válido. Corrige los errores o usa --skip-validate.");
    }
  }

  let token: string | undefined;
  if (!options.dryRun) token = requireToken("theme watch");

  // Aviso visible: si la instalación es la activa, cada guardado va a la tienda real.
  if (token) {
    const install = await getThemeInstall(token, installId).catch(() => null);
    if (install?.is_active) {
      logger.warn("⚠ Estás editando el TEMA PUBLICADO EN VIVO de esta tienda.");
      logger.warn("Cada guardado se aplica a la tienda real. Ctrl+C para salir.");
      logger.muted("Para probar sin riesgo, usa la copia en borrador de otro tema.");
    }
  }

  // Live reload: canal local que solo usa la vista previa del tema.
  const livePort = parseLivePort(options.livePort);
  let live: LiveReloadServer | null = null;
  if (options.liveReload !== false) {
    try {
      live = await startLiveReloadServer(livePort, (clients) => {
        if (clients === 1) logger.muted("Cliente conectado al live reload (canal).");
      });
    } catch (err) {
      logger.warn(`No se pudo activar el live reload: ${errorMessage(err)}`);
    }
  }

  const watcherRoots = ALLOWED_DIRS.map((folder) => path.join(root, folder)).filter((folder) => {
    try {
      return fs.statSync(folder).isDirectory();
    } catch {
      return false;
    }
  });
  // Las carpetas que todavía no existen se vigilan desde la raíz del tema: si
  // alguien crea `sections/` con el comando encendido, se engancha sola y sus
  // archivos se suben sin tener que reiniciar el watch.
  const pendingRoots = new Set(
    ALLOWED_DIRS.map((folder) => path.join(root, folder)).filter(
      (folder) => !watcherRoots.includes(folder),
    ),
  );

  const warned = new Set<string>();
  const warnedRoot = new Set<string>();
  const watchers: fs.FSWatcher[] = [];
  const manualDirs = new Set<string>();
  const manualRoots: string[] = [];
  const idleWaiters: Array<() => void> = [];
  let usingManual = false;
  let running = false;
  let queued = false;
  let timer: NodeJS.Timeout | null = null;
  let stopping = false;
  let finished = false;

  function closeWatchers(): void {
    for (const watcher of watchers) {
      try {
        watcher.close();
      } catch {
        // El watcher ya estaba cerrado.
      }
    }
    watchers.length = 0;
    manualDirs.clear();
  }

  function finish(code: number): void {
    if (finished) return;
    finished = true;
    stopping = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (live) {
      live.close();
      live = null;
    }
    closeWatchers();
    process.exitCode = code;
    process.exit(code);
  }

  function handleError(err: unknown): void {
    if (err instanceof ApiError) {
      // Transitorios: request() ya reintentó; se sigue observando.
      if (err.status === 0 || err.status >= 500 || err.status === 429) {
        logger.warn(`${err.message} Se sigue vigilando; el próximo guardado reintenta.`);
        return;
      }
      if (err.status === 401 || err.status === 403) {
        logger.error(err.message);
        logger.warn("Revisa tu sesión con `velsefy login` antes de volver a vigilar.");
        finish(1);
        return;
      }
      if (err.status === 404) {
        logger.error(
          `No se encontró la instalación ${installId}. Verifica el id con \`velsefy theme list\`.`,
        );
        finish(1);
        return;
      }
      if (err.status === 409) {
        logger.error(`${err.message} Haz \`velsefy theme pull\` y vuelve a iniciar \`theme watch\`.`);
        finish(1);
        return;
      }
      // Cualquier otro 4xx es definitivo: no se reintenta.
      logger.error(`${err.message} Corrige el problema y vuelve a iniciar \`theme watch\`.`);
      finish(1);
      return;
    }
    // Fallo de red sin ApiError: puede recuperarse; no se cierra el watcher.
    const prefix = isNetworkError(err) ? "Fallo de red" : "No se pudo sincronizar";
    logger.warn(`${prefix}: ${errorMessage(err)} Se sigue vigilando.`);
  }

  function reportConflict(conflict: ConflictResult): void {
    logger.error("Conflicto 409: el tema fue modificado en otro lado.");
    for (const item of conflict.conflicts) {
      logger.warn(
        `  ${item.path} (servidor: ${item.serverUpdatedAt}${
          item.localUpdatedAt ? `, local: ${item.localUpdatedAt}` : ""
        })`,
      );
    }
    logger.warn(
      "Haz `velsefy theme pull` (guarda tus cambios locales) y vuelve a iniciar `theme watch`.",
    );
    finish(1);
  }

  async function runSync(silentIfUnchanged: boolean): Promise<void> {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      warnThemeManifest(root, warnedRoot);
      const { assets, hashes } = readWatchedAssets(root, only, warned);
      const plan = planWatchChanges(state?.files ?? {}, hashes, only);

      if (plan.changed.length === 0 && plan.deleted.length === 0) {
        if (!silentIfUnchanged) logger.muted("Sin cambios.");
        return;
      }

      // Gate local: un archivo incompleto no se envía y no cuenta como sincronizado.
      const validChanged: string[] = [];
      for (const relative of plan.changed) {
        const issues = validateThemeFile(root, relative);
        if (issues.length === 0) {
          validChanged.push(relative);
          continue;
        }
        for (const issue of issues) logger.warn(`${relative}: ${issue.message}`);
      }
      const invalidCount = plan.changed.length - validChanged.length;

      if (validChanged.length === 0 && plan.deleted.length === 0) {
        logger.warn("No se subió nada: corrige los archivos marcados y vuelve a guardar.");
        return;
      }

      if (options.dryRun) {
        logger.info(
          `[dry-run] ↑ ${validChanged.length} archivo(s) subido(s), ` +
            `− ${plan.deleted.length} archivo(s) eliminado(s).`,
        );
        for (const relative of validChanged) logger.muted(`  + ${relative}`);
        for (const relative of plan.deleted) logger.muted(`  - ${relative}`);
        if (invalidCount > 0) {
          logger.warn(`${invalidCount} archivo(s) con errores no se subieron.`);
        }
        return;
      }

      if (!token) throw new Error("No hay token de acceso para subir los cambios.");

      const changed = new Set(validChanged);
      const changedAssets = assets.filter((asset) => changed.has(asset.path));
      const result = await pushWithRetry(token, installId, changedAssets, {
        baseUpdatedAt: state?.baseUpdatedAt,
        deletedPaths: plan.deleted,
        force: options.force,
        origin: "watch",
      });

      if (result.status === "conflict") {
        reportConflict(result.conflict);
        return;
      }

      const nextFiles: Record<string, string> = { ...(state?.files ?? {}) };
      for (const relative of plan.deleted) delete nextFiles[relative];
      for (const relative of validChanged) nextFiles[relative] = hashes[relative];
      state = { installId, baseUpdatedAt: result.updatedAt, sku: state?.sku, files: nextFiles };
      try {
        writeState(root, state);
      } catch (err) {
        logger.warn(`No se pudo guardar el estado local: ${errorMessage(err)}`);
      }

      logger.success(`↑ ${validChanged.length} archivo(s) subido(s)`);
      if (plan.deleted.length > 0) {
        logger.success(`- ${plan.deleted.length} archivo(s) eliminado(s)`);
      }
      if (invalidCount > 0) {
        logger.warn(`${invalidCount} archivo(s) con errores no se subieron.`);
      }
      live?.notify();
    } catch (err) {
      handleError(err);
    } finally {
      running = false;
      for (const resolve of idleWaiters.splice(0)) resolve();
      if (queued) {
        queued = false;
        if (!stopping) schedule(0);
      }
    }
  }

  function schedule(waitMs: number = debounceMs): void {
    if (stopping || finished) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void runSync(false);
    }, waitMs);
  }

  /** Registra carpetas nuevas en el modo de compatibilidad (sin watch recursivo). */
  function registerManualTree(folder: string): void {
    const stack = [folder];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(current);
      } catch {
        continue;
      }
      if (!stat.isDirectory() || stat.isSymbolicLink()) continue;

      if (!manualDirs.has(current)) {
        manualDirs.add(current);
        try {
          const watcher = fs.watch(current, { recursive: false }, (_event, filename) => {
            const name = filenameToString(filename);
            if (!name) {
              onEvent("");
              return;
            }
            onEvent(path.relative(root, path.join(current, name)));
          });
          watcher.on("error", () => {
            manualDirs.delete(current);
            try {
              watcher.close();
            } catch {
              // El watcher ya estaba cerrado.
            }
          });
          watchers.push(watcher);
        } catch (err) {
          logger.warn(`No se pudo vigilar ${current}: ${errorMessage(err)}`);
        }
      }

      try {
        for (const name of fs.readdirSync(current)) {
          if (isIgnoredSegment(name)) continue;
          stack.push(path.join(current, name));
        }
      } catch {
        // La carpeta pudo desaparecer mientras se recorría.
      }
    }
  }

  function watchFolder(folder: string): void {
    try {
      const watcher = fs.watch(folder, { recursive: true }, (_event, filename) => {
        const name = filenameToString(filename);
        if (!name) {
          onEvent("");
          return;
        }
        onEvent(path.relative(root, path.join(folder, name)));
      });
      watcher.on("error", (err) => {
        logger.warn(`No se pudo seguir vigilando ${folder}: ${errorMessage(err)}`);
      });
      watchers.push(watcher);
      return;
    } catch (err) {
      if (!isRecursiveUnsupported(err)) {
        logger.warn(`No se pudo vigilar ${folder}: ${errorMessage(err)}`);
        return;
      }
    }
    usingManual = true;
    manualRoots.push(folder);
    registerManualTree(folder);
  }

  /** Engancha un vigilante a la raíz para las carpetas del tema que aún no
   *  existen. Al aparecer una, se le pone su propio vigilante y se sincroniza
   *  lo que traiga, sin reiniciar el comando. */
  function watchRootForPending(): void {
    if (pendingRoots.size === 0) return;
    let rootWatcher: fs.FSWatcher;
    try {
      rootWatcher = fs.watch(root, { recursive: false }, (_event, filename) => {
        const name = filenameToString(filename);
        if (!name) return;
        const full = path.join(root, name);
        if (!pendingRoots.has(full)) return;
        try {
          if (!fs.statSync(full).isDirectory()) return;
        } catch {
          return;
        }
        pendingRoots.delete(full);
        watchFolder(full);
        if (pendingRoots.size === 0) {
          try {
            rootWatcher.close();
          } catch {
            // Ya estaba cerrado.
          }
        }
        schedule(0);
      });
    } catch {
      return;
    }
    rootWatcher.on("error", () => {
      try {
        rootWatcher.close();
      } catch {
        // Ya estaba cerrado.
      }
    });
    watchers.push(rootWatcher);
  }

  function onEvent(relative: string): void {
    if (stopping || finished) return;
    const normalized = normalizeRelative(relative);
    if (normalized.length > 0 && !isRelevantEvent(normalized, only)) return;
    if (usingManual) {
      for (const manualRoot of manualRoots) registerManualTree(manualRoot);
    }
    schedule();
  }

  function waitForIdle(): Promise<void> {
    if (!running) return Promise.resolve();
    return new Promise((resolve) => idleWaiters.push(resolve));
  }

  async function handleInterrupt(): Promise<void> {
    if (finished) return;
    stopping = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    logger.muted("Cerrando el watch...");
    try {
      if (running) await waitForIdle();
      await runSync(true);
    } catch (err) {
      logger.warn(`No se pudo completar el último envío: ${errorMessage(err)}`);
    }
    finish(0);
  }

  warnThemeManifest(root, warnedRoot);
  logger.info(`Vigilando ${displayDir} (install ${installId}). Ctrl+C para salir.`);
  if (live) {
    // Sin sesión se abre el editor del panel, que la pone por dentro.
    const editorUrl =
      `${getAdminBase()}/admin/ecommerce/editor/${encodeURIComponent(installId)}` +
      `?live_reload=${live.port}`;
    const sessionToken = (options.session ?? process.env.VELSEFY_SESSION_TOKEN ?? "").trim();

    if (!options.dryRun && token && sessionToken) {
      try {
        const preview = await previewInstall(token, installId, sessionToken, {
          liveReload: live.port,
        });
        if (preview.url) {
          logger.info("Vista previa lista (se recarga sola al guardar):");
          logger.success(preview.url);
          logger.muted("La vista previa usa tu sesión de la tienda; si caduca, vuelve a ejecutar el comando.");
          if (options.open && !openBrowser(preview.url)) {
            logger.warn("No se pudo abrir el navegador; copia la dirección de arriba.");
          }
        }
      } catch (err) {
        logger.warn(`No se pudo armar la vista previa automática: ${errorMessage(err)}`);
        logger.info("Abre el editor de tu tienda (la sesión la pone él):");
        logger.success(editorUrl);
        if (options.open && !openBrowser(editorUrl)) {
          logger.warn("No se pudo abrir el navegador; copia la dirección de arriba.");
        }
      }
    } else if (!options.dryRun) {
      logger.info("Vista previa con recarga automática (abre el editor de tu tienda):");
      logger.success(editorUrl);
      logger.muted("El editor usa tu sesión del panel: no hace falta copiar ningún token.");
      if (options.open && !openBrowser(editorUrl)) {
        logger.warn("No se pudo abrir el navegador; copia la dirección de arriba.");
      }
    }
  }
  if (options.dryRun) {
    logger.muted("Modo de prueba: no se llama a la API ni se escribe el estado local.");
  }

  for (const folder of watcherRoots) watchFolder(folder);
  watchRootForPending();
  if (watchers.length === 0) {
    throw new Error("No se pudo vigilar el tema. Revisa los permisos del directorio.");
  }

  process.once("SIGINT", () => {
    void handleInterrupt();
  });
}
