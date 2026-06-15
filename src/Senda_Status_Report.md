Estado del Proyecto Senda - Build with Gemini XPRIZE
Definición
Senda es una plataforma de automatización administrativa que utiliza Gemini 2.5 Flash como motor de inteligencia artificial para transformar la gestión fiscal y operativa de pequeños negocios en México.

Senda actúa como un agente conversacional que opera a través de WhatsApp, permitiendo a los clientes solicitar facturas mediante lenguaje natural, mientras que los comercios gestionan la confirmación y emisión de CFDI desde su teléfono móvil.

El sistema elimina la fricción tradicional de la facturación: no requiere portales web complejos, no necesita que el cliente instale apps adicionales, y automatiza la validación de datos fiscales mediante IA.

Filosofía de diseño
Senda sigue un principio fundamental: la tecnología debe adaptarse al comercio, no al revés. Por eso:

Sin portal de facturación → Todo ocurre por WhatsApp

Sin captura manual de RFC → Gemini valida y extrae automáticamente

Sin esperas → El comercio confirma o rechaza en segundos

Sin errores fiscales → Validación en tiempo real antes de emitir CFDI

Arquitectura técnica implementada
Backend
Componente	Tecnología	Estado
Servidor principal	Node.js + Express	✅ Implementado
Base de datos	Supabase (PostgreSQL)	✅ Implementado
Autenticación	API Key + RLS policies	✅ Implementado
Entorno	TypeScript (parcial) / JavaScript	✅ Implementado
Motor de IA
Componente	Tecnología	Estado
Modelo principal	Gemini 2.5 Flash (Google)	✅ Integrado
SDK utilizado	@google/genai	✅ Implementado
Validación de datos fiscales	Prompt engineering con JSON estructurado	✅ Implementado
Extracción de RFC	Gemini con prompt de validación	✅ Implementado
Canales de comunicación
Componente	Tecnología	Estado
WhatsApp entrante	Baileys (biblioteca no oficial)	✅ Implementado
WhatsApp saliente	Baileys	✅ Implementado
QR dinámico	qrcode-terminal + qrcode	✅ Implementado
Webhook interno	Express endpoints	✅ Implementado
Facturación
Componente	Tecnología	Estado
Plataforma	Facturapi	⏳ Pendiente integración final
Modo	Sandbox configurado	⏳ Pendiente
Emisión de CFDI	API de Facturapi	⏳ Pendiente
Cancelación	API de Facturapi	⏳ Pendiente
Bases de datos
Tabla	Propósito	Estado
ChatSession	Estado de conversación por número de WhatsApp	✅ Implementada
Invoice	Almacenamiento de facturas pendientes y completadas	✅ Implementada
Commerce	Datos fiscales del comercio	⏳ Pendiente
User	Usuarios del sistema	⏳ Pendiente
Flujo completo implementado
text
Cliente hace un pago (efectivo/transferencia/tarjeta)
         ↓
Cliente escribe "Factura" al WhatsApp del comercio
         ↓
Senda Bot (Gemini) responde solicitando 6 datos fiscales
         ↓
Cliente envía RFC, Razón Social, Régimen Fiscal, Uso CFDI, Código Postal y Correo
         ↓
Gemini valida todos los datos en un solo análisis
         ↓
┌─────────────────────────────────────────────────────────┐
│ Si falta algún dato → Bot pide SOLO lo que falta       │
│ Si hay error de formato → Bot indica el error          │
└─────────────────────────────────────────────────────────┘
         ↓
Datos completos y válidos → Se guardan en Supabase (status: PENDING)
         ↓
Senda NOTIFICA al comercio por WhatsApp con opciones:
   ✅ CONFIRMAR [ID]
   ❌ RECHAZAR [ID] [motivo]
         ↓
Comercio revisa los datos y responde
         ↓
