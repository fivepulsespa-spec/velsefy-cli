import fs from "node:fs";
import { configDir, configFile } from "./paths.js";

export interface Config {
  apiBase: string;
  [key: string]: unknown;
}

export const DEFAULT_API_BASE = "https://api.velsefy.com/v1";

export function getApiBase(): string {
  const envBase = process.env.VELSEFY_API_BASE;
  if (envBase) return envBase;
  const config = readConfig();
  if (typeof config.apiBase === "string" && config.apiBase.length > 0) {
    return config.apiBase;
  }
  return DEFAULT_API_BASE;
}

export function readConfig(): Config {
  try {
    const raw = fs.readFileSync(configFile(), "utf8");
    const parsed = JSON.parse(raw) as Partial<Config>;
    return { apiBase: DEFAULT_API_BASE, ...parsed };
  } catch {
    return { apiBase: DEFAULT_API_BASE };
  }
}

export function writeConfig(config: Config): void {
  fs.mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(configFile(), JSON.stringify(config, null, 2), { mode: 0o600 });
}
