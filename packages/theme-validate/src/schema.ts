// Tipos de `settings[].type` de un `{% schema %}` que VELSEFY renderiza/soporta.
// Es el conjunto que el EDITOR (liquidSchemaMapper) y el renderer manejan — NO el
// listado completo de Shopify, pero sí los tipos reales que la plataforma acepta.
// Extensible: si se agregan tipos al render, se amplía este conjunto.
export const SUPPORTED_SETTING_TYPES = new Set([
  "color", "color_background", "color_scheme", "color_scheme_group",
  "range", "number", "select", "radio", "checkbox", "text", "textarea",
  "richtext", "inline_richtext", "image_picker", "url", "video_url",
  "menu", "header", "paragraph", "link_list", "collection", "product",
  "product_list", "font_picker", "category_list",
]);

const SETTING_TYPES_LABEL = [...SUPPORTED_SETTING_TYPES].join(", ");

export interface SchemaIssue {
  path: string;
  message: string;
}

/** Extrae y parsea el cuerpo del primer `{% schema %}...{% endschema %}`. */
function extractSchemaJson(source: string): { json: Record<string, unknown> | null } | { error: string } {
  const start = source.indexOf("{% schema %}");
  if (start === -1) return { json: null };
  const end = source.indexOf("{% endschema %}", start);
  if (end === -1) return { error: "Falta {% endschema %}" };
  const body = source.slice(start + "{% schema %}".length, end);
  try {
    return { json: JSON.parse(body) as Record<string, unknown> };
  } catch {
    return { error: "El bloque {% schema %} no es JSON válido" };
  }
}

/** Tipos ESTRUCTURALES (no-editables, sin `id`): solo etiqueta de grupo. */
const STRUCTURAL_TYPES = new Set(["header", "paragraph"]);

/** Valida `settings[].type` contra la whitelist + exige `id` (salvo estructurales). */
function validateSettings(settings: unknown, basePath: string, issues: SchemaIssue[]): void {
  if (!Array.isArray(settings)) return;
  settings.forEach((s, i) => {
    if (typeof s !== "object" || s === null) {
      issues.push({ path: `${basePath}[${i}]`, message: "setting debe ser un objeto" });
      return;
    }
    const setting = s as Record<string, unknown>;
    const type = typeof setting.type === "string" ? setting.type : "";
    if (!type) {
      issues.push({ path: `${basePath}[${i}]`, message: "Falta 'type' en el setting" });
    } else if (!SUPPORTED_SETTING_TYPES.has(type)) {
      issues.push({
        path: `${basePath}[${i}].type`,
        message: `'${type}' no es un tipo de setting permitido. Valores: ${SETTING_TYPES_LABEL}`,
      });
    }
    // Los tipos estructurales (header/paragraph) no llevan id.
    if (STRUCTURAL_TYPES.has(type)) return;
    const id = setting.id;
    if (typeof id !== "string" || id.trim() === "") {
      issues.push({ path: `${basePath}[${i}]`, message: "Falta 'id' en el setting" });
    }
  });
}

/**
 * Valida el bloque `{% schema %}` de una sección:
 * - Settings y settings de bloques: `settings[].type` contra la whitelist + exige `id`.
 * - Los `blocks[].type` son libres (nombres propios de la sección), no se validan.
 */
export function validateSectionSchema(source: string): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const extracted = extractSchemaJson(source);
  if ("error" in extracted) return [{ path: "schema", message: extracted.error }];
  const json = extracted.json;
  if (!json) return issues;

  validateSettings(json.settings, "settings", issues);

  if (Array.isArray(json.blocks)) {
    json.blocks.forEach((b, i) => {
      if (typeof b !== "object" || b === null) return;
      const block = b as Record<string, unknown>;
      validateSettings(block.settings, `blocks[${i}].settings`, issues);
    });
  }

  return issues;
}
