import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { configDir, credentialsFile } from "./paths.js";
import { logger } from "./logger.js";
import type { TokenScope } from "../types.js";

export interface GetTokenOptions {
  scope?: TokenScope;
  /**
   * En CI no se usa el fallback a archivo: solo se acepta VELSEFY_TOKEN
   * o un store nativo, y si no hay token se lanza un error claro.
   */
  ci?: boolean;
}

const STORE_SERVICE = "velsefy";
const STORE_USER = "token";

/** Acepta cualquier token de acceso no trivial. La VALIDACIÓN real la hace el
 *  servidor (el cliente no conoce el esquema interno de tokens). */
export function isValidToken(token: string): boolean {
  return typeof token === "string" && token.trim().length >= 20;
}

function isCI(): boolean {
  return Boolean(
    process.env.CI ||
      process.env.CI_NAME ||
      process.env.GITHUB_ACTIONS ||
      process.env.GITLAB_CI ||
      process.env.TRAVIS ||
      process.env.BUILD_NUMBER,
  );
}

function hasCommand(command: string): boolean {
  try {
    execFileSync(command, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Lectura desde el almacén nativo del SO. Cada shell-out va envuelto en
 * try/catch; si el binario no existe o falla, se devuelve undefined para
 * continuar con el fallback a archivo 0600.
 */
const QUIET_STDIO = ["ignore", "pipe", "ignore"] as ["ignore", "pipe", "ignore"];

function readTokenFromNativeStore(): string | undefined {
  try {
    if (process.platform === "darwin") {
      const out = execFileSync("security", ["find-generic-password", "-s", STORE_SERVICE, "-a", STORE_USER, "-w"], {
        encoding: "utf8",
        stdio: QUIET_STDIO,
        windowsHide: true,
      });
      return out.trim() || undefined;
    }
    if (process.platform === "linux") {
      if (!hasCommand("secret-tool")) return undefined;
      const out = execFileSync("secret-tool", ["lookup", "service", STORE_SERVICE, "user", STORE_USER], {
        encoding: "utf8",
        stdio: QUIET_STDIO,
      });
      return out.trim() || undefined;
    }
    if (process.platform === "win32") {
      // En Windows el "store" delega al archivo 0600. DPAPI / Credential
      // Manager es un TODO futuro (ver README). El shell-out se mantiene
      // para que sea un verdadero store nativo cuando se migre a DPAPI.
      const script =
        '$ErrorActionPreference="SilentlyContinue"; $p="$env:USERPROFILE\\.config\\velsefy\\credentials"; if (Test-Path $p) { (Get-Content -Raw $p | ConvertFrom-Json).token } else { Write-Output "" }';
      const out = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
        encoding: "utf8",
        stdio: QUIET_STDIO,
        windowsHide: true,
      });
      return out.trim() || undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function ensureConfigDir(): void {
  fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
}

function writeTokenToFile(token: string): void {
  try {
    ensureConfigDir();
    fs.writeFileSync(credentialsFile(), JSON.stringify({ token }), { mode: 0o600 });
    logger.muted(`Token guardado en ${credentialsFile()} (permisos 0600).`);
  } catch (err) {
    throw new Error(`No se pudieron guardar las credenciales: ${(err as Error).message}`);
  }
}

function readTokenFromFile(): string | undefined {
  try {
    const raw = fs.readFileSync(credentialsFile(), "utf8");
    const parsed = JSON.parse(raw) as { token?: unknown };
    return typeof parsed.token === "string" && parsed.token.length > 0 ? parsed.token : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Cascada de resolución del token:
 * 1. Env `VELSEFY_TOKEN` (ideal para CI, nunca se escribe a disco).
 * 2. Store nativo del SO (macOS Keychain, Linux libsecret, Windows → archivo 0600).
 * 3. Fallback universal a archivo `~/.config/velsefy/credentials` (0600).
 */
export function getToken(opts: GetTokenOptions = {}): string | undefined {
  const envToken = process.env.VELSEFY_TOKEN;
  if (envToken) return envToken;

  const nativeToken = readTokenFromNativeStore();
  if (nativeToken) return nativeToken;

  if (opts.ci === true) return undefined;

  return readTokenFromFile();
}

/**
 * Devuelve el token o lanza un error claro con instrucciones de login.
 * Todos los comandos de `theme` pasan por aquí.
 */
export function requireToken(scope: string): string {
  const token = getToken({ ci: isCI() });
  if (token) return token;

  if (isCI()) {
    throw new Error(
      `No se pudo resolver un token para "${scope}". En CI define VELSEFY_TOKEN (se omite el fallback a archivo).`,
    );
  }

  throw new Error(
    `No hay token de acceso para "${scope}". Inicia sesión con: velsefy login --token <pat>`,
  );
}

export function setToken(token: string): void {
  if (!isValidToken(token)) {
    throw new Error(
      "Token inválido. Asegúrate de copiar el token completo desde tu cuenta VELSEFY.",
    );
  }

  try {
    if (process.platform === "darwin") {
      execFileSync("security", ["add-generic-password", "-U", "-s", STORE_SERVICE, "-a", STORE_USER, "-w", token], {
        stdio: "ignore",
        windowsHide: true,
      });
      logger.muted("Token guardado en el Keychain de macOS.");
      return;
    }

    if (process.platform === "linux") {
      if (hasCommand("secret-tool")) {
        execFileSync("secret-tool", ["store", "--label=velsefy", "service", STORE_SERVICE, "user", STORE_USER], {
          input: token,
          windowsHide: true,
        });
        logger.muted("Token guardado en el llavero libsecret (secret-tool).");
        return;
      }
      logger.warn("secret-tool no está disponible; usando fallback a archivo 0600.");
    }

    if (process.platform === "win32") {
      // DPAPI / Credential Manager es un TODO futuro; por ahora archivo 0600.
      logger.muted("Windows: token guardado en archivo 0600 (DPAPI próximo TODO).");
    }
  } catch {
    logger.warn("No se pudo usar el almacén nativo; usando fallback a archivo 0600.");
  }

  writeTokenToFile(token);
}

export function clearToken(): void {
  try {
    if (process.platform === "darwin") {
      execFileSync("security", ["delete-generic-password", "-s", STORE_SERVICE, "-a", STORE_USER], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else if (process.platform === "linux" && hasCommand("secret-tool")) {
      execFileSync("secret-tool", ["clear", "service", STORE_SERVICE, "user", STORE_USER], {
        stdio: "ignore",
      });
    }
  } catch {
    // No se pudo borrar del store nativo; seguimos con el archivo.
  }

  try {
    if (fs.existsSync(credentialsFile())) {
      fs.rmSync(credentialsFile(), { force: true });
    }
    logger.muted(`Credenciales eliminadas (${credentialsFile()} si existía).`);
  } catch (err) {
    throw new Error(`No se pudieron eliminar las credenciales: ${(err as Error).message}`);
  }
}
