# Domi Schema Studio

Editor visual basado en el HTML de Constructora ERP proporcionado. Conserva los módulos, campos PK/FK, clasificación de campos, vista de resumen y entidades, filtros, búsqueda, inspector, guía, colores y cambio de idioma. Cada mapa se administra como un proyecto local independiente.

## Uso

Abre `dist/index.html` directamente en un navegador o ejecuta `node serve.cjs` y visita `http://127.0.0.1:4173`.

- **Nuevo nodo** o **N**: crea una entidad o un paso de workflow. También puedes hacer doble clic en el lienzo.
- **Nuevo nodo madre** o **G**: crea un nodo grande y opaco que contiene subnodos. Puedes crearlos desde su cabecera, arrastrar nodos hacia dentro o sacarlos de nuevo.
- El nodo madre se mueve junto con sus subnodos, se puede redimensionar y tiene puntos propios para conectarlo con otros nodos o nodos madre.
- **Nuevo proyecto**: crea un trabajo independiente. El selector lateral permite cambiar entre proyectos guardados en el navegador.
- Importar un JSON o cargar el ejemplo ERP crea otro proyecto y conserva los actuales.
- Arrastra una tarjeta para moverla. Selecciona un nodo para editar su nombre, etiqueta, módulo, descripción y campos en Detalles.
- Arrastra la cabecera de un box para mover juntos todos sus nodos. Arrastra un nodo hacia dentro o fuera para añadirlo o sacarlo del box; las relaciones del nodo se conservan. La esquina inferior derecha permite redimensionar la caja.
- Arrastra cualquiera de los cuatro puntos de conexión hasta otro punto. También puedes hacer clic en el primer punto y después en el segundo; funciona con teclado usando Tab y Enter.
- Selecciona una línea para editar su etiqueta o cardinalidad, o eliminarla.
- Arrastra el fondo para desplazar el mapa. La rueda controla el zoom y **Ajustar** encuadra los nodos visibles.
- **Mapa en blanco** permite empezar desde cero. **Cargar ejemplo ERP** restaura el ejemplo.
- **Exportar JSON / Importar** guarda o abre una copia del mapa. Importar reemplaza el mapa actual después de confirmarlo.

Atajos: Ctrl/Cmd+Z deshace, Ctrl/Cmd+Shift+Z rehace, Ctrl/Cmd+D duplica, Supr elimina la selección, / busca, Esc cancela una conexión y 0 ajusta la vista. Un nodo enfocado se mueve con las flechas (Shift para pasos mayores).

## Almacenamiento

Los mapas se guardan automáticamente **en el navegador y dispositivo actuales**, no en una cuenta ni en un servidor. Abrir la app en otra dirección, perfil o dispositivo usa un almacenamiento distinto. Exporta una copia JSON para trasladar o respaldar tu trabajo. Si el navegador impide guardar o se llena el almacenamiento, la app muestra un aviso. El historial de deshacer corresponde a la sesión actual.

Límites de importación: 5 MB, 1.000 nodos, 200 boxes, 100 módulos, 100 campos por nodo y 5.000 relaciones. Es posible importar la estructura `schemaData` del HTML original como JSON.

## Desarrollo y validación

HTML, CSS y JavaScript sin dependencias externas. Los archivos publicados están en `dist/` y no necesitan compilación.

Ejecuta `node --test tests/model.test.cjs` y `node --check dist/app.js`.

Las pruebas verifican importación/exportación, validación del esquema, conexión entre puertos, duplicación independiente, eliminación de relaciones asociadas y archivos de entrada. No se realizó una prueba visual o de interacción en navegador.

La integración WebMCP opcional se registra únicamente si `document.modelContext` está disponible. Expone lectura del mapa, creación de nodos y conexiones por lotes mediante el mismo estado e historial de la interfaz.

Supabase, Vercel y el repositorio remoto quedan para la siguiente fase. Esta versión guarda proyectos únicamente en `localStorage` y funciona en `http://127.0.0.1:4173`.
