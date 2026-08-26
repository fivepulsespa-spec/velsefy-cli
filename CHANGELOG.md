# Changelog

## [0.1.0] - 2026-08-25
### Added
- CLI `velsefy` cross-platform (Windows/macOS/Linux) en TypeScript/Node >= 18.
- Comandos: `login`, `logout`, `theme list`, `theme pull`, `theme push` (con 409/ETag),
  `theme validate` (local), `theme release` (catálogo/plataforma).
- Soporte de tokens de acceso personales y de plataforma (validación server-side).
- Almacenamiento seguro de credenciales por SO (Keychain / libsecret / archivo 0600) + `VELSEFY_TOKEN` (CI).
- Paquete compartido `@velsefy/theme-validate` (Liquid balanceado, JSON, paths, semver, `theme_info`).
- **Validación de tipos** de `settings[].type` del `{% schema %}` (whitelist de VELSEFY) en `theme validate` y server-side (release) → reporta "tipo no permitido. Valores: ...".
- **JSON Schema** (`velsefy.settings_schema.json`) para que VS Code valide `config/settings_schema.json` inline.
- Comando `velsefy theme pull-catalog --sku` (descarga el catálogo global/base).
