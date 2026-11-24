# Changelog

## [0.6.2] - 2026-11-23
### Changed
- `theme watch --open` abre el editor de tu tienda con la recarga conectada: ya no hay que copiar una sesión desde las herramientas del navegador.
- `theme preview` sin sesión imprime (y con `--open` abre) el editor de la tienda; `--session` queda solo para una URL directa del escaparate.

## [0.6.1] - 2026-11-23
### Added
- Aviso al trabajar sobre el tema publicado en vivo: `theme watch` lo muestra al arrancar y `theme push` pide confirmación en la terminal (se omite con `--yes`, `--force` o `--dry-run`).
- `theme publish` advierte que reemplaza el tema activo de la tienda.

## [0.6.0] - 2026-11-23
### Added
- `theme preview` arma la URL completa de la vista previa y acepta `--live-port` y `--open`.
- `theme watch` imprime la URL de vista previa lista (con recarga automática) al arrancar; acepta `--session` y `--open`.
### Changed
- La vista previa abre la instalación indicada (`preview_install`) aunque otra esté publicada.
- Escrituras de larga duración (release de un tema completo): el tiempo de espera pasa de 120 s a 300 s.
- `theme release` envía el tema **por lotes** a un borrador y lo publica al final: un tema de ~1 MB ya no se corta con 503.

## [0.4.0] - 2026-11-15
### Added
- Live reload en `theme watch`: canal SSE local en `127.0.0.1`; la vista previa se recarga al guardar.
  Puerto configurable con `--live-port` (1024..65535) y desactivable con `--no-live-reload`.
- El canal es estricto: solo `GET /events`, sin datos del tema y nunca accesible fuera de la máquina.

## [0.3.1] - 2026-11-15
### Changed
- Los comandos de catálogo (`create`, `release`, `releases`, `rollback`, `pull-catalog`, `catalog`)
  ya no se registran por defecto: requieren `VELSEFY_INTERNAL=1`. Un token de tienda ya no choca
  con `403` al intentar usarlos, y no aparecen en el `--help` público.
- README y guía de temas sin referencias internas al catálogo ni al tema base de la plataforma.

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
