# Domi Schema Studio

Editor visual basado en el HTML de Constructora ERP proporcionado. Conserva los módulos, campos PK/FK, clasificación de campos, vista de resumen y entidades, filtros, búsqueda, inspector, guía, colores y cambio de idioma. Cada mapa se administra como un proyecto independiente.

## Uso

### Upgrade IA, fuentes y colaboración

Carga de documentos y código, análisis de contenido, conectores de modelos, borradores con evidencias y recomendaciones revisables en el panel izquierdo. El dashboard ECharts muestra lenguajes detectados en repositorios por volumen de código y lenguajes recomendados por el modelo cuando el prompt los solicita. Ejecuta `npm ci` y `npm run dev`. Consulta [configuración, formatos, verificación y límites](docs/IA-Y-FUENTES.md). La generación real requiere configurar las claves de modelos y embeddings en el servidor; el análisis léxico funciona sin ellas.

Abre `dist/index.html` directamente en un navegador o ejecuta `node serve.cjs` y visita `http://127.0.0.1:4173`.

- **Nuevo nodo** o **N**: crea una entidad o un paso de workflow. También puedes hacer doble clic en el lienzo.
- **Nuevo nodo madre** o **G**: crea un nodo grande y opaco que contiene subnodos. Puedes crearlos desde su cabecera, arrastrar nodos hacia dentro o sacarlos de nuevo.
- El nodo madre se mueve junto con sus subnodos, se puede redimensionar y tiene puntos propios para conectarlo con otros nodos o nodos madre.
- **Nuevo proyecto**: crea un trabajo independiente. El selector lateral permite cambiar entre proyectos guardados en el navegador.
- Importar un JSON o cargar el ejemplo ERP crea otro proyecto y conserva los actuales.
- Arrastra una tarjeta para moverla. Selecciona un nodo para editar su nombre, etiqueta, módulo, descripción y campos en Detalles.
- Arrastra la cabecera de un nodo madre para mover todos sus subnodos. Arrastra un nodo hacia dentro o fuera para añadirlo o sacarlo; las relaciones se conservan. La esquina inferior derecha permite redimensionarlo.
- Arrastra cualquiera de los cuatro puntos de conexión hasta otro punto. También puedes hacer clic en el primer punto y después en el segundo; funciona con teclado usando Tab y Enter.
- Selecciona una línea para editar su etiqueta o cardinalidad, o eliminarla.
- Arrastra el fondo para desplazar el mapa. La rueda controla el zoom y **Ajustar** encuadra los nodos visibles.
- **Nuevo proyecto** permite empezar desde cero. **Cargar ejemplo ERP** agrega el ejemplo como otro proyecto.
- **Exportar JSON / Importar** guarda o abre una copia del mapa. Importar crea otro proyecto y conserva los actuales.
- **Nube** permite crear una cuenta o iniciar sesión para sincronizar los proyectos con Supabase.
- **Compartir** crea un enlace revocable con una copia de solo lectura del esquema. Puede vencer en 7 o 30 días, o mantenerse sin vencimiento. La página pública no carga la navegación, los proyectos ni las fuentes del propietario.

Atajos: Ctrl/Cmd+Z deshace, Ctrl/Cmd+Shift+Z rehace, Ctrl/Cmd+D duplica, Supr elimina la selección, / busca, Esc cancela una conexión y 0 ajusta la vista. Un nodo enfocado se mueve con las flechas (Shift para pasos mayores).

## Almacenamiento

Los mapas siempre se guardan primero en el navegador. Al iniciar sesión desde **Nube**, se sincronizan con Supabase y pueden abrirse en otros dispositivos con la misma cuenta. La aplicación conserva el respaldo local si la conexión no está disponible.

Límites de importación: 5 MB, 1.000 nodos, 200 nodos madre, 100 módulos, 100 campos por nodo y 5.000 relaciones. Es posible importar la estructura `schemaData` del HTML original como JSON.

## Supabase

El proyecto remoto es `Domi Schema Studio` (`nfagwqmonxwskwyohekw`) en `us-east-1`. Las migraciones versionadas están en `supabase/migrations/`. `public.schema_projects` y `public.ai_workspaces` tienen RLS por propietario. `public.schema_shares` guarda una copia del mapa y únicamente el hash SHA-256 del token; la función `schema-share` crea, consulta y revoca los enlaces.

El frontend usa únicamente la clave publicable de Supabase. No contiene `service_role`, claves secretas ni contraseñas. El cliente oficial está fijado en `@supabase/supabase-js@2.116.0`.

## Desarrollo y validación

HTML, CSS y JavaScript sin compilación. Los archivos publicados están en `dist/`; el cliente de Supabase se carga en una versión fijada.

Ejecuta `npm test` y las comprobaciones `node --check` de los archivos JavaScript modificados.

Las pruebas verifican importación/exportación, validación del esquema, conexión entre puertos, duplicación independiente, extracción segura, análisis, citas, recomendaciones y detección de lenguajes. La interfaz local también se comprueba en navegador antes de publicar.

La integración WebMCP opcional se registra únicamente si `document.modelContext` está disponible. Expone lectura del mapa, creación de nodos y conexiones por lotes mediante el mismo estado e historial de la interfaz.

El repositorio remoto es `https://github.com/ingangomas-code/Domi_Schema`. La aplicación publicada usa Vercel y el entorno local funciona en `http://127.0.0.1:4173` por defecto.
