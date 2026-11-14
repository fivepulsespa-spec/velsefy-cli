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
| `velsefy theme publish --install <id>` | Activa el tema instalado en la tienda | token de acceso |
| `velsefy theme preview --install <id> --session <token>` | URL de vista previa (necesita sesión de usuario) | token de acceso |
| `velsefy theme validate --dir <dir>` | Validación LOCAL (Liquid/JSON/schema/paths/semver/inicio) | No requiere |
| `velsefy theme create --sku <sku> --name "<Nombre>" [--from <baseSku>]` | Crea un tema base nuevo en el catálogo global | credenciales de plataforma |
| `velsefy theme pull-catalog --sku <sku> -o <dir>` | Descarga los assets del **catálogo global** (el base) | credenciales de plataforma |
| `velsefy theme release --sku <sku> --changelog "..." --dir <dir> --yes` | Publica una release al catálogo de temas | credenciales de plataforma |
| `velsefy theme releases --sku <sku>` | Historial de releases del tema | credenciales de plataforma |
| `velsefy theme rollback --sku <sku> --release <id>` | Vuelve a una release anterior como versión nueva | credenciales de plataforma |

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

### Publicar al catálogo global (solo plataforma)

```bash
# descargar el tema base actual (editable)
velsefy login --token <TU_TOKEN_DE_PLATAFORMA>
velsefy theme pull-catalog --sku THEME-DEFAULT -o ./mi-tema

# editar en VS Code… validar… y publicar la nueva versión
velsefy theme validate --dir ./mi-tema
velsefy theme release --sku THEME-DEFAULT --changelog "nuevo hero" --dir ./mi-tema --bump minor --yes
# → { ok: true, version: 21, version_semver: "2.8.0" }
```

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
