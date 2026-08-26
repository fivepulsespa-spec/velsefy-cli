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

1. Una cuenta en VELSEFY (merchant **o** plataforma).
2. Un **token de acceso** (`vls_pat_`/`vls_tok_`/`vls_dev_`), que emites desde el panel **Aplicaciones Privadas** (merchant) o vía `generate-platform-token` (plataforma).

---

## Tipos de token (3)

| Prefijo | Qué es | Emisión |
|---|---|---|
| `vls_pat_` | **Personal del merchant** (CLI/API de su tienda) | Panel POS → **Aplicaciones Privadas** |
| `vls_tok_` | **App de terceros** (OAuth, futuro App Store) | Flujo OAuth |
| `vls_dev_` | **Plataforma/desarrollador** (publicar catálogo) | `generate-platform-token` (superadmin) |

---

## Comandos

| Comando | Qué hace | Token |
|---|---|---|
| `velsefy login --token <pat>` | Guarda el token (almacén seguro del SO) | — |
| `velsefy logout` | Elimina el token guardado | — |
| `velsefy theme list` | Lista los temas instalados de tu tienda | `vls_pat_`/`vls_tok_` |
| `velsefy theme pull --install <id> -o <dir>` | Descarga los assets a una carpeta local | `vls_pat_`/`vls_tok_` |
| `velsefy theme push --install <id> --dir <dir>` | Sube los assets (con detección de 409/ETag) | `vls_pat_`/`vls_tok_` |
| `velsefy theme validate --dir <dir>` | Validación LOCAL (Liquid/JSON/paths/semver) | No requiere |
| `velsefy theme release --sku <sku> --changelog "..." --dir <dir>` | Publica una release al catálogo (Modelo B) | `vls_dev_` |

---

## Uso rápido

```bash
# login con un token de merchant (Modelo A: su copia privada)
velsefy login --token vls_pat_xxxxxxxx

# listar instalaciones de la tienda
velsefy theme list

# descargar un tema a disco
velsefy theme pull --install 70c83dac-... -o ./mi-tema

# editar en VS Code… luego validar localmente (no requiere token)
velsefy theme validate --dir ./mi-tema

# subir los cambios (409 si hubo conflicto en otro lado)
velsefy theme push --install 70c83dac-... --dir ./mi-tema
```

### Publicar al catálogo global (plataforma / Modelo B)

```bash
velsefy login --token vls_dev_xxxxxxxx
velsefy theme release --sku THEME-DEFAULT --changelog "[minor] nuevo hero" --dir ./mi-tema
# → { ok: true, version: 1, version_semver: "1.1.0" }
```

---

## Almacenamiento de credenciales (seguro por SO)

| SO | Vía |
|---|---|
| macOS | Keychain (`security`) |
| Linux | libsecret (`secret-tool`), fallback a archivo `0600` |
| Windows | archivo `0600` (DPAPI/Credential Manager en roadmap) |
| CI | `VELSEFY_TOKEN` (se lee primero, **nunca** se escribe a disco) |

- **Nunca** se guarda el token en el repo ni en logs.
- `~/.config/velsefy/config.json` → solo metadatos (`apiBase`, preferencias), sin secrets.
- API base: `https://api.velsefy.com/v1` (override con `VELSEFY_API_BASE`).

---

## Seguridad

- El cliente **no contiene secretos**; es un "cartero". La seguridad vive en el servidor
  (validación de token + RLS + rate-limit).
- Los tokens se revocan en el panel / `revoke-personal-token` / `revoke-platform-token`.
- El push con `baseUpdatedAt` detecta conflictos (HTTP 409) para no pisar cambios remotos.

---

## Workspace

Monorepo con **npm workspaces**:

- `@velsefy/cli` — la CLI.
- `@velsefy/theme-validate` — validador de temas (Liquid balanceado, JSON, paths, semver, `theme_info`).

---

## TODO (`velsefy theme dev` y mejoras)

- [ ] OAuth Device Flow (RFC 8628) interactivo para `velsefy login` (hoy PAT).
- [ ] Windows DPAPI / Credential Manager.
- [ ] `velsefy theme dev` (watch + hot reload) y `velsefy theme check` (linter / Theme Check).
- [ ] Resolución visual de conflictos push.

Ver también [`THEME-DEVELOPMENT.md`](./THEME-DEVELOPMENT.md).
