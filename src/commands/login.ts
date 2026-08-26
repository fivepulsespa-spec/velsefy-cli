import type { Command } from "commander";
import { logger } from "../lib/logger.js";
import { setToken } from "../lib/credentials.js";

export interface LoginOptions {
  token?: string;
}

export function loginCommand(program: Command): void {
  program
    .command("login")
    .description("Guarda un token de acceso de VELSEFY")
    // TODO: OAuth Device Flow (RFC 8628) interactivo no implementado aún.
    // Por ahora se acepta un token de acceso (PAT) emitido desde tu cuenta VELSEFY.
    .requiredOption("--token <token>", "Token de acceso de VELSEFY")
    .action((options: LoginOptions) => {
      try {
        setToken(options.token as string);
        logger.success("Credenciales guardadas.");
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
