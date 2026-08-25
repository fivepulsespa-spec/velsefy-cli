/**
 * Extrae `theme_version` del grupo `theme_info` de una `settings_schema.json`.
 *
 * Soporta dos formatos:
 * 1. `theme_version` como propiedad directa del grupo `theme_info`
 *    (formato Shopify puro).
 * 2. `theme_version` como valor `default` de un `setting` con `id: "theme_version"`.
 */
export function extractThemeInfoVersion(settingsSchema: unknown): string | null {
  if (!Array.isArray(settingsSchema)) return null;

  const group = settingsSchema.find((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    return (entry as Record<string, unknown>).name === "theme_info";
  });
  if (!group) return null;

  const info = group as Record<string, unknown>;

  if (typeof info.theme_version === "string" && info.theme_version.length > 0) {
    return info.theme_version;
  }

  if (!Array.isArray(info.settings)) return null;

  const versionSetting = info.settings.find((setting) => {
    if (typeof setting !== "object" || setting === null) return false;
    return (setting as Record<string, unknown>).id === "theme_version";
  }) as Record<string, unknown> | undefined;

  if (!versionSetting) return null;

  const value = versionSetting.default;
  return typeof value === "string" && value.length > 0 ? value : null;
}
