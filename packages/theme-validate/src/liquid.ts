const BLOCK_OPEN = new Set([
  "if",
  "unless",
  "for",
  "case",
  "capture",
  "tablerow",
  "comment",
  "form",
  "paginate",
  "style",
  "schema",
  "javascript",
  "liquid",
  "raw",
]);

const BLOCK_CLOSE = new Set([
  "endif",
  "endunless",
  "endfor",
  "endcase",
  "endcapture",
  "endtablerow",
  "endcomment",
  "endform",
  "endpaginate",
  "endstyle",
  "endschema",
  "endjavascript",
  "endliquid",
  "endraw",
]);

const INLINE_OPENERS = new Set(["else", "elsif", "when", "break", "continue"]);

const TAG_RE = /\{%\s*([^{}]*?)\s*%\}/g;

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

/**
 * Validación básica de un archivo Liquid sin depender de `liquidjs`:
 * - balanceo de tags de bloque `{% if %}...{% endif %}`
 * - balanceo de tags de salida `{{ ... }}`
 * Devuelve una lista de mensajes de error (vacía si todo está balanceado).
 */
export function validateLiquid(source: string): string[] {
  const issues: string[] = [];
  const stack: Array<{ name: string; line: number }> = [];

  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(source)) !== null) {
    const body = match[1].trim();
    const name = body.split(/\s+/)[0] ?? "";
    const line = lineOf(source, match.index);

    if (INLINE_OPENERS.has(name)) continue;

    if (name.startsWith("end") && BLOCK_CLOSE.has(name)) {
      const expected = name.slice(3);
      const top = stack.pop();
      if (!top) {
        issues.push(`End tag '${name}' sin apertura (línea ${line})`);
      } else if (top.name !== expected) {
        issues.push(
          `Cierre '${name}' (línea ${line}) no coincide con la apertura '${top.name}' (línea ${top.line})`,
        );
      }
      continue;
    }

    if (BLOCK_OPEN.has(name)) {
      stack.push({ name, line });
    }
  }

  for (const open of stack) {
    issues.push(`Tag de bloque '${open.name}' sin cerrar (línea ${open.line})`);
  }

  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    if (source.startsWith("{{", i)) {
      depth += 1;
      i += 1;
    } else if (source.startsWith("}}", i)) {
      depth -= 1;
      i += 1;
    }
    if (depth < 0) {
      issues.push("Tag de salida '}}' sin apertura");
      break;
    }
  }
  if (depth > 0) {
    issues.push("Tag de salida '{{' sin cerrar");
  }

  return issues;
}
