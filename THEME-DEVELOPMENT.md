# 🎨 Desarrollo de Temas VELSEFY (Liquid)

Guía para crear/modificar temas de tienda VELSEFY y publicarlos en tu tienda.
Estructura fiel al estándar **Shopify Online Store 2.0**, con **versionado al estilo Shopify** en `theme_info`.

---

## 1. Estructura de un tema

```
mi-tema/
├── layout/
│   ├── theme.liquid            # Plantilla base (HTML + {{ content_for_layout }})
│   └── password.liquid         # Pantalla de tienda cerrada (opcional)
├── sections/                   # Secciones arrastrables (cada una con {% schema %})
│   ├── hero.liquid
│   └── product_main.liquid
├── snippets/                   # Fragmentos reutilizables ({% render 'x' %})
│   └── price.liquid
├── assets/                     # CSS / JS / imágenes / fuentes
│   ├── theme.css
│   └── theme.js
├── config/
│   └── settings_schema.json    # Declaración de settings; los valores los guarda la tienda
├── templates/                  # Plantillas de página (*.json)
│   ├── index.json
│   ├── product.json
│   ├── collection.json
│   ├── page.json
│   └── password.json           # Portada de tienda cerrada (opcional)
```

**Carpetas y extensiones permitidas** (lo valida el servidor):
`assets|sections|layout|snippets|config|templates` + `css|js|mjs|json|svg|png|jpg|jpeg|webp|gif|ico|woff|woff2|ttf|txt|xml|liquid`.

