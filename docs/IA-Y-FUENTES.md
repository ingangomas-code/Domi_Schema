# IA y fuentes — revisión local

La sección **Crear esquema** forma parte de la barra izquierda, debajo de Módulos. Permite cargar o arrastrar archivos, pegar texto, conectar GitHub y escribir un prompt. Selecciona automáticamente un proveedor configurado (Gemini en producción) y usa contexto cuando hay fuentes o creación por prompt cuando no las hay. **Generar esquema** valida el resultado y lo abre directamente en el lienzo como un proyecto nuevo, conservando el anterior. Análisis, Dashboard, Recomendaciones y Borradores y citas abren informes opcionales. En pantallas pequeñas abre **Mostrar módulos** (☰).

## Iniciar

```powershell
npm ci
# Opcional: copia .env.example a .env.local y configura claves SOLO allí.
npm run dev
```

El puerto habitual es 4173. Para revisar junto a una instancia anterior:

```powershell
$env:PORT = '4174'
npm run dev
```

La revisión de esta entrega está en http://127.0.0.1:4174/. El servidor escucha únicamente en loopback, verifica Host/Origin y habilita el procesamiento local sin sesión. Vercel requiere un token de Supabase válido y un correo confirmado incluido en `AI_ALLOWED_EMAILS`. Ese bypass local es una propiedad interna del servidor; ningún encabezado del cliente lo habilita.

## Procedimiento común

1. Extraer texto y conservar archivo, página o líneas. GitHub se resuelve a un SHA inmutable antes de descargar.
2. Mostrar formatos omitidos, incidencias de extracción y estadísticas de contenido.
3. Fragmentar en ventanas de hasta 1.800 caracteres con solapamiento de 180.
4. Calcular TF-IDF y clustering k-means esférico determinista. En CSV/TSV y cada hoja de Excel también: filas, duplicados, tipos, no nulos, nulos, valores únicos, media, desviación estándar muestral, mínimo, cuartiles, máximo y atípicos por IQR. Son cálculos de JavaScript, equivalentes funcionales al perfil tabular de pandas; no se ejecuta `df.info()` ni `df.describe()` sobre documentos.
5. Si se configuró un modelo de embeddings, construir automáticamente el índice semántico y repetir el clustering sobre esos vectores. Su estado es visible. Sin esa configuración solo se completa el análisis léxico; no se simulan embeddings semánticos.
6. Al generar con fuentes, recalcular embeddings de los fragmentos y del prompt usando el mismo proveedor/modelo; recuperar hasta 18 fragmentos por similitud híbrida (60 % semántica, 40 % léxica).
7. Enviar únicamente el contexto recuperado al proveedor generativo seleccionado. Las fuentes se delimitan como datos en el prompt; las instrucciones de los documentos no tienen autoridad.
8. Exigir JSON, validar límites, IDs, extremos de conexiones y citas literales por nodo, campo, relación y recomendación. Rechazar la respuesta completa si falla una cita o la estructura. El editor no se modifica ante fallos.
9. Presentar el borrador y su evidencia; abrirlo como un proyecto nuevo cuando el usuario lo elija.

El Dashboard usa ECharts desde una copia fijada dentro de `dist/vendor`. Cuenta lenguajes por extensión y caracteres del código extraído del repositorio, ZIP o archivos individuales; documentos como README no se atribuyen a un lenguaje. Los lenguajes recomendados solo aparecen si el prompt los solicita. Se muestran como una prioridad ordinal y conservan evidencia en modo documental, nunca como un porcentaje de confianza.

La existencia de una cita no demuestra que la interpretación sea correcta. No se promete ausencia total de alucinaciones ni se muestran porcentajes de confianza inventados. Las agrupaciones son propuestas visuales y los campos generados quedan como propuestas hasta su revisión manual.

## Formatos y límites efectivos

| Entrada | Implementación |
| --- | --- |
| TXT, MD, código, JSON, XML, Mermaid | Texto UTF-8 con ubicaciones; no se ejecuta código |
| CSV / TSV | Texto más perfil tabular determinista |
| XLS / XLSX | SheetJS 0.20.3: todas las hojas y referencias a filas; perfil por hoja, hasta 20 hojas, 10.000 filas y 200 columnas por hoja y 100.000 celdas por libro. Fórmulas sin ejecutar, usando valores guardados cuando existen |
| JS / TS / JSX / TSX | AST con Babel para clases, funciones, imports e interfaces |
| Otros lenguajes | Análisis textual; no se afirma tener AST para esos lenguajes |
| PDF | Texto por página; hasta 60 páginas. Los escaneos sin texto se rechazan con indicación de exportar imágenes para OCR |
| DOCX | Texto de Word con Mammoth; .doc requiere conversión previa |
| PNG / JPEG / WebP | OCR español/inglés con Tesseract en un thread descartable, 12 megapíxeles, límite de 40 segundos |
| ZIP | Texto, código y Excel; sin ejecutar ni escribir entradas en disco, hasta 16 MB descomprimidos y 2.000 entradas |
| GitHub | Repositorios públicos; SHA registrado. Privados, GitLab y Bitbucket no están habilitados |

