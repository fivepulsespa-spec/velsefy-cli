# @velsefy/cli

CLI cross-platform (Windows / macOS / Linux) de **VELSEFY** para gestionar temas de
eCommerce + POS en un entorno SaaS multi-tenant. Escrito en TypeScript sobre Node.js >= 18.

## Build & verificación

```bash
npm install
npm run typecheck   # tsc --noEmit (construye primero @velsefy/theme-validate)
npm run lint        # eslint .
npm run build       # tsc -p tsconfig.json → dist/
```

## Uso

```bash
velsefy login --token vls_tok_xxx
velsefy theme list
velsefy theme pull --install <id> -o ./theme
velsefy theme push --install <id> --dir ./theme
velsefy theme validate --dir ./theme
velsefy theme release --sku <sku> --changelog "..." --dir ./theme
velsefy logout
```

Preferencias/credenciales:

- **Token**: `~/.config/velsefy/credentials` (permisos `0600`), **nunca** en el repo ni en logs.
- **Metadatos**: `~/.config/velsefy/config.json` (solo `apiBase` y preferencias, sin secrets).
- **API base**: `https://api.velsefy.com/v1` (override con `VELSEFY_API_BASE`).
- **CI token**: `VELSEFY_TOKEN` (se lee primero y nunca se escribe a disco).

## Prefijos de token

- `vls_tok_` → token de desarrollo **por tienda**.
- `vls_dev_` → token de **plataforma**.

## TODO (documentados)

- [ ] **OAuth Device Flow (RFC 8628)** interactivo para `velsefy login`. Hoy se usa un
      PAT (`--token vls_tok_/vls_dev_`). See `src/commands/login.ts`.
- [ ] **Windows DPAPI / Credential Manager** para guardar el token (hoy Windows delega al
      archivo `0600`). See `src/lib/credentials.ts` (los shell-outs a PowerShell ya preparan
      la migración).
- [ ] **`password-store` / Keyring** en Linux/WSL (hoy `secret-tool` de libsecret).
- [ ] Resolución de **conflictos de push** visual (hoy se listan los conflictos 409 en consola).
- [ ] Migración opcional de la estructura a **oclif** (la estructura modular lo permite).
- [ ] Los endpoints del contrato (`/v1/themes`, `/v1/themes/{id}/assets`,
      `/v1/catalog/themes/{sku}/releases`) aún no están desplegados; el cliente HTTP ya
      implementa el contrato con `fetch`.

## Workspace

Este monorepo usa **npm workspaces**:

- `@velsefy/cli` — la CLI.
- `@velsefy/theme-validate` — validador de temas (Liquid balanceado, JSON, paths, semver,
  `theme_info`). Sólo depende `@velsefy/theme-validate` como paquete interno.