┌─────────────────────────────────────────────────────────┐
│ Si CONFIRMA → Se genera factura con Facturapi          │
│              Se envía CFDI por correo al cliente       │
│              Se actualiza estado a COMPLETED           │
└─────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────┐
│ Si RECHAZA → Se notifica al cliente con el motivo      │
│             Se actualiza estado a REJECTED             │
└─────────────────────────────────────────────────────────┘
         ↓
Cliente recibe confirmación por WhatsApp
Métricas de eficiencia
Métrica	Valor
Mensajes promedio por factura exitosa	4-5 mensajes
Tiempo estimado de flujo completo	1-2 minutos (cliente diligente)
Mensajes en caso de datos faltantes	+2 mensajes por campo faltante
Mensajes en caso de error de formato	+2 mensajes por corrección
Lo que falta para producción (MVP)
Prioridad Alta (Imprescindible)
Tarea	Descripción	Estado
Tabla Commerce	Almacenar datos fiscales del comercio (RFC, razón social, régimen, certificado CSD, llave privada)	⏳ Pendiente
Registro de comercios	Web o WhatsApp para que el comercio se dé de alta con sus datos fiscales	⏳ Pendiente
Integración Facturapi	Generación real de CFDI usando la API de Facturapi	⏳ Pendiente
Envío de correos	Enviar CFDI en PDF al correo del cliente usando Nodemailer o SendGrid	⏳ Pendiente
Manejo de sesiones	Persistencia correcta del estado de conversación (ya está la tabla, falta lógica)	⏳ Pendiente
Validación de RFC	Algoritmo de dígito verificador + consulta al SAT	⏳ Pendiente
Prioridad Media (Recomendado para MVP)
Tarea	Descripción	Estado
Dashboard del comercio	Web simple para ver historial de facturas, confirmar/rechazar	⏳ Pendiente
Migrar Baileys a Twilio	Reemplazar biblioteca no oficial por API oficial de WhatsApp Business	⏳ Pendiente
Manejo de errores robusto	Timeouts, reconexión automática, logs estructurados	⏳ Pendiente
Pruebas end-to-end	Flujo completo con cliente real	⏳ Pendiente
Prioridad Baja (Post-MVP)
Tarea	Descripción
Múltiples comercios	Soporte para varios negocios en la misma instancia
Multi-idioma	Soporte para español e inglés
Analytics	Métricas de facturación, tiempos de respuesta
Webhooks	Integración con sistemas contables externos
Plan de lanzamiento
Fase	Fecha	Actividades
MVP	Julio 2026	Completar tabla Commerce + registro de comercios + integración Facturapi
Alpha cerrado	Agosto 2026	3-5 comercios reales, monitoreo de errores
Beta abierto	Septiembre 2026	20 comercios, ajustes de UX
Lanzamiento público	Octubre 2026	Marketing, onboarding autogestionado
Riesgos y mitigaciones
Riesgo	Probabilidad	Mitigación
Bloqueo de Baileys por WhatsApp	Media	Tener Twilio como plan de contingencia
Costos de Gemini en producción	Baja	Gemini 2.5 Flash es muy económico (~$0.0375/1M tokens)
Errores de validación fiscal	Media	Validación en dos capas: Gemini + algoritmo local
Falta de volumen de ventas	Alta	Enfocar marketing en negocios con alta rotación (restaurantes, tiendas de conveniencia)
SAT rechaza CFDI por datos incorrectos	Media	Validación previa contra el SAT usando API de Facturapi
Conclusión
Senda ha implementado correctamente:

✅ Bot conversacional en WhatsApp con Gemini 2.5 Flash

✅ Validación y extracción de datos fiscales mediante IA

✅ Base de datos en Supabase para gestión de estados

✅ Notificación al comercio para confirmación de facturas

✅ Flujo completo de cliente → bot → comercio

El núcleo del producto funciona. Lo que resta es principalmente trabajo de integración:

Alta de comercios (tabla Commerce + registro)

Generación real de CFDI (Facturapi)

Envío de correos con facturas adjuntas

Una vez completados estos tres puntos, Senda estará lista para un lanzamiento en producción.