# Kino Plugin — Capibara Traductor

Plugin de [Kino](https://kinotvapp.github.io/kino-plugins/) para [CapibaraTraductor](https://capibaratraductor.com/).

- **Autor**: Hotaru Yume (`hotaruyume`)
- **Versión**: 2.0.0
- **apiVersion**: 14 (Kino 0.9.74+)

## Qué hace (camino completo)

| Tipo | Inicio / búsqueda | Lectura / play |
|------|-------------------|----------------|
| **Videomangas** | Fila propia en Inicio | Resolve → YouTube (el player de Kino puede no aceptar HTML; se listan igual) |
| **Mangas** | Filas destacados / tendencias / recientes | **Pantalla Capibara**: lista de capítulos → páginas **descifradas** (tira vertical) |
| **Novelas** | Fila aparte | Listado; el cuerpo de texto de capítulo sigue dependiendo de la API de writings |

### Lector de manga

1. Menú de Kino → **Capibara** (pantalla del plugin), o Inicio de Kino para el catálogo.
2. Elige una obra → capítulos → toca un capítulo.
3. El plugin pide `/api/.../pages`, aplica el descifrado del cliente de Capibara (`ls` + token de la home + `ph`) y muestra las imágenes reales de `r2.capibaratraductor.com`.

## Instalación

Ajustes → Plugins → `owner/repo` o la URL del `kino-plugin.json`.  
Aprueba hosts: `capibaratraductor.com`, `r2.capibaratraductor.com`.

Publica el repo con el topic **`kino-plugin`**.

## Nota

Solo usa APIs públicas de CapibaraTraductor. No redistribuye archivos. Respeta los términos del sitio y de cada scan.

## Cambios

### 2.0.0

- Descifrado de páginas de manga (`ph` / `ls` / token HTML).
- Pantalla de lectura (apiVersion 14) con tira de imágenes y cap. anterior/siguiente.
- Catálogo separado: vídeos, mangas, novelas.
- Corrección del cuerpo de `kino.fetch` (`r.text()`).

### 1.0.1

- Fix silencioso de home vacío (`r.body` → `r.text()`).

### 1.0.0

- Primera versión solo catálogo.
