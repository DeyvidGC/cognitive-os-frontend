# Contratos necesarios para completar la experiencia

> Actualizacion: el canal de voz ya esta conectado en el frontend. Las propuestas antiguas de la seccion 4 quedan sustituidas por [Integracion de voz en vivo](agente-voz-en-vivo.md). Ese documento distingue lo implementado y los ajustes pendientes del protocolo.


Actualizado: 18 de septiembre de 2026. Cambios de esta entrega limitados al frontend; no se modificó la API.

## Implementado en el frontend

- Al guardar el video desaparece el estudio de captura vacío. Conversación/contexto queda en un desplegable y se conserva el reproductor de la grabación.
- Historial en **Sesiones de aprendizaje**, con búsqueda, fecha, estado y acceso a cada sesión. Recupera las grabaciones de las sesiones existentes con concurrencia limitada y avisa si la carga es parcial.
- Nueva sesión desde el detalle; cada sesión conserva su video. Si la API devuelve varios videos, el detalle permite seleccionarlos. La creación de múltiples videos en una misma sesión todavía depende del cambio de contrato descrito abajo.
- Importación WebM/MP4 visible antes de la captura, vista previa, cancelación de selección y subida recuperable. Después de guardar se utiliza la acción existente de analizar.
- Micrófono preseleccionado al compartir; requiere el permiso del navegador y se puede desactivar o silenciar. El consentimiento para analizar audio sigue siendo explícito al guardar.
- BPMN horizontal con actividades azules, inicio verde, fin violeta y decisiones amarillas; zoom, encajar, descarga y lista accesible. Se conservan las conexiones y condiciones recibidas.
- Requisitos previos ocultos en la vista del informe, sin borrar los datos. Reglas con evidencia desplegable y enlaces descriptivos; excepciones en un desplegable al final.
- Aclaraciones como encuesta completa o una pregunta a la vez; texto, dictado y lectura de preguntas. El dictado usa SpeechRecognition del navegador y guarda únicamente el texto confirmado en el endpoint de respuesta existente. En navegadores sin soporte sigue disponible el texto.
- El agente puede leer en voz alta las preguntas recibidas en sus respuestas y mostrar un aviso. Esto es una respuesta a un mensaje/captura enviado: todavía no observa continuamente ni inicia preguntas autónomas.
- Se mantienen carga por bloques, historial de informes, reproducción, trabajos, revisión editorial, búsqueda, exportación Word/PDF y autenticación del WebSocket.

## 1. Sesiones de 30 minutos — necesario

La API local aún declara `recording_max_seconds=600` y valida `le=600` en `src/cognitive_os/core/config.py`. `GET /recordings/capabilities` devuelve ese límite. Cambiar solo el frontend provocaría rechazos del worker.

Backend debe:

- Admitir y anunciar `max_seconds: 1800`, ampliando también la validación de configuración.
- Revisar tamaño máximo, duración de enlaces firmados, tiempos de espera, extracción de audio, muestreo, presupuesto del modelo y reintentos para 30 minutos.
- Validar duración en el servidor para capturas e importaciones; devolver un error identificable si excede el límite.
- Aclarar si los 30 minutos son por archivo o la suma de todos los videos de una sesión. Si es acumulado, exponer `used_seconds` y `remaining_seconds`.

El frontend de captura usa el menor entre 1800 y el límite anunciado. Mientras la API anuncie 600, seguirá mostrando y aplicando 10 minutos.

## 2. Historial y aprendizaje periódico — necesario para agrupar actualizaciones

Hoy `max_recordings_per_session` está fijado en 1. El historial funciona entre sesiones; crear sesiones nuevas no actualiza automáticamente un mismo procedimiento.

Propuesta de contrato (rutas nuevas, aún no consumidas):

- Un identificador estable `learning_series_id` o `procedure_id` que relacione las sesiones de un mismo proceso. Admitirlo en `POST /learning-sessions` y devolverlo en consultas.
- `GET /recordings?cursor=&limit=&learning_series_id=&status=&query=` por organización. Retornar `items` y `next_cursor`, con `id`, `session_id`, objetivo de sesión, fecha, duración, tamaño, estado, origen (`screen_capture`/`upload`), título y revisión. Miniatura firmada opcional. Esto evita consultar una ruta por sesión para construir el historial.
- Si se desean varios archivos por sesión, quitar la restricción única y publicar el límite real en capacidades. Cada reserva necesita identidad e idempotencia propias; subir un nuevo archivo no debe recuperar por error la primera reserva existente.
- Mantener grabaciones e informes anteriores; indicar cuál está vigente y permitir generar una nueva versión del procedimiento a partir de una sesión, sin sobrescribir una versión publicada.
- Al finalizar/procesar, especificar si se analizan todos los videos o solo `recording_id`, y devolver estados por archivo. No cerrar una sesión con subidas pendientes.

