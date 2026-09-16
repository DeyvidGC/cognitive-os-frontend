# Integración del frontend con Cognitive OS API

Revisión realizada sobre `C:/Users/deyvi/PycharmProjects/Cognitive`. Este cambio solo modifica el frontend.

## Ya implementado en la API y conectado en el frontend

| Flujo                                            | Contrato existente                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| Disponibilidad y límites                         | `GET /api/v1/recordings/capabilities`                                    |
| Reservar video con consentimiento e idempotencia | `POST /learning-sessions/{id}/recordings`                                |
| Consultar grabaciones                            | `GET /learning-sessions/{id}/recordings`, `GET /recordings/{id}`         |
| Subida directa a Azure                           | `POST /recordings/{id}/upload-url`, PUT a la URL firmada con sus headers |
| Confirmar almacenamiento                         | `POST /recordings/{id}/complete`                                         |
| Reproducción                                     | `GET /recordings/{id}/playback`                                          |
| Analizar y reintentar                            | `POST /recordings/{id}/process`, `POST /recordings/{id}/retry`           |
| Informe editable con control de revisión         | `GET/PUT /recordings/{id}/report`                                        |
| Aprobar/rechazar informe                         | `POST /recordings/{id}/report/review`                                    |
| Notas, preguntas y respuestas                    | Endpoints existentes de `events` y `clarifications`                      |
| Trabajo de procesamiento                         | `GET /jobs/{id}` tras finalizar una sesión                               |

Todas las rutas abreviadas tienen prefijo `/api/v1`. Las llamadas a la API usan bearer y organización. La subida firmada a Azure usa solamente los headers de `SignedTransfer`, sin reenviar bearer ni cabecera de organización.

El frontend no confirma «guardado» hasta que `/complete` responde correctamente. Los reintentos conservan la reserva y su clave de idempotencia. Un error al confirmar no vuelve a transferir un video cuya subida ya terminó. Tras recargar se puede seleccionar el mismo archivo para continuar una reserva `uploading`, verificando tamaño y formato; no hay reemplazo ni borrado de reservas porque la API no los ofrece.

El informe conecta `instructions[].frame_indices` con `sampling.frames[index].timestamp_ms`, permitiendo buscar ese instante en el reproductor. Los cambios envían la `revision` original y ante 409 se conserva la edición local hasta que el usuario decide recargar. Un informe aprobado se presenta como inmutable.

## Lo que debe configurar el backend para probar este flujo real

1. Aplicar las migraciones nuevas de grabaciones, informes y trabajos en PostgreSQL.
2. Configurar almacenamiento Azure privado, contenedor y cadena de conexión solo en el servidor. Verificar que `storage_configured` sea verdadero.
3. Configurar **CORS del Blob Storage**, además del CORS de FastAPI: orígenes exactos del frontend, métodos PUT/GET/HEAD/OPTIONS y headers requeridos por la firma (`Content-Type`, `x-ms-blob-type`; Range cuando aplique). El proxy de Vite no interviene en la subida directa a Azure.
4. Ejecutar los workers visual y de consolidación y configurar el proveedor de IA. La existencia de un endpoint o `storage_configured` no garantiza que el worker/modelo esté listo.
5. Probar un video pequeño: reservar → subir → completar → reproducir → procesar → informe → editar → aprobar. Las pruebas del frontend usan transporte y dispositivos simulados; no certifican Azure, decodificación ni inferencia reales.

## Pendiente de implementar: prioridad alta

### 1. Conversación y observación en vivo

No existe WebSocket/SSE, transporte de frames ni respuesta conversacional del agente. El modo actual es `sampled_frames_after_upload`.

Definir un contrato de sesión del agente autenticada por organización, eventos ordenados e idempotentes y recuperación desde el último evento recibido. Eventos sugeridos: estado del agente, observación, pregunta, respuesta parcial/final, error recuperable, cierre. Incluir IDs, timestamps, origen y correlación con la grabación. Establecer frecuencia, resolución y límites de frames, consentimiento y política de retención.

El frontend actual guarda mensajes como `event_type: message` y permite responder aclaraciones; **no los envía a un agente en vivo ni inventa respuestas**. Las notas guardadas tampoco se incorporan hoy al proveedor de análisis visual, que recibe objetivo y frames: el backend debe integrar notas/ACL/respuestas al contexto visual si se espera que influyan en el informe.

### 2. Audio y transcripción sincronizada

El micrófono opcional ya puede incluir voz en el archivo de video. La API declara `audio_supported: false` y el worker visual ignora el audio.

Agregar extracción de audio, transcripción con segmentos temporales y recuperación de errores. Usar las explicaciones y respuestas del usuario como contexto del análisis, conservando su origen. Publicar el soporte real en capabilities. Separar en el contrato `audio_recording_supported` de `audio_analysis_supported` para evitar ambigüedad.

### 3. Convertir un informe aprobado en procedimiento

El worker visual produce `RecordingReport`; no produce una versión editorial. Aprobar el informe **no publica conocimiento**.

Agregar una operación idempotente que convierta el informe aprobado en un procedimiento o en una nueva versión de uno existente. Devolver `procedure_id`, `version_id` y la asociación de cada paso a grabación, frame y tiempo. Conservar auditoría y permitir la revisión editorial antes de publicar. La creación de borradores basada en texto ya existe, pero es un flujo diferente.

## Pendiente para recuperación y mejor experiencia

- **Trabajos por sesión:** endpoint para recuperar trabajo actual, resultado, fase, error seguro y enlaces a versión/informe después de recargar. `GET /jobs/{id}` requiere conocer un ID que la sesión no expone. Agregar reintento del trabajo textual fallido.
- **Dudas del informe:** convertir uncertainties en aclaraciones respondibles después del análisis y regenerar una nueva revisión incorporando respuestas. Actualmente responder aclaraciones exige sesión `capturing`, pero el informe llega con sesión `completed`.
- **Subidas interrumpidas:** cancelación/eliminación segura de reservas y recuperación con hash del archivo. Para archivos grandes, subida por bloques con reanudación real; hoy reintentar una transferencia reinicia el PUT completo.
- **Publicación con fuentes de video:** extender el contrato de pasos y las reglas de evidencia para aceptar grabación y rango temporal; hoy los pasos de procedimiento solo pueden asociarse a evidencia de imagen. Las marcas actuales viven en el informe visual.
- **Estado de servicios:** capabilities con disponibilidad de worker/modelo, versión del protocolo y límites de resolución. La UI consulta estados reales con polling; no muestra porcentajes inventados de análisis.
- **Renovación del acceso:** flujo de renovación/reautenticación para sesiones largas. El front preserva la captura local cuando caduca el token, pero no hay refresh token en el contrato actual.

## Criterios de integración final

Validar permisos owner/author/reviewer/reader, expiración de SAS, CORS de Azure, corte de red, subida cancelada, reserva duplicada, sesión cerrada durante la transferencia, conflicto de revisión 409, informe aprobado inmutable y reproducción de WebM/MP4 con audio. Las URLs firmadas y las credenciales nunca deben persistirse en logs o en el almacenamiento del navegador.
