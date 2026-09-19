# Integración de llamada en vivo

Se revisaron 63-agent-live-voice.md, 62-agent-live.md, visual-catalogo.md, 06-aprendizaje-visual.md y 07-mejoras-frontend.md, además de los handlers reales del backend.

## Uso

1. Abre una sesión en captura y comparte pantalla.
2. En el agente, selecciona **Llamada en vivo**, acepta el consentimiento de voz/pantalla/transcripción y pulsa **Iniciar llamada**.
3. Tras `ready`, autoriza el micrófono. Habla normalmente: el backend entrega audio y puede emitir `clarification.created` sin intervención del usuario.
4. La pregunta aparece en un aviso, también en la miniatura. Hablar alimenta la conversación; para resolver la aclaración hay que confirmar el texto (escrito o dictado). La UI verifica su persistencia por GET antes de mostrar éxito.
5. Colgar, revocar consentimiento, cambiar a chat, pausar/detener pantalla, salir o esconder la pestaña termina la llamada. No reconecta automáticamente. La grabación de video sigue siendo un flujo independiente.

La política de terminar al ocultar la pestaña sigue expresamente la guía 07 del backend. Por ello, cambiar a otra pestaña/aplicación puede terminar la conversación incluso si la miniatura sigue abierta. Si el producto necesita una llamada continua sobre otras aplicaciones, hay que acordar una política diferente; no se cambió silenciosamente.

## Implementación

- WebSocket `/agent/live-voice`, autenticación exclusivamente en la primera trama. Sin credenciales del proveedor en el navegador.
- AudioWorklet: PCM16 little-endian, mono, 24 kHz, fragmentos binarios de 20 ms (960 bytes). Contexto de audio inicializado por clic; micrófono solo después de `ready`.
- Web Audio para reproducción PCM cruda, cola ordenada y limitada. Corte inmediato y liberación de recursos al terminar. No se usa `decodeAudioData` para PCM ni MediaRecorder para el audio de la llamada.
- Indicadores basados en fragmentos enviados/reproducidos; silenciar llamada no detiene el video. El silenciado de micrófono de captura también silencia la llamada. El dictado de una aclaración suspende el envío de voz de llamada mientras está activo.
- Capturas JPEG de hasta 1280×720 y 512 KB con la cadencia recibida en `ready`; protección ante saturación de red.
- `session.ending` con motivo visible, límite local defensivo, errores 401/403/409/503 y reconexión exclusivamente manual.
- Transcripciones recuperadas por eventos distinguen usuario/agente; el informe explica `live_voice_transcript_available`.

## Precisiones necesarias del backend

El canal ya existe y está conectado. No hace falta construir otro WebSocket. Para cerrar la integración en producción:

1. Anunciar en `ready` `audio_sample_rate`, `audio_channels`, `audio_format` y `audio_chunk_max_bytes`. El código actual del servidor anuncia solo entrada/salida; usa `pcm16` en el adaptador OpenAI. Por ahora el cliente usa 24 kHz mono y 960 bytes, por debajo del mínimo configurable de 1024 bytes.
2. Emitir `clarification.resolved` con ID y respuesta confirmada. Mientras no exista, el cliente verifica por HTTP (hasta cinco intentos) y conserva el texto si no puede confirmar.
3. Aclarar/resolver el flujo hablado: actualmente la transcripción de voz no resuelve una Clarification automáticamente. Para hacerlo sin confirmación textual manual hacen falta vinculación de turno/pregunta y evento de confirmación.
4. Emitir eventos de inicio/fin de respuesta y de interrupción (`speech_started`/cancelación con ID de respuesta) para descartar audio pendiente cuando el usuario interrumpe. El botón actual detiene el audio ya recibido; no cancela la generación en el proveedor porque ese control no existe en el contrato.
5. Validar el adaptador OpenAI real. El backend declara pruebas con proveedor simulado; probar nombres de eventos, function calling, autenticación, audio, preguntas proactivas, duplicación de llamada (409), límite de duración y cierre por autorización.
6. Mantener los IDs de aclaraciones estables y disponibles por GET para reconexión. Los errores no deben producir preguntas duplicadas.

La frecuencia PCM se contrastó con la [referencia oficial de Realtime](https://platform.openai.com/docs/api-reference/realtime). No se hicieron llamadas de pago al proveedor durante esta implementación.

## Validación

Compilación, lint y 28 pruebas automatizadas. Nuevas pruebas verifican autenticación de ambos sockets sin token en URL, codificación PCM y tamaño, mute, orden de reproducción, cierre y permiso de micrófono que llega después de colgar. Audio/dispositivos simulados: falta aceptación conjunta con voz real y proveedor configurado.
