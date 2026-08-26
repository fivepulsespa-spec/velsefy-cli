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
| `velsefy theme list` | Lista los temas instalados de tu tienda | token de acceso |
| `velsefy theme pull --install <id> -o <dir>` | Descarga los assets a una carpeta local | token de acceso |
| `velsefy theme push --install <id> --dir <dir>` | Sube los assets (con detección de 409/ETag) | token de acceso |
| `velsefy theme validate --dir <dir>` | Validación LOCAL (Liquid/JSON/paths/semver) | No requiere |
| `velsefy theme release --sku <sku> --changelog "..." --dir <dir>` | Publica una release al catálogo de temas | credenciales de plataforma |

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
```

### Publicar al catálogo global (solo plataforma)

```bash
velsefy login --token <TU_TOKEN_DE_PLATAFORMA>
velsefy theme release --sku THEME-DEFAULT --changelog "[minor] nuevo hero" --dir ./mi-tema
# → { ok: true, version: 1 }
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
