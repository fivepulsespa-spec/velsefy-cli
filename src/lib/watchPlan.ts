import { matchesOnly } from "./themeAssets.js";

/** Cambios que un push debe enviar: subidas y bajas. */
export interface WatchPlan {
  changed: string[];
  deleted: string[];
}

/**
 * Calcula el plan de sincronización comparando el estado local con los hashes
 * del disco. Función pura: no toca el sistema de archivos ni la red.
 *
 * - `changed`: archivos nuevos o con hash distinto al del estado.
 * - `deleted`: archivos del estado que ya no existen en el disco.
 *
 * Con `--only`, ambos lados se limitan al alcance elegido: lo que queda fuera
 * no se sube ni se borra.
 */
export function planWatchChanges(
  stateFiles: Record<string, string>,
  hashes: Record<string, string>,
  only?: string[],
): WatchPlan {
  const changed = Object.keys(hashes)
    .filter((relative) => matchesOnly(relative, only) && stateFiles[relative] !== hashes[relative])
    .sort();
  const deleted = Object.keys(stateFiles)
    .filter((relative) => matchesOnly(relative, only) && !(relative in hashes))
    .sort();
  return { changed, deleted };
}
