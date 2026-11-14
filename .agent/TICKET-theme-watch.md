# TICKET: `velsefy theme watch`

**Estado:** listo para implementar · **Repo:** `velsefy-cli` · **No publicar en npm**

---

## Objetivo

Agregar `velsefy theme watch` para que un developer vea sus cambios en la tienda sin
ejecutar `theme push` a mano: al guardar un archivo del tema, se sube solo.

```bash
velsefy theme watch --install <installId> --dir ./mi-tema
```

---

## Contrato del comando

| Flag | Obligatorio | Comportamiento |
|---|---|---|
| `--install <id>` | sí | Instalación destino (mismo id que `push`). |
| `--dir <dir>` | no (`./theme-local`) | Carpeta del tema local. |
| `--debounce <ms>` | no (`400`) | Espera tras el último cambio antes de subir. |
| `--only <paths...>` | no | Vigila/sube solo esos paths o carpetas. |
| `--skip-validate` | no | No valida el tema antes del primer envío. |
| `--dry-run` | no | Imprime el plan (archivos a subir/borrar) sin llamar a la API. |

Comportamiento base:

1. Si no existe `.velsefy-state.json` y no se pasó `--force`, **falla** con el mismo
   mensaje que `push`: "Falta la base de sincronización (.velsefy-state.json). Haz
   `theme pull` primero o usa --force."
2. Corre `validate(dir)` una vez al arrancar (salvo `--skip-validate`). Si el tema no
   es válido, muestra los problemas y **no** se queda vigilando.
3. Arranca mostrando: `Vigilando ./mi-tema (install <id>). Ctrl+C para salir.`
4. Cada ráfaga de cambios termina en **un** `pushThemeAssets` (no uno por archivo).
5. `.velsefy-state.json` se actualiza después de cada push exitoso, igual que `push`.

---

## Regla inquebrantable: el watcher no puede verse a sí mismo

El push escribe `.velsefy-state.json` en la raíz del tema. Si el watcher reacciona a esa
escritura, entra en un bucle infinito de subidas. Se resuelve con **tres capas**, todas
obligatorias (una lista negra sola es frágil):

1. **Observar solo las carpetas del tema**, nunca la raíz:
   `assets/`, `sections/`, `layout/`, `snippets/`, `config/`, `templates/`.
   El estado vive en la raíz, así que queda fuera por diseño.
2. **Filtro de entradas**: se ignoran dotfiles/dotfolders (`.git`, `.vscode`, `.DS_Store`,
   `.velsefy-state.json`), `node_modules`, symlinks, y temporales de editor
   (`*.tmp`, `*.swp`, `*~`, `4913`, `~$*`).
3. **No-op por hash**: antes de subir se comparan los hashes con el estado. Si nada
   cambió, no se llama a la API y se registra `Sin cambios.` Esto corta cualquier
   cascada residual (por ejemplo, un editor que reescribe el archivo sin cambios).

Además: un archivo con extensión no permitida (`.bmp`, `.psd`, …) se **ignora con aviso**,
no se intenta subir (el servidor lo rechazaría y cortaría el watch).

---

## Reutilización obligatoria (no duplicar lógica)

Usar lo que ya existe en `src/commands/theme.ts` / `src/lib/`:

- `readAssetsFromDir(dir, only)` → assets + hashes.
- `readState` / `writeState` → `.velsefy-state.json`.
- `matchesOnly(relative, only)`.
- `pushThemeAssets(token, installId, assets, { baseUpdatedAt, deletedPaths, force })`.
- `validate(dir)`.

Extraer lo que hoy está dentro del comando `push` a helpers reutilizables si hace falta,
**sin cambiar el comportamiento de `push`**.

Sugerencia de estructura (no obligatoria):

- `src/lib/watchPlan.ts` — función **pura** que, dados `state.files`, `hashes` y `only`,
  devuelve `{ changed: string[]; deleted: string[] }`. Sin I/O, testeable.
- `src/commands/watch.ts` — comando + watcher (`fs.watch` recursivo de Node).

---

## Manejo de eventos

- **Ráfaga:** agrupar por debounce; un solo push por ráfaga.
- **Push exitoso:** `↑ N archivo(s) subido(s)` y, si hubo bajas, `− N archivo(s) eliminado(s)`.
- **409 (conflicto):** detener el watch, mostrar los paths en conflicto y pedir
  `velsefy theme pull`. Nunca reintentar con `--force` automáticamente. Exit code 1.
- **Error de red:** un reintento; si vuelve a fallar, avisar y seguir vigilando (no perder
  el estado ni salir).
- **Ctrl+C:** si hay cambios pendientes, hacer el último push, escribir estado y salir con
  código 0. Sin ruido de stack trace.
- **`--dry-run`:** imprime `[dry-run] ↑ / −` por ráfaga y no toca la API ni el estado.

---

## Prohibiciones

- No agregar dependencias (`chokidar`, `nodemon`, etc.). Solo `node:fs`, `node:path`.
- No usar `as any`.
- No tocar la base de datos, Supabase, ni desplegar nada.
- No cambiar versiones de paquetes ni publicar en npm.
- No modificar otros repos.
- No introducir polling (`setInterval` para detectar cambios).
- No commitear: dejar los cambios en el working tree para revisión.

---

## Verificación obligatoria (el agente debe ejecutar y pegar la salida)

```bash
npm run build
npm run typecheck
npm run lint
```

Y pruebas del plan puro con `node:test` (script `test` en `package.json`,
`node --test dist`), cubriendo:

1. Sin cambios → `{ changed: [], deleted: [] }`.
2. Un archivo modificado → `changed` lo incluye.
3. Un archivo borrado → `deleted` lo incluye.
4. Archivo nuevo → `changed` lo incluye.
5. `--only assets/` → ignora cambios en `sections/`.

Pruebas manuales con una carpeta de prueba (usar el starter de `theme init` y un
`--dry-run`, que no necesita credenciales):

```bash
node dist/bin/velsefy.js theme init /tmp/w
node dist/bin/velsefy.js theme watch --install <id> --dir /tmp/w --dry-run
```

---

## Criterios de aceptación

1. Guardar un archivo sin modificar su contenido → `Sin cambios.` y **0** peticiones.
2. Tres guardados en menos de 400 ms → **1** push.
3. Borrar un archivo → el push incluye esa ruta en las bajas.
4. Crear `theme.json` en la raíz o `assets/foto.psd` → se ignora con aviso, el watch sigue.
5. `--install` inexistente o sin estado → mensaje claro, sin quedarse vigilando.
6. 409 → se detiene, explica y sale con código 1.
7. `Ctrl+C` → sube lo pendiente y sale con código 0.
8. `tsc 0`, `eslint 0`, `build 0`, tests en verde; `theme --help` lista `watch`.

---

## Entrega

- Diff en el working tree (sin commit).
- Resumen de: archivos tocados, decisiones, y salida de los checks.
- Si algo del contrato no se puede cumplir, **detenerse y reportarlo** en vez de inventar.
