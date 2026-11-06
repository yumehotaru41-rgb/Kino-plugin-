# Kino Plugin — Capibara Traductor

Plugin de [Kino](https://kinotvapp.github.io/kino-plugins/) para [CapibaraTraductor](https://capibaratraductor.com/), el hub de scans en español.

- **Autor**: Hotaru Yume (`hotaruyume`)
- **Versión**: 1.0.0
- **apiVersion**: 6

## Qué incluye

- **Inicio**
  - Últimos **videomangas** (YouTube) — visibles también en el Inicio general de Kino
  - Mangas destacados y tendencias
  - Mangas recientes
  - **Novelas** en fila aparte
  - Obras de scans populares
- **Búsqueda** por título (mangas, novelas y, si hay pocos resultados, vídeos)
- **Capítulos** de mangas/novelas (joint y manga-custom)
- **Resolución**
  - Vídeos → YouTube
  - Capítulos → páginas de imagen cuando la API las expone; si no, enlace a Capibara

## Instalación

En Kino: **Ajustes → Plugins → +** e introduce el repositorio (`owner/repo`) o la URL del `kino-plugin.json`.

Requiere hosts aprobados: `capibaratraductor.com`, `r2.capibaratraductor.com` y dominios de YouTube/miniaturas.

## Publicar

1. Crea un repositorio público en GitHub.
2. Sube `kino-plugin.json`, `plugin.js`, `icon.png` y este `README.md`.
3. Añade el topic **`kino-plugin`**.
4. En Kino instala con `tu-usuario/tu-repo`.

## Nota

El plugin solo consume las APIs públicas de CapibaraTraductor; no aloja ni redistribuye contenido. Respeta los términos del sitio y de los scans. Algunas páginas de capítulo usan cifrado de imagen en el cliente web; en esos casos el plugin ofrece el enlace a la web.

## Cambios

### 1.0.0

- Primera versión: home con filas separadas (vídeos / mangas / novelas), search, browse, episodes y resolve.
