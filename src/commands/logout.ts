import type { Command } from "commander";
import { logger } from "../lib/logger.js";
import { clearToken } from "../lib/credentials.js";

export function logoutCommand(program: Command): void {
  program
    .command("logout")
    .description("Elimina las credenciales guardadas")
    .action(() => {
      try {
        clearToken();
        logger.success("Sesión cerrada.");
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
