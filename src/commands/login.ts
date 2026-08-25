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
    // Por ahora se acepta un PAT (Personal Access Token) con prefijos
    // vls_tok_ (por tienda) o vls_dev_ (plataforma).
    .requiredOption("--token <pat>", "Token personal de acceso (vls_tok_ / vls_dev_)")
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
