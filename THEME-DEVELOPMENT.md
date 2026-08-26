# 🎨 Desarrollo de Temas VELSEFY (Liquid)

Guía para crear/modificar temas de tienda VELSEFY y publicarlos con `velsefy theme release`.
Estructura fiel al estándar **Shopify Online Store 2.0**, con **versionado Shopify-pura** en `theme_info`.

---

## 1. Estructura de un tema

```
mi-tema/
├── layout/
│   └── theme.liquid            # Plantilla base (HTML + {{ content_for_layout }})
├── sections/                   # Secciones arrastrables (cada una con {% schema %})
│   ├── hero.liquid
│   └── product_main.liquid
├── snippets/                   # Fragmentos reutilizables ({% render 'x' %})
│   └── price.liquid
├── assets/                     # CSS / JS / imágenes / fuentes
│   ├── theme.css
│   └── theme.js
├── config/
│   ├── settings_schema.json    # Declaración de settings globales (array de grupos)
│   └── settings_data.json      # Valores actuales (en VELSEFY → custom_config/theme_config)
├── templates/                  # Plantillas de página (*.json)
│   ├── index.json
│   ├── product.json
│   ├── collection.json
│   └── page.json
└── theme.json                  # (solo al exportar; wrapper VELSEFY con name/version)
```

**Carpetas y extensiones permitidas** (lo valida el servidor):
`assets|sections|layout|snippets|config|templates` + `css|js|mjs|json|svg|png|jpg|jpeg|webp|gif|ico|woff|woff2|ttf|txt|xml|liquid`.

