import os from "node:os";
import path from "node:path";

/** Directorio de configuración de velsefy (metadatos). Nunca contiene el token. */
export function configDir(): string {
  return path.join(os.homedir(), ".config", "velsefy");
}

/** Archivo de credenciales (solo el token, permisos 0600). */
export function credentialsFile(): string {
  return path.join(configDir(), "credentials");
}

/** Archivo de configuración (metadatos: apiBase, preferencias). Sin secrets. */
export function configFile(): string {
  return path.join(configDir(), "config.json");
}
