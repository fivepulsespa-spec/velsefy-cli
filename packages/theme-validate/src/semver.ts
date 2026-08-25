export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export function parseSemver(input: string): SemVer | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(input.trim());
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

export function isSemverValid(input: string): boolean {
  return parseSemver(input) !== null;
}

function toSemVer(value: string | SemVer): SemVer {
  if (typeof value === "string") {
    const parsed = parseSemver(value);
    if (!parsed) throw new Error(`Semver inválido: ${value}`);
    return parsed;
  }
  return value;
}

export function compareSemver(a: string | SemVer, b: string | SemVer): number {
  const pa = toSemVer(a);
  const pb = toSemVer(b);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
}
