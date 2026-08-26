# Changelog

## [0.1.0] - 2026-08-25
### Added
- CLI `velsefy` cross-platform (Windows/macOS/Linux) en TypeScript/Node >= 18.
- Comandos: `login`, `logout`, `theme list`, `theme pull`, `theme push` (con 409/ETag),
  `theme validate` (local), `theme release` (catálogo/plataforma).
- Soporte de tokens de acceso personales y de plataforma (validación server-side).
- Almacenamiento seguro de credenciales por SO (Keychain / libsecret / archivo 0600) + `VELSEFY_TOKEN` (CI).
- Paquete compartido `@velsefy/theme-validate` (Liquid balanceado, JSON, paths, semver, `theme_info`).
