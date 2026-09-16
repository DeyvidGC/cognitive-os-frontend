# Cognitive OS · Frontend

Interfaz en español construida con React, TypeScript y Vite, alineada con los contratos actuales de Cognitive OS API (FastAPI).

## Desarrollo

```powershell
npm install
npm run dev
```

Abrir http://127.0.0.1:5173. Iniciar la API por separado en http://127.0.0.1:8000; Vite reenvía `/api` al backend para evitar problemas de CORS en desarrollo. También está configurado en `npm run preview`.

Para cambiar el destino, copiar `.env.example` a `.env.local` y ajustar `API_PROXY_TARGET`. `VITE_API_BASE_URL` contiene el prefijo público de la API, por defecto `/api/v1`. No colocar credenciales ni secretos en variables `VITE_`.

La API necesita PostgreSQL configurado y sus migraciones aplicadas. El registro requiere `COGNITIVE_REGISTRATION_ENABLED=true` en el backend. Las cuentas existentes pueden iniciar sesión con su correo y contraseña. El frontend no crea usuarios de demostración en la API real.

## Incluido

- Inicio de sesión, registro, cierre y selección de organización.
- Panel con métricas calculadas a partir de datos reales, estados vacíos y reintento ante fallos.
- Listado y creación de sesiones con consentimiento explícito.
- Registro de notas con clave de idempotencia, carga y visualización de capturas PNG/JPG/WebP (hasta 10 MB), preguntas y respuestas.
- Cierre de sesiones con confirmación y bloqueo ante preguntas pendientes o ausencia de contenido.
- Biblioteca y filtros de procedimientos, versiones y asociación a sesiones de origen.
- Creación y edición de pasos, origen, validación y vinculación de evidencias.
- Edición y lectura del tutorial Markdown; revisión, devolución, aprobación, publicación y retiro.
- Búsqueda textual de pasos publicados y acceso al procedimiento de origen.
- Controles por rol: autor, revisor, propietario y lector. La API mantiene la autorización definitiva.
- Diseño adaptable a escritorio y móvil, formularios etiquetados y diálogos con navegación por teclado.

## Estructura

- `src/api.ts`: tipos, cliente HTTP, errores y paginación.
- `src/Auth.tsx`: acceso y registro.
- `src/App.tsx`: navegación, organización, panel, listados y búsqueda.
- `src/SessionDetail.tsx`: notas, capturas y aclaraciones.
- `src/ProcedureDetail.tsx`: versiones y flujo editorial.
- `src/ui.tsx`, `src/utils.ts`: componentes y utilidades compartidas.

## Verificación

```powershell
npm run build
npm run lint
npm test
```

Las pruebas del cliente verifican cabeceras de autenticación y organización, multipart, expiración, cierre sin contenido, paginación y errores. No necesitan una base de datos.

Para repetir una revisión visual aislada, en una terminal:

```powershell
node scripts/fixture-server.mjs
```

En otra terminal:

```powershell
$env:API_PROXY_TARGET='http://127.0.0.1:8011'
npm run dev -- --port 5174
```

Abrir http://localhost:5174 e ingresar con `prueba@example.com` / `Prueba-local-2026`. Son credenciales ficticias que solo funcionan en este servidor de prueba. Los datos se pierden al detenerlo y nunca se envían al backend real. La fixture cubre los flujos de notas y edición; no implementa la carga binaria de evidencias ni sustituye las pruebas de integración con PostgreSQL.

Verificado visualmente: acceso, creación de sesión, notas, aclaraciones, cierre, creación de procedimiento y versión, paso confirmado, tutorial, revisión, aprobación, publicación, búsqueda y cambio a una organización con rol lector. Revisado en escritorio y a 390 px de ancho.

## Grabaciones, micrófono y revisión del aprendizaje

El frontend consulta las capacidades reales de la API y permite guardar el video con progreso, cancelación y reintentos, reproducir grabaciones guardadas, solicitar/reintentar el análisis y revisar el informe con sus marcas de tiempo. El micrófono es opcional y se activa antes de grabar; puede silenciarse durante la captura. Se respetan los límites declarados por el backend.

Los mensajes y respuestas se guardan con los endpoints de contexto y aclaraciones. El agente en vivo aún no tiene contrato: la interfaz lo indica expresamente. El worker actual analiza frames después de la subida y no interpreta audio. Aprobar el informe visual no lo convierte en un procedimiento publicable.

Documentación de contratos existentes, configuración y trabajo pendiente del backend: [docs/backend-pendiente.md](docs/backend-pendiente.md).

Módulos: `SessionMedia.tsx` (estado y grabaciones), `ScreenStudio.tsx`/`screenCapture.ts` (pantalla y micrófono), `RecordingUploadPanel.tsx`/`recordings.ts` (transferencia), `AgentConversation.tsx` (contexto y preguntas), `RecordingReport.tsx` (revisión con fuentes de video), `JobProgress.tsx` (trabajos).

Los videos locales deben guardarse o descargarse antes de salir. Los enlaces de reproducción se renuevan desde la API. Si el acceso caduca durante una captura o edición protegida, la vista permite conservar el trabajo local antes de cerrar sesión. Se advierte al navegar con video, subida o correcciones pendientes.

## Verificación de esta integración

`npm run build`, `npm run lint` y `npm test`. Las pruebas cubren autenticación, permisos de cabecera, paginación, errores, ciclo de vida de captura, micrófono opcional, liberación de pistas, subida firmada sin bearer, progreso y reintentos idempotentes. Usan dispositivos y transporte simulados. La verificación real contra Azure, el worker y el modelo requiere configurar e iniciar esos servicios.

En producción servir `dist` y configurar un reverse proxy de `/api` hacia FastAPI. El proxy Vite solo aplica en desarrollo/preview. Las subidas van directamente a Azure y requieren su propio CORS. Las tipografías usan Google Fonts con alternativas locales.

## Miniatura del agente

En una sesión en captura, pulsa «Abrir agente en miniatura» antes de cambiar a otra aplicación. Usa Document Picture-in-Picture cuando está disponible; requiere HTTPS o localhost y un clic del usuario. Mantén abierta la pestaña original. La alternativa «Usar miniatura dentro de esta página» no se superpone a otras aplicaciones.

La miniatura muestra avatar, tiempo, micrófono, grabar/pausar/reanudar/detener y conversación expandible. Activa el micrófono antes de iniciar la grabación. Cerrar la miniatura no detiene la captura y conserva el borrador de texto. El backend actual sigue analizando después de subir: esta interfaz no habilita respuestas de IA en vivo por sí sola.

Verificación: miniatura interna, expansión/cierre y conservación de borrador comprobados con API de prueba. La ventana externa debe probarse en un navegador de escritorio compatible; el navegador integrado de la revisión no la mantuvo abierta.

Referencia: https://developer.chrome.com/docs/web-platform/document-picture-in-picture