Máximo 2,5 MB por carga, 80 fuentes, 300.000 caracteres y 250 fragmentos por proyecto. Las entradas no admitidas del ZIP se enumeran. Se excluyen `.env`, claves, dependencias y carpetas de construcción. La exclusión por nombre no es un escáner universal de secretos.

OCR recupera texto, no interpreta de forma fiable flechas ni geometría de diagramas. Análisis visual completo, OCR de PDF automático, repositorios privados, videos, procesamiento masivo con una cola durable y búsqueda `pgvector` son ampliaciones pendientes. Este incremento usa procesamiento acotado por solicitud, no una cola durable. En Vercel el presupuesto de ejecución es 60 segundos: divide entradas que excedan ese tiempo.

## Proveedores y claves

Los adaptadores implementan OpenAI, Anthropic, Gemini y Mistral. Configura en `.env.local` o, al publicar, en las variables del proyecto de Vercel:

- `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`: configuración pública de la misma instancia del cliente.
- `AI_ALLOWED_EMAILS`: correos confirmados autorizados, separados por coma. Restringe quién puede consumir las claves del servidor.
- `OPENAI_API_KEY` y `OPENAI_MODELS`, o los equivalentes `ANTHROPIC_*`, `GEMINI_*`, `MISTRAL_*`. Las listas contienen IDs exactos, separados por coma, de modelos habilitados en tu cuenta. La API rechaza modelos fuera de esa lista.
- `AI_EMBEDDING_PROVIDER`: `openai`, `gemini` o `mistral`.
- `AI_EMBEDDING_MODEL`: ID exacto de un modelo de embeddings del proveedor elegido. Utiliza la clave de ese proveedor.

No hay claves de modelos en esta entrega ni se configura una por defecto. Los adaptadores se prueban con respuestas controladas; una llamada real de generación/embeddings requiere las credenciales del usuario y aún debe verificarse. Las claves no se envían al navegador ni se guardan en el expediente. El contenido de las fuentes sí se envía a los proveedores al calcular embeddings o generar, según se informa en el panel. El límite de 20 solicitudes/minuto es por instancia del servidor; no es una cuota distribuida de facturación.

## Guardado y recomendaciones

Cada proyecto tiene un expediente independiente en IndexedDB con texto extraído, ubicaciones, análisis, índice semántico cuando exista, borrador, contexto y decisiones. Se conserva el contenido extraído; los archivos binarios originales no se archivan en Storage en esta versión.

**Guardar nube** guarda el expediente en `public.ai_workspaces` con clave `(owner_id, project_id)`. **Abrir nube** recupera el expediente; si la copia local es más reciente no la reemplaza. Los proyectos del editor mantienen su sincronización anterior. La migración de expedientes es aditiva; RLS permite acceso únicamente al propietario y `anon` no tiene acceso. Se verificaron lectura y escritura entre dos propietarios en una transacción revertida.

**Revisada** registra que se examinó una recomendación. **Aceptada** solo se habilita después de revisarla. Quitar “Revisada” también retira la aceptación. Ninguna casilla modifica el mapa por sí misma. Cada decisión conserva fechas y se guarda en el expediente. Las recomendaciones se basan en citas en modo documental y están identificadas como propuestas.

Las diez últimas versiones reemplazadas del borrador conservan sus citas y decisiones. Se restauran en **Generar → Historial**. **Exportar expediente** descarga un JSON con las fuentes y la revisión; la exportación normal del editor sigue descargando únicamente el mapa. Las descripciones de los nodos importados incluyen referencias, y el expediente conserva la evidencia completa de relaciones y campos.

## Comprobaciones

`npm test` cubre el editor previo, fragmentación, EDA, recuperación, citas inexistentes, referencias, límites, extracción, ZIP malicioso, URLs, configuración y contratos de proveedores. `node scripts/verify-extraction.cjs` comprueba OCR con una imagen sintética y GitHub con un repositorio público; requiere red para datos de idioma y GitHub, sin llamadas pagadas a modelos.

Documentación consultada: [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [OpenAI Chat](https://developers.openai.com/api/reference/resources/chat), [Gemini generación](https://ai.google.dev/api/generate-content), [Gemini embeddings](https://ai.google.dev/api/embeddings), [GitHub repositorios](https://docs.github.com/en/rest/repos/contents), y los README de las dependencias con versiones fijadas en package-lock.json.
