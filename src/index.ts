import { createRequire } from "node:module";
import { Command } from "commander";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { themeCommand } from "./commands/theme.js";

function pkgVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function createProgram(): Command {
  const program = new Command();
  program
    .name("velsefy")
    .description("CLI cross-platform de temas de VELSEFY (eCommerce + POS multi-tenant).")
    .version(pkgVersion())
    .showHelpAfterError()
    .showSuggestionAfterError();

  loginCommand(program);
  logoutCommand(program);
  themeCommand(program);

  return program;
}