## 3. Aclaraciones por texto, encuesta y voz

Texto/dictado ya utilizan `PUT /learning-sessions/{session_id}/clarifications/{id}/answer` con `{answer}`. No hace falta otro endpoint para guardar el texto dictado.

Para encuestas con opciones reales, ampliar cada pregunta con `answer_type` (`text`, `single_choice`, `multiple_choice`), `options` con IDs estables, obligatoriedad, estado y versión. Validar respuestas y evitar duplicados mediante `client_message_id`. Actualmente la encuesta es de respuestas abiertas; no inventa opciones.

Para voz independiente del navegador y conservar audio, proponer:

- Reserva/subida de audio asociada a sesión y `clarification_id`, con MIME, bytes, duración y consentimiento.
- Trabajo de transcripción con estados y errores; devolver texto editable antes de guardar la respuesta.
- Identidad de audio, retención/borrado y permisos por organización. Nunca guardar audio sin consentimiento.

## 4. Agente que interrumpe y conversa — necesario

El canal actual `agent/live` acepta texto e imágenes puntuales. Para que el agente detecte dudas por sí mismo y pregunte durante la sesión, acordar una ampliación versionada:

- Capacidades: `proactive_questions`, `audio_input`, `audio_output`, intervalo de observación, tamaño/frecuencia máxima, formatos y límites de sesión.
- Eventos del servidor `clarification.created` con `event_id`, `clarification_id`, `question`, contexto, instante del video y prioridad. Persistir la misma pregunta en el endpoint de aclaraciones para recuperarla tras reconectar.
- Confirmación del cliente y estados responder/posponer/descartar; no repetir preguntas al recuperar conexión. Un solo turno activo.
- Transporte de audio documentado (WebSocket binario o WebRTC), codec/frecuencia de muestreo y transcripción parcial/final.
- Voz del agente por fragmentos o URL firmada, con `turn_id`, texto y eventos de inicio/fin; cancelación cuando el usuario interrumpe (`barge-in`).
- Controles de pausa/reanudación, micrófono silenciado, consentimiento revocado y fin de captura. No seguir observando ni enviando voz después de detener.
- Recuperación por último `event_id`, expiración de credenciales, heartbeat y errores recuperables; historial sin duplicaciones.
- Vincular la respuesta hablada a la aclaración correspondiente e incluirla en la regeneración del informe.

El frontend no envía frames continuos ni simula una interrupción autónoma mientras no exista este contrato. La lectura por voz actual es síntesis del navegador y puede necesitar interacción del usuario.

## 5. Videos importados, diagrama y documentos

La subida desde archivo reutiliza reserva, bloques, confirmación y `process`; no necesita otro endpoint de análisis. Configurar Azure privado/CORS y workers reales. Añadir título/nombre y origen al contrato ayudará a distinguir videos en el historial. Transcodificar si se requiere compatibilidad uniforme entre navegadores.

La API ya incluye reglas, excepciones, alternativas y `/flow/bpmn`; no hay que reconstruir estos endpoints. Mantener consistencia de IDs entre `/flow` y BPMN, revisión y evidencias por paso. El layout horizontal y los colores se aplican en frontend. Las exportaciones del servidor deben mantener el mismo contenido/revisión; si se desea el mismo diseño horizontal dentro de Word/PDF, aplicarlo también en el generador del backend.

## Aceptación pendiente con servicios reales

Build, lint y 24 pruebas automatizadas locales; inspección visual con fixture. Esto no certifica Azure, visión, transcripción ni voz real.

Probar con proveedores y workers activos: video de 30 minutos, importación, micrófono denegado/silenciado, red cortada, recuperación, reproducción remota, análisis, aclaración, revisión, exportación y nueva sesión del mismo proceso. Para conversación autónoma, añadir interrupción del usuario, pausa y reconexión sin duplicar preguntas. Las migraciones y límites deben verificarse antes del despliegue.
