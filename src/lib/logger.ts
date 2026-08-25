const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

const TOKEN_RE = /vls_(tok|dev)_\S+/g;

function useColor(): boolean {
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

function wrap(code: string, text: string): string {
  return useColor() ? `${code}${text}${COLORS.reset}` : text;
}

/** Elimina cualquier token del texto antes de mostrarlo en logs. */
export function redact(text: string): string {
  return text.replace(TOKEN_RE, "vls_***");
}

export const logger = {
  info: (message: string): void => {
    console.log(message);
  },
  success: (message: string): void => {
    console.log(wrap(COLORS.green, message));
  },
  warn: (message: string): void => {
    console.warn(wrap(COLORS.yellow, message));
  },
  error: (message: string): void => {
    console.error(wrap(COLORS.red, message));
  },
  muted: (message: string): void => {
    console.log(wrap(COLORS.dim, message));
  },
  bold: (message: string): void => {
    console.log(wrap(COLORS.bold, message));
  },
};
