import { Command } from "commander";
import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { themeCommand } from "./commands/theme.js";

export function createProgram(): Command {
  const program = new Command();
  program
    .name("velsefy")
    .description("CLI cross-platform de temas de VELSEFY (eCommerce + POS multi-tenant).")
    .version("0.1.0")
    .showHelpAfterError()
    .showSuggestionAfterError();

  loginCommand(program);
  logoutCommand(program);
  themeCommand(program);

  return program;
}
