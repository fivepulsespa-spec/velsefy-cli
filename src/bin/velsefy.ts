#!/usr/bin/env node
import { createProgram } from "../index.js";
import { logger } from "../lib/logger.js";

const program = createProgram();

program.parseAsync(process.argv).catch((err: unknown) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
