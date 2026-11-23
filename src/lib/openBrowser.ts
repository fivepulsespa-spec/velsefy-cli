import { spawn } from "node:child_process";

/**
 * Abre una dirección web en el navegador del sistema. Devuelve `false` si la
 * dirección no es http(s) o si el sistema no pudo lanzar el navegador; nunca
 * lanza una excepción (un comando de desarrollo no debe caerse por esto).
 */
export function openBrowser(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;

  const [command, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];

  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    // `start`/`xdg-open` pueden fallar después de lanzarse: se ignora el aviso
    // para no romper el comando (la URL ya se imprimió en consola).
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
