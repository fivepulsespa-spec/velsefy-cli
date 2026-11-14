import fs from "node:fs";
import type { Command } from "commander";
import { logger } from "../lib/logger.js";
import { setToken } from "../lib/credentials.js";
import { listCatalogThemes, listThemes } from "../lib/api.js";

export interface LoginOptions {
  token?: string;
  tokenStdin?: boolean;
  verify?: boolean;
}

/** Prefijos válidos de token: personal (pat), app (tok) y plataforma (dev). */
const TOKEN_PREFIX = /^vls_(tok|dev|pat)_[A-Za-z0-9._-]{10,}$/;

function readStdinToken(): string {
  try {
    return fs.readFileSync(0, "utf8").trim();
  } catch {
    return "";
  }
}

export function loginCommand(program: Command): void {
  program
    .command("login")
    .description("Guarda un token de acceso de VELSEFY")
    // TODO: OAuth Device Flow (RFC 8628) interactivo.
    // Por ahora se acepta un token emitido desde tu cuenta (vls_pat_/vls_tok_) o
    // un token de plataforma (vls_dev_) para publicar al catálogo.
    .option("--token <token>", "Token de acceso (evita pasarlo por argv en CI)")
    .option("--token-stdin", "Lee el token desde stdin (recomendado en CI)")
    .option("--verify", "Verifica el token contra la API antes de guardarlo")
    .action(async (options: LoginOptions) => {
      try {
        const raw = options.tokenStdin ? readStdinToken() : options.token;
        const token = (raw ?? "").trim();
        if (!token) {
          throw new Error("Falta el token: usa --token <t> o --token-stdin.");
        }
        if (!TOKEN_PREFIX.test(token)) {
          throw new Error("El token no tiene un formato válido (vls_pat_, vls_tok_ o vls_dev_).");
        }

        if (options.verify) {
          if (token.startsWith("vls_dev_")) {
            await listCatalogThemes(token);
          } else {
            await listThemes(token);
          }
        }

        setToken(token);
        logger.success("Credenciales guardadas.");
        if (options.verify) logger.muted("Token verificado contra la API.");
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    });
}