**Bloqueado:** `..`, `\`, `%` (path traversal).

---

## 2. Versionado del tema (estilo Shopify) — ⭐ IMPORTANTE

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

- La versión se lee de `theme_info.theme_version` (semver, única fuente en el tema).
- La versión debe ser semver válida; súbela cuando publiques cambios relevantes.
- Los archivos que borres en local se borran del servidor al hacer `theme push`.

---

## 3. `settings_schema.json` (settings globales)

Array de grupos `{ name, settings: [...] }`. El grupo `theme_info` se ignora al mostrar la tienda (solo metadata). El array contiene `theme_info` (ver §2) y tus grupos; así se ve uno de ellos:

```json
{
  "name": "Colores",
  "settings": [
    { "type": "color", "id": "page_background", "label": "Fondo de página", "default": "#ffffff" },
    { "type": "color", "id": "page_text",       "label": "Texto de página", "default": "#111111" },
    { "type": "color", "id": "surface",         "label": "Superficie",      "default": "#f7f7f5" },
    { "type": "color", "id": "border",          "label": "Borde",           "default": "#e8e8e6" },
    { "type": "color", "id": "accent",          "label": "Acento",          "default": "#1e293b" },
    { "type": "range",  "id": "fontScale",      "label": "Escala", "min": 100, "max": 130, "step": 5, "unit": "%", "default": 100 }
  ]
}
```

Tipos de `settings[].type` **soportados por VELSEFY** (subconjunto de Shopify; el validador acepta solo estos):
`color` · `color_background` · `color_scheme` · `color_scheme_group` · `range` · `number` · `select` · `radio` · `checkbox` · `text` · `textarea` · `richtext` · `inline_richtext` · `image_picker` · `url` · `video_url` · `menu` · `header` · `paragraph` · `link_list` · `collection` · `product` · `product_list` · `font_picker` · `category_list`.

> ⚠️ Si usás un tipo que no esté en esta lista, el editor de VELSEFY no muestra ese control y `velsefy theme validate` lo reportará como error. Los tipos de block (`blocks[].type`) son libres.

En el tema se leen así: `{{ settings.page_background }}`, `{{ settings.fontScale }}`. Para pintar, expón esos valores como variables CSS (sección 4).

---

## 4. Color: paleta semántica, herencia por sección y filtros

### 4.1 Paleta semántica (`--color-*`)

El tema declara los colores como variables CSS en el layout. El comerciante los edita desde el editor y toda la tienda se repinta sin recompilar:

```liquid
:root {
  --color-background: {{ settings.page_background | default: '#ffffff' }};
  --color-background-rgb: {{ settings.page_background | default: '#ffffff' | rgb_triplet }};
  --color-foreground: {{ settings.page_text | default: '#111111' }};
  --color-foreground-rgb: {{ settings.page_text | default: '#111111' | rgb_triplet }};
  --color-surface: {{ settings.surface | default: '#f7f7f5' }};
  --color-border: {{ settings.border | default: '#e8e8e6' }};
  --color-primary: {{ settings.accent | default: '#1e293b' }};
  --color-button: {{ settings.button_primary_background | default: '#111111' }};
  --color-button-text: {{ settings.button_primary_text | default: '#ffffff' }};
}
```

Variables recomendadas: `--color-background`, `--color-foreground`, `--color-surface`, `--color-border`, `--color-primary` (acento), `--color-button` / `--color-button-text`, `--color-button-secondary` / `--color-button-secondary-text`, `--color-input-background` / `--color-input-text` / `--color-input-border`, `--color-drawer-background` / `--color-drawer-text`.

Cada variable con sufijo `-rgb` guarda los canales (`15, 23, 42`) para usarla con opacidad:

```css
.borde-suave { border-color: rgba(var(--color-foreground-rgb), 0.16); }
```

No escribas `rgba(var(--color-foreground), .5)`: un hex no se puede descomponer en CSS.

> No uses `color_scheme`, `color_scheme_group` ni ids legacy tipo `primaryColor`: el modelo vigente es una paleta semántica única + overrides por sección.

### 4.2 Override opcional por sección

Una sección puede declarar su propio fondo y texto. Ambos con `default: ""` — vacío significa **usar la paleta**:

```json
{
  "type": "color", "id": "background_color", "label": "Color de Fondo", "default": "",
  "type": "color", "id": "text_color",       "label": "Color de Texto", "default": ""
}
```

```liquid
{% style %}
  #velsefy-section-{{ section.id }} .mi-seccion {
    background: var(--section-bg, var(--color-background));
    color: var(--section-fg, var(--color-foreground));
  }
{% endstyle %}
```

- Con un color elegido, la tienda agrega `--section-bg` / `--section-fg` a la sección.
- Sin color, no agrega nada y el CSS usa la paleta.
- Si `text_color` queda vacío y hay fondo propio, la tienda calcula un texto legible (contraste WCAG).
- **Nunca** escribas `var(--section-bg, {{ section.settings.background_color }})`: si fijas el valor en el CSS, la sección deja de heredar la paleta.

### 4.3 Filtros de color en Liquid

| Filtro | Qué hace | Ejemplo |
| --- | --- | --- |
| `color_to_rgb` | Color a tripleta de canales. | `{{ c \| color_to_rgb }}` → `15, 23, 42` |
| `color_brightness` | Brillo percibido, 0 a 255. | `{{ c \| color_brightness \| round }}` |
| `color_modify` | Ajusta un canal: `red/green/blue` (-255 a 255), `alpha` (0 a 1), `hue` (±360), `saturation/lightness` (±100). | `{{ c \| color_modify: 20, 'lightness' }}` |
| `color_lighten` | Aclara con blanco (0 a 100). | `{{ c \| color_lighten: 12 }}` |
| `color_darken` | Oscurece con negro (0 a 100). | `{{ c \| color_darken: 8 }}` |
| `color_mix` | Mezcla con otro color; el peso es el porcentaje del primero (0 a 100). | `{{ c \| color_mix: '#ffffff', 80 }}` |
| `color_contrast` | Ratio de contraste WCAG entre dos colores (1 a 21). | `{{ a \| color_contrast: b \| round: 1 }}` |

Si el color de entrada no es válido, el filtro devuelve el valor original (o `0` / `1` en brillo y contraste).

---

## 5. Secciones (`sections/*.liquid`) con `{% schema %}`

Cada sección declara su schema al final del archivo. **Deja y cierra `{% schema %}...{% endschema %}`** (obligatorio en secciones).

```liquid
{% style %}
  #velsefy-section-{{ section.id }} .mi-hero {
    background: var(--section-bg, var(--color-background));
    color: var(--section-fg, var(--color-foreground));
  }
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
    { "type": "color", "id": "background_color", "label": "Color de Fondo", "default": "" },
    { "type": "color", "id": "text_color",       "label": "Color de Texto", "default": "" }
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

## 6. Snippets (`snippets/*.liquid`)

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

## 7. Layout base (`layout/theme.liquid`)

```liquid
<!doctype html>
<html lang="{{ shop.locale }}">
<head>
  <meta charset="utf-8">
  <title>{{ page_title }}</title>
  {{ 'theme.css' | asset_url | stylesheet_tag }}
</head>
<body>
  {% sections 'header' %}
  {{ content_for_layout }}
  {% sections 'footer' %}
  {{ 'theme.js' | asset_url | script_tag }}
</body>
</html>
```

- `{% sections 'header' %}` renderiza **todas** las secciones guardadas en el área header, en orden.
- `{% sections 'footer' %}` hace lo mismo con el área footer.
- Alias compatibles con Dawn: `{% sections 'header-group' %}` y `{% sections 'footer-group' %}`.
- `{% section 'nombre' %}` renderiza una sección concreta (singular).

### Siembra al instalar (importante)

Cuando un comerciante instala el tema, la tienda nace con:

- `templates/index.json` → secciones del inicio.
- `sections/header-group.json` y `sections/footer-group.json` → cabecera/anuncio y pie, en formato Shopify (`sections` + `order` + `blocks` + `block_order`).
- Colores iniciales: los `default` de tus settings `type: "color"` en `config/settings_schema.json` (más `color_preset` y `borderRadius` si los declaras).

Sin esos archivos no se copian secciones ni colores de otro tema: el tema define su propia identidad.

### Pantalla de tienda cerrada

`templates/password.json` se renderiza con `layout/password.liquid` si el tema lo incluye; si no existe, se usa `layout/theme.liquid`. Sin `templates/password.json`, la tienda cerrada muestra el aviso estático del sistema.

```liquid
<!doctype html>
<html lang="{{ shop.locale }}">
<head>
  <meta charset="utf-8">
  <title>{{ page_title }}</title>
  {{ 'theme.css' | asset_url | stylesheet_tag }}
</head>
<body class="template-password">
  {{ content_for_layout }}
</body>
</html>
```

---

## 8. Plantillas de página (`templates/*.json`)

```json
{
  "sections": [
    { "id": "home-hero", "type": "hero", "area": "main", "settings": { "title": "Hola" } }
  ]
}
```

Plantillas reconocidas: `index`, `product`, `collection`, `list-collections`, `search`, `cart`, `page`, `404` y `password`.
`password` es la portada que ven los visitantes mientras la tienda está cerrada y usa `layout/password.liquid` (si existe).

---

## 9. Publicar un tema

### Contexto

- **Token de acceso de tu cuenta** → editas la **copia privada** de tu tema (pull/push).
- **`velsefy theme publish`** → activa el tema en tu tienda cuando está listo.

### Flujo de desarrollo (editar tu copia)

```bash
velsefy login --token <TU_TOKEN>
velsefy theme pull --install <installId> -o ./mi-tema
# edita en VS Code...
velsefy theme validate --dir ./mi-tema      # validación local
velsefy theme push --install <installId> --dir ./mi-tema   # sube; 409 si hay conflictos
```

### Publicar tu tema en la tienda

```bash
velsefy theme validate --dir ./mi-tema                  # validación local
velsefy theme push --install <installId> --dir ./mi-tema  # sube; 409 si hay conflictos
velsefy theme publish --install <installId>              # lo activa en la tienda
```

El servidor valida cada archivo **antes** de guardar:

- `.json` → `JSON.parse` válido.
- `.liquid` → `{% schema %}`/`{% endschema %}` balanceado (y presente en secciones).
- `.liquid` → `{% if %}`/`{% endif %}` balanceado.
- Paths permitidos + sin `..`/`\`/`%`.

Si algo falla → `400 validation_failed` con el archivo + error. Un push correcto responde `{ success, updatedAt, saved, deleted }` (HTTP 200).

---

## 10. Validación local (`velsefy theme validate`)

```bash
velsefy theme validate --dir ./mi-tema
# → "Versión del tema (theme_info): 1.0.0" + "Tema válido."
```

No requiere token (operación 100% local). Chequea: balance Liquid (`{% %}`/`{{ }}`), **tipos de `settings[].type` del `{% schema %}` contra la whitelist** (y exige `id`), JSON válido, paths, semver y extrae `theme_info.theme_version`.

> El servidor aplica la MISMA validación de tipos al subir (`theme push`) → si usás un tipo no soportado, devuelve `400 validation_failed`.

### Autocompletado / errores en VS Code (opcional)

Para que **VS Code valide `config/settings_schema.json`** inline (errores + autocompletado de tipos), agregá a tu `.vscode/settings.json` la referencia al JSON Schema del paquete:

```json
{
  "json.schemas": [
    {
      "fileMatch": ["config/settings_schema.json"],
      "url": "https://raw.githubusercontent.com/fivepulsespa-spec/velsefy-cli/main/packages/theme-validate/velsefy.settings_schema.json"
    }
  ]
}
```

(El schema está en `packages/theme-validate/velsefy.settings_schema.json` del repo.)

---

## 11. Buenas prácticas

- **Versioná semver** en `theme_info.theme_version` (nunca en otro archivo).
- **No rompas el balance** de `{% schema %}`/`{% endschema %}` y `{% if %}`/`{% endif %}` — el servidor lo rechaza.
- **Nombres de archivo** en minúsculas con guiones (`product-card.liquid`).
- **Prefija clases** con tu scope (ej. `vs-*` o `mi-*`) para no chocar con otros temas.
- **Prefijo de assets**: usa `{{ 'x.css' | asset_url }}`.
- Probá con `velsefy theme validate` antes de `publish`/`push`.

---

## 12. Referencia rápida de Liquid

- Salida: `{{ variable }}` · Lógica: `{% if %}` / `{% for %}` / `{% case %}` / `{% assign %}`.
- Incluir: `{% render 'x' %}` · `{% section 'x' %}` · `{% sections 'header' %}` (área completa).
- Formato: `{{ price | money }}` · `{{ x | escape }}`.
- Color: `{{ c | color_to_rgb }}` · `{{ c | color_lighten: 10 }}` · `{{ c | color_darken: 10 }}` · `{{ c | color_mix: '#fff', 80 }}` · `{{ a | color_contrast: b }}`.
- Assets: `{{ 'f.js' | asset_url | script_tag }}` · `{{ 'f.css' | asset_url | stylesheet_tag }}`.

---

## Verificación

```bash
cd velsefy-cli
npm install
npm run typecheck && npm run lint && npm run build
velsefy theme validate --dir examples/default-theme   # ejemplo incluido
```