**Bloqueado:** `..`, `\`, `%` (path traversal).

---

## 2. Versionado del tema (Shopify-pura) — ⭐ IMPORTANTE

La versión semver (`MAJOR.MINOR.PATCH`) vive **SOLO** en `config/settings_schema.json`, dentro del grupo `theme_info`:

```json
[
  {
    "name": "theme_info",
    "theme_name": "Mi Tema",
    "theme_version": "1.0.0",
    "theme_author": "Mi Agencia",
    "theme_documentation_url": "https://docs.velsefy.com",
    "theme_support_url": "https://support.velsefy.com"
  },
  { "name": "Colores", "settings": [ /* ... */ ] }
]
```

- **No existe** `config/theme_manifest.json` (se eliminó). La versión se lee de `theme_info.theme_version`.
- El **release registry** (`theme_releases.version` + `catalog.version_semver`) es la fuente de verdad operativa (qué "actualización disponible" se compara).
- Al publicar con `velsefy theme release`, el servidor **bump** la versión (`patch` por defecto; `[major]`/`[minor]` en el changelog para subir major/minor).

---

## 3. `settings_schema.json` (settings globales)

Array de grupos `{ name, settings: [...] }`. El grupo `theme_info` se descarta al renderizar (solo metadata).

```json
{
  "name": "Colores",
  "settings": [
    { "type": "color",   "id": "primaryColor", "label": "Color Principal", "default": "#000000" },
    { "type": "range",   "id": "fontScale",    "label": "Escala", "min": 100, "max": 130, "step": 5, "unit": "%", "default": 100 },
    { "type": "select",  "id": "fontFamily",   "label": "Fuente", "options": [{ "value": "Inter", "label": "Inter" }], "default": "Inter" },
    { "type": "checkbox", "id": "enableX",     "label": "Habilitar X", "default": false },
    { "type": "number",  "id": "maxItems",     "label": "Máx", "min": 1, "max": 24, "default": 8 }
  ]
}
```

Tipos soportados: `color` · `range` · `number` · `select` · `text` · `textarea` · `checkbox` · `image_picker`.

En el tema se leen así: `{{ settings.primaryColor }}`, `{{ settings.fontScale }}`.

---

## 4. Secciones (`sections/*.liquid`) con `{% schema %}`

Cada sección declara su schema al final del archivo. **Deja y cierra `{% schema %}...{% endschema %}`** (obligatorio en secciones).

```liquid
{% style %}
  #velsefy-section-{{ section.id }} .mi-hero { color: {{ section.settings.text_color }}; }
{% endstyle %}

<div class="mi-hero">
  <h1>{{ section.settings.title }}</h1>
  {% for block in section.blocks %}
    <p>{{ block.settings.text }}</p>
  {% endfor %}
</div>

{% schema %}
{
  "name": "Hero",
  "tag": "section",
  "settings": [
    { "type": "text", "id": "title", "label": "Título", "default": "Bienvenido" },
    { "type": "color", "id": "text_color", "label": "Color", "default": "#111827" }
  ],
  "blocks": [
    { "type": "text", "name": "Texto", "settings": [ { "type": "textarea", "id": "text", "label": "Texto" } ] }
  ],
  "presets": [ { "name": "Hero", "blocks": [ { "type": "text" } ] } ]
}
{% endschema %}
```

- `settings` → accesibles como `{{ section.settings.x }}`.
- `blocks` → `{% for block in section.blocks %}` → `{{ block.settings.x }}`.
- `presets` → cómo aparece al agregar la sección en el editor.
- `max_blocks` → limita la cantidad de bloques.

---

## 5. Snippets (`snippets/*.liquid`)

Reutilizables vía `{% render 'nombre', parametros: valor %}`:

```liquid
{%- if price != blank -%}
  <span class="vs-price">{{ price | money }}</span>
{%- endif -%}
```

```
{% render 'price', price: product.price, compare_at: product.compare_price %}
```

---

## 6. Layout base (`layout/theme.liquid`)

```liquid
<!doctype html>
<html lang="{{ shop.locale }}">
<head>
  <meta charset="utf-8">
  <title>{{ page_title }}</title>
  {{ 'theme.css' | asset_url | stylesheet_tag }}
</head>
<body>
  {% section 'header' %}
  {{ content_for_layout }}
  {% section 'footer' %}
  {{ 'theme.js' | asset_url | script_tag }}
</body>
</html>
```

---

## 7. Plantillas de página (`templates/*.json`)

```json
{
  "sections": [
    { "id": "home-hero", "type": "hero", "area": "main", "settings": { "title": "Hola" } }
  ]
}
```

---

## 8. Publicar un tema

### Contexto (2 tipos de token)

| Token | Modelo | Uso |
|---|---|---|
| `vls_pat_` | A (per-tienda) | Pull/push de la **copia privada** del merchant. |
| `vls_dev_` | B (plataforma) | Publicar al **catálogo global** (`themes:publish`) — solo superadmin/plataforma. |

### Flujo de desarrollo (merchant → su copia)

```bash
velsefy login --token vls_pat_...
velsefy theme pull --install <installId> -o ./mi-tema
# edita en VS Code...
velsefy theme validate --dir ./mi-tema      # validación local
velsefy theme push --install <installId> --dir ./mi-tema   # sube; 409 si hay conflictos
```

### Flujo de publicación al catálogo (plataforma)

```bash
velsefy login --token vls_dev_...
velsefy theme release --sku THEME-DEFAULT --changelog "v2: nuevo hero" --dir ./mi-tema
```

El servidor valida cada archivo **antes** de guardar:

- `.json` → `JSON.parse` válido.
- `.liquid` → `{% schema %}`/`{% endschema %}` balanceado (y presente en secciones).
- `.liquid` → `{% if %}`/`{% endif %}` balanceado.
- Paths permitidos + sin `..`/`\`/`%`.

Si algo falla → `400 validation_failed` con el archivo + error. **Devuelve `{ ok, version, version_semver }` en 201.**

---

## 9. Validación local (`velsefy theme validate`)

```bash
velsefy theme validate --dir ./mi-tema
# → "Versión del tema (theme_info): 1.0.0" + "Tema válido."
```

No requiere token (operación 100% local). Chequea: balance Liquid (`{% %}`/`{{ }}`), JSON válido, paths, semver y extrae `theme_info.theme_version`.

---

## 10. Buenas prácticas

- **Versioná semver** en `theme_info.theme_version` (nunca en otro archivo).
- **No rompas el balance** de `{% schema %}`/`{% endschema %}` y `{% if %}`/`{% endif %}` — el servidor lo rechaza.
- **Nombres de archivo** en minúsculas con guiones (`product-card.liquid`).
- **Prefija clases** con tu scope (ej. `vs-*` o `mi-*`) para no chocar con otros temas.
- **Prefijo de assets**: usa `{{ 'x.css' | asset_url }}`.
- Probá con `velsefy theme validate` antes de `release`/`push`.

---

## 11. Referencia rápida de Liquid

- Salida: `{{ variable }}` · Lógica: `{% if %}` / `{% for %}` / `{% case %}` / `{% assign %}`.
- Incluir: `{% render 'x' %}` · `{% section 'x' %}`.
- Formato: `{{ price | money }}` · `{{ x | escape }}`.
- Assets: `{{ 'f.js' | asset_url | script_tag }}` · `{{ 'f.css' | asset_url | stylesheet_tag }}`.

---

## Verificación

```bash
cd velsefy-cli
npm install
npm run typecheck && npm run lint && npm run build
velsefy theme validate --dir examples/default-theme   # ejemplo incluido
```
