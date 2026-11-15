# @velsefy/cli

CLI **cross-platform (Windows / macOS / Linux)** de VELSEFY para gestionar temas de
eCommerce + POS en un entorno SaaS multi-tenant. Escrito en TypeScript sobre **Node.js >= 18**.

**Empezar**: [`THEME-DEVELOPMENT.md`](./THEME-DEVELOPMENT.md) (guía para crear/modificar/publicar temas).

---

## Instalación

### Desde npm (recomendado para agencias/devs)

```bash
npm install -g @velsefy/cli
velsefy --version
```

### Desde el repo (desarrollo)

```bash
git clone https://github.com/fivepulsespa-spec/velsefy-cli.git
cd velsefy-cli
npm install
npm run build
node dist/bin/velsefy.js --help
```

> Requisito: **Node.js >= 18** (usa `fetch` nativo).

---

## Requisitos previos

1. Una cuenta en VELSEFY.
2. Un **token de acceso**, que generas desde tu cuenta (panel de tu tienda).
   Para **publicar un tema al catálogo global** necesitas credenciales de plataforma
   con permiso de publicación.

---

## Comandos

| Comando | Qué hace | Token |
|---|---|---|
| `velsefy login --token <token>` | Guarda el token (almacén seguro del SO) | — |
| `velsefy logout` | Elimina el token guardado | — |
| `velsefy theme init [dir]` | Crea un tema local desde el starter oficial (ya válido) | — |
| `velsefy theme list [--json]` | Lista los temas instalados de tu tienda | token de acceso |
| `velsefy theme install --sku <sku>` | Instala un tema del catálogo en tu tienda | token de acceso |
| `velsefy theme pull --install <id> -o <dir>` | Descarga los assets de un tema instalado | token de acceso |
| `velsefy theme push --install <id> --dir <dir>` | Sube cambios y borra en el servidor lo que eliminaste local (409 si hay conflicto) | token de acceso |
| `velsefy theme watch --install <id> --dir <dir>` | Vigila la carpeta y sube los cambios al guardar | token de acceso |
| `velsefy theme publish --install <id>` | Activa el tema instalado en la tienda | token de acceso |
| `velsefy theme preview --install <id> --session <token>` | URL de vista previa (necesita sesión de usuario) | token de acceso |
| `velsefy theme validate --dir <dir>` | Validación LOCAL (Liquid/JSON/schema/paths/semver/inicio) | No requiere |

> Los comandos de catálogo (`create`, `release`, `releases`, `rollback`, `pull-catalog`) son de plataforma y solo se registran con `VELSEFY_INTERNAL=1`. Con un token de tienda no aparecen ni funcionan.

---

## Uso rápido

```bash
# login con un token de tu cuenta (editas la copia privada de tu tema)
velsefy login --token <TU_TOKEN>

# listar las instalaciones de tu tienda
velsefy theme list

# descargar un tema a disco
velsefy theme pull --install <installId> -o ./mi-tema

# editar en VS Code… luego validar localmente (no requiere token)
velsefy theme validate --dir ./mi-tema

# subir los cambios (409 si hubo conflicto en otro lado)
velsefy theme push --install <installId> --dir ./mi-tema

# verlo sin activarlo, y activarlo cuando esté listo
velsefy theme preview --install <installId> --session <sessionToken>
velsefy theme publish --install <installId>
```

Los borrados viajan con el push: si eliminas un archivo en local, deja de existir en la
instalación. Sin cambios reales el push no hace peticiones.

Para no repetir el push a mano mientras diseñas:

```bash
velsefy theme watch --install <installId> --dir ./mi-tema
# → "Vigilando ./mi-tema (install <installId>). Ctrl+C para salir."
```

Sube una sola vez por ráfaga de guardados, nunca sube algo que no cambió y cierra con
`Ctrl+C` subiendo lo pendiente. `--dry-run` muestra el plan sin tocar la tienda.

---

## Almacenamiento de credenciales (seguro por SO)

| SO | Vía |
|---|---|
| macOS | Keychain (`security`) |
| Linux | libsecret (`secret-tool`), fallback a archivo `0600` |
| Windows | archivo `0600` |
| CI | `VELSEFY_TOKEN` (se lee primero, **nunca** se escribe a disco) |

- **Nunca** se guarda el token en el repo ni en logs.
- `~/.config/velsefy/config.json` → solo metadatos (`apiBase`, preferencias).
- API base: `https://api.velsefy.com/v1` (override con `VELSEFY_API_BASE`).

---

## Seguridad

- La validación de autenticación la hace **el servidor**. El cliente solo transpota el token.
- Los tokens se revocan desde tu cuenta VELSEFY.
- El push con `baseUpdatedAt` detecta conflictos (HTTP 409) para no pisar cambios remotos.

---

## Workspace

Monorepo con **npm workspaces**:

- `@velsefy/cli` — la CLI.
- `@velsefy/theme-validate` — validador de temas (Liquid balanceado, JSON, paths, semver, `theme_info`).

---

## TODO (`velsefy theme dev` y mejoras)

- [ ] OAuth Device Flow (RFC 8628) interactivo para `velsefy login`.
- [ ] Windows DPAPI / Credential Manager.
- [ ] `velsefy theme dev` (watch + hot reload) y `velsefy theme check` (linter).
- [ ] Resolución visual de conflictos push.

Ver también [`THEME-DEVELOPMENT.md`](./THEME-DEVELOPMENT.md).
