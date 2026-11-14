// Antes de publicar el CLI se comprueba que sus dependencias internas ya estén
// publicadas en npm. Sin esto se puede publicar un CLI que importa funciones
// que la versión publicada del validador todavía no tiene (pasó con 0.2.0:
// el paquete se instalaba y fallaba con "does not provide an export named").
import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const internal = Object.entries(pkg.dependencies ?? {}).filter(([name]) => name.startsWith("@velsefy/"));
const errors = [];

for (const [name, version] of internal) {
  const url = `https://registry.npmjs.org/${name.replace("/", "%2F")}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      errors.push(`${name}: no se pudo consultar el registro (${res.status}).`);
      continue;
    }
    const data = await res.json();
    if (!data.versions?.[version]) {
      const latest = data["dist-tags"]?.latest ?? "ninguna";
      errors.push(`${name}@${version} no está publicado (última: ${latest}).`);
      continue;
    }
    console.log(`ok ${name}@${version}`);
  } catch (err) {
    errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

if (errors.length > 0) {
  console.error("\nNo se puede publicar este paquete todavía:");
  for (const error of errors) console.error(`  - ${error}`);
  console.error("\nPublica primero los paquetes del workspace (npm publish) y reintenta.\n");
  process.exit(1);
}
