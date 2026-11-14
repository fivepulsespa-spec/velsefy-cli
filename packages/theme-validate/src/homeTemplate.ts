import fs from "node:fs";
import path from "node:path";
import { parseJson } from "./json.js";

/**
 * Secciones que NO son contenido de inicio: son fijas de plantilla (layout,
 * búsqueda, carrito, listados) o se inyectan por área (header/footer). Si
 * aparecen en `templates/index.json` el home se rompe o se duplica.
 */
const TEMPLATE_ONLY_SECTIONS = new Set([
  "header",
  "footer",
  "main-404",
  "main-search",
  "main-collection-product-grid",
  "main-list-collections",
  "main-cart-items",
  "main-cart-footer",
  "product_main",
  "main-product",
  "related-products",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Valida la integridad de `templates/index.json` (el inicio del tema):
 *
 *  - JSON parseable y con un arreglo `sections` no vacío.
 *  - Cada sección con `type` e `id`; ids únicos.
 *  - Cada `type` debe existir como `sections/<type>.liquid`.
 *  - Rechaza secciones fijas de plantilla (header/footer/404/búsqueda/carrito...).
 *  - Si existe `order` (formato Shopify), debe cubrir exactamente los mismos ids.
 *
 * Devuelve mensajes legibles; vacío = sin problemas.
 */
export function validateHomeTemplate(themeDir: string): string[] {
  const issues: string[] = [];
  const indexPath = path.join(themeDir, "templates", "index.json");

  if (!fs.existsSync(indexPath)) {
    issues.push("Falta templates/index.json: el tema necesita un inicio.");
    return issues;
  }

  let raw: string;
  try {
    raw = fs.readFileSync(indexPath, "utf8");
  } catch {
    issues.push("No se pudo leer templates/index.json.");
    return issues;
  }

  const parsed = parseJson(raw);
  // El JSON malformado ya lo reporta validateJsonFile; aquí no duplicamos.
  if (!parsed.ok) return issues;

  if (!isPlainObject(parsed.value)) {
    issues.push("templates/index.json debe ser un objeto JSON.");
    return issues;
  }

  const sections = parsed.value.sections;
  if (!Array.isArray(sections)) {
    issues.push("templates/index.json debe tener un arreglo 'sections'.");
    return issues;
  }
  if (sections.length === 0) {
    issues.push("'sections' está vacío: el inicio no mostraría nada.");
    return issues;
  }

  const ids = new Set<string>();
  const types = new Set<string>();

  sections.forEach((section, index) => {
    if (!isPlainObject(section)) {
      issues.push(`sections[${index}] debe ser un objeto.`);
      return;
    }

    const type = section.type;
    const id = section.id;

    if (typeof type !== "string" || type.trim() === "") {
      issues.push(`sections[${index}] no tiene 'type'.`);
    } else {
      types.add(type.trim());
    }

    if (typeof id !== "string" || id.trim() === "") {
      issues.push(`sections[${index}] no tiene 'id'.`);
    } else if (ids.has(id.trim())) {
      issues.push(`id duplicado en el inicio: '${id.trim()}'.`);
    } else {
      ids.add(id.trim());
    }
  });

  for (const type of types) {
    if (TEMPLATE_ONLY_SECTIONS.has(type)) {
      issues.push(
        `'${type}' es una sección fija de plantilla y no debe ir en el inicio.`,
      );
      continue;
    }
    const file = path.join(themeDir, "sections", `${type}.liquid`);
    if (!fs.existsSync(file)) {
      issues.push(`La sección '${type}' no existe en sections/.`);
    }
  }

  const order = parsed.value.order;
  if (order !== undefined) {
    if (!Array.isArray(order) || order.some((entry) => typeof entry !== "string")) {
      issues.push("'order' debe ser un arreglo de ids.");
    } else {
      const ordered = order as string[];
      const seen = new Set<string>();
      for (const id of ordered) {
        if (seen.has(id)) issues.push(`'order' repite el id '${id}'.`);
        seen.add(id);
        if (!ids.has(id)) issues.push(`'order' referencia un id inexistente: '${id}'.`);
      }
      for (const id of ids) {
        if (!seen.has(id)) issues.push(`'order' no incluye la sección '${id}'.`);
      }
    }
  }

  return issues;
}
