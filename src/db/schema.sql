-- Esquema de CHUNO sobre D1 (SQLite).
--
-- Regla que atraviesa todas las tablas: TODO lleva negocio_id y TODA consulta lo
-- filtra. El aislamiento multi-tenant no es una capa de permisos encima, es la
-- forma de las tablas.
--
-- Idempotente a propósito: se puede correr sobre una base existente sin romperla.

-- ---------------------------------------------------------------- negocios ---
CREATE TABLE IF NOT EXISTS negocios (
  id            TEXT PRIMARY KEY,
  nombre        TEXT NOT NULL,
  -- "por-encargo" | "generico". Determina el prompt y las herramientas activas.
  giro          TEXT NOT NULL DEFAULT 'por-encargo',
  zona_horaria  TEXT NOT NULL DEFAULT 'America/Bogota',
  creado_en     TEXT NOT NULL
);

-- Configuración por negocio como pares clave/valor: agregar un ajuste no exige
-- una migración. Nunca guardar secretos aquí — esos van en Cloudflare.
CREATE TABLE IF NOT EXISTS settings (
  negocio_id  TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  clave       TEXT NOT NULL,
  valor       TEXT NOT NULL,
  PRIMARY KEY (negocio_id, clave)
);

-- ----------------------------------------------------------- conversaciones ---
CREATE TABLE IF NOT EXISTS conversaciones (
  id             TEXT PRIMARY KEY,
  negocio_id     TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  canal          TEXT NOT NULL,               -- 'telegram' | 'whatsapp' | 'demo'
  canal_chat_id  TEXT NOT NULL,               -- id del chat en ese canal
  cliente_nombre TEXT,
  -- Cuando el agente escala a un humano, se pausa para no interrumpir al dueño
  -- mientras atiende. ISO 8601, o NULL si el bot está activo.
  pausado_hasta  TEXT,
  -- Última señal de vida del CLIENTE, para la ventana de 24 h de Meta. Se
  -- escribe con CUALQUIER evento suyo, incluidos los que no sabemos procesar
  -- (una foto, un sticker): Meta reinicia su ventana con todos ellos, y un
  -- reloj nuestro más conservador que el suyo nos haría pagar una plantilla
  -- pudiendo escribir gratis. Telegram no tiene ventana y deja esto en NULL.
  ultimo_cliente_en TEXT,
  creado_en      TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);

-- Un chat de un canal es una sola conversación dentro de un negocio.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_canal
  ON conversaciones (negocio_id, canal, canal_chat_id);

CREATE TABLE IF NOT EXISTS mensajes (
  id              TEXT PRIMARY KEY,
  negocio_id      TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  conversacion_id TEXT NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  autor           TEXT NOT NULL CHECK (autor IN ('cliente', 'agente', 'dueno')),
  texto           TEXT NOT NULL,
  -- Id del mensaje en su canal de origen. Es lo que hace que reprocesar un lote
  -- no duplique, y por eso el drenaje puede marcar una fila como procesada
  -- DESPUÉS de que el agente acuse recibo: al revés, un fallo al despertarlo
  -- dejaría el mensaje guardado y sin respuesta. NULL en lo que escribimos
  -- nosotros, que no viene de ningún canal.
  id_externo      TEXT,
  creado_en       TEXT NOT NULL
);

-- Sirve para leer el hilo en orden y para que la purga por retención sea barata.
CREATE INDEX IF NOT EXISTS idx_msg_hilo
  ON mensajes (negocio_id, conversacion_id, creado_en);
CREATE INDEX IF NOT EXISTS idx_msg_purga ON mensajes (creado_en);

-- El descarte de duplicados. Único pero permisivo de hecho: SQLite admite
-- muchos NULL en un índice único, así que los mensajes del agente y del dueño
-- nunca chocan entre sí.
--
-- OJO CON EL ORDEN al aplicar esto a una base que ya existe: este índice
-- necesita la columna id_externo, y si `schema.sql` corre antes que la
-- migración 002 falla con "no such column". Ver src/db/migraciones/LEEME.md.
CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_externo
  ON mensajes (negocio_id, id_externo);

-- ----------------------------------------------------------------- pedidos ---
-- El objeto que separa a CHUNO de un chatbot.
CREATE TABLE IF NOT EXISTS pedidos (
  id                 TEXT PRIMARY KEY,
  negocio_id         TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  conversacion_id    TEXT NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  cliente_nombre     TEXT NOT NULL,
  -- JSON: [{ descripcion, cantidad }]. Se valida con Zod al leer, no se confía
  -- en que la columna tenga forma correcta solo porque la escribimos nosotros.
  items_json         TEXT NOT NULL,
  -- Entero, en centavos. Nunca flotantes para dinero.
  monto_centavos     INTEGER,
  -- YYYY-MM-DD. Sin hora: la promesa al cliente es un día.
  fecha_comprometida TEXT,
  estado             TEXT NOT NULL CHECK (
    estado IN ('borrador','confirmado','en_proceso','listo','entregado','cancelado')
  ),
  notas              TEXT,
  creado_en          TEXT NOT NULL,
  actualizado_en     TEXT NOT NULL
);

-- La consulta del vigía: pedidos vivos de un negocio ordenados por compromiso.
CREATE INDEX IF NOT EXISTS idx_ped_vigia
  ON pedidos (negocio_id, estado, fecha_comprometida);
CREATE INDEX IF NOT EXISTS idx_ped_conv ON pedidos (negocio_id, conversacion_id);

-- --------------------------------------------------------------- propuestas ---
-- La bandeja de decisiones: nada sale al cliente sin pasar por aquí.
CREATE TABLE IF NOT EXISTS propuestas (
  id           TEXT PRIMARY KEY,
  negocio_id   TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL CHECK (
    tipo IN ('crear_pedido','cambiar_estado','cambiar_fecha','enviar_aviso')
  ),
  payload_json TEXT NOT NULL,
  motivo       TEXT NOT NULL,   -- en lenguaje de dueño, no de ingeniero
  confianza    REAL,
  estado       TEXT NOT NULL DEFAULT 'propuesta'
                 CHECK (estado IN ('propuesta','aplicada','descartada')),
  -- Evita que el vigía, que corre cada 30 minutos, proponga cuarenta veces el
  -- mismo aviso. Formato: 'aviso:<pedido_id>:<riesgo>'. NULL cuando no aplica —
  -- SQLite permite múltiples NULL en un índice único.
  clave_dedupe TEXT,
  creado_en    TEXT NOT NULL,
  resuelto_en  TEXT,
  resuelto_por TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prop_dedupe
  ON propuestas (negocio_id, clave_dedupe);
CREATE INDEX IF NOT EXISTS idx_prop_bandeja
  ON propuestas (negocio_id, estado, creado_en);

-- ----------------------------------------------------------------- tickets ---
-- Escalamiento: el agente se hace a un lado y avisa que hace falta un humano.
CREATE TABLE IF NOT EXISTS tickets (
  id              TEXT PRIMARY KEY,
  negocio_id      TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  conversacion_id TEXT NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  motivo          TEXT NOT NULL,
  estado          TEXT NOT NULL DEFAULT 'abierto'
                    CHECK (estado IN ('abierto','cerrado')),
  creado_en       TEXT NOT NULL,
  cerrado_en      TEXT
);

CREATE INDEX IF NOT EXISTS idx_ticket_abiertos
  ON tickets (negocio_id, estado, creado_en);

-- ------------------------------------------------------------- conocimiento ---
-- Base de conocimiento del negocio. Búsqueda por palabras clave sobre D1:
-- Vectorize exige plan pago y esto alcanza de sobra para un negocio pequeño.
-- Se cambia por embeddings detrás de la misma interfaz sin tocar el agente.
CREATE TABLE IF NOT EXISTS conocimiento (
  id         TEXT PRIMARY KEY,
  negocio_id TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  titulo     TEXT NOT NULL,
  contenido  TEXT NOT NULL,
  creado_en  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kb_negocio ON conocimiento (negocio_id);

-- --------------------------------------------------------------- auditoría ---
-- Append-only. Qué propuso el agente, quién lo aprobó y cuándo. Es criterio de
-- evaluación explícito del concurso y es lo que un dueño necesita para confiar.
-- Sin PII en el detalle: ids y descripciones, nunca teléfonos ni texto completo.
CREATE TABLE IF NOT EXISTS auditoria (
  id           TEXT PRIMARY KEY,
  negocio_id   TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  accion       TEXT NOT NULL,
  detalle_json TEXT NOT NULL,
  actor        TEXT NOT NULL,   -- 'agente' | 'admin' | 'cron'
  creado_en    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_negocio ON auditoria (negocio_id, creado_en);

-- ────────────────────────────────────────────────────────────────────  CRM ───
-- Se alimenta solo desde las conversaciones: no hay pantalla de captura y no
-- debe haberla. Si un dato exige que alguien lo escriba a mano, no va aquí.

CREATE TABLE IF NOT EXISTS contactos (
  id                  TEXT PRIMARY KEY,
  negocio_id          TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  nombre              TEXT NOT NULL,
  canal               TEXT NOT NULL,
  canal_chat_id       TEXT NOT NULL,
  primera_interaccion TEXT NOT NULL,
  ultima_interaccion  TEXT NOT NULL,
  total_mensajes      INTEGER NOT NULL DEFAULT 0
);

-- Una persona por canal y por negocio. El mismo índice que hace idempotente el
-- alta del contacto cuando llegan dos mensajes a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacto_canal
  ON contactos (negocio_id, canal, canal_chat_id);
CREATE INDEX IF NOT EXISTS idx_contacto_recientes
  ON contactos (negocio_id, ultima_interaccion);

CREATE TABLE IF NOT EXISTS leads (
  id                      TEXT PRIMARY KEY,
  negocio_id              TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  contacto_id             TEXT NOT NULL REFERENCES contactos(id) ON DELETE CASCADE,
  estado                  TEXT NOT NULL DEFAULT 'nuevo'
                            CHECK (estado IN ('nuevo','contactado','interesado','cliente','perdido')),
  interes                 TEXT,
  valor_estimado_centavos INTEGER,
  creado_en               TEXT NOT NULL,
  actualizado_en          TEXT NOT NULL
);

-- Un lead abierto por contacto: si vuelve a escribir sobre lo mismo, es el
-- mismo lead, no uno nuevo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_contacto ON leads (negocio_id, contacto_id);
CREATE INDEX IF NOT EXISTS idx_lead_estado ON leads (negocio_id, estado);

-- ─────────────────────────────────────────────────────────────  uso del LLM ───
-- Para poder responder "¿cuánto llevo gastado?" con un número y no con un
-- encogimiento de hombros.

CREATE TABLE IF NOT EXISTS uso_llm (
  id             TEXT PRIMARY KEY,
  negocio_id     TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  modelo         TEXT NOT NULL,
  tokens_entrada INTEGER NOT NULL DEFAULT 0,
  tokens_salida  INTEGER NOT NULL DEFAULT 0,
  exito          INTEGER NOT NULL DEFAULT 1,
  creado_en      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_uso_negocio ON uso_llm (negocio_id, creado_en);

-- ──────────────────────────────────────────────────  conocimiento con forma ───
-- El catálogo y las FAQ son la parte del conocimiento que tiene estructura:
-- un producto tiene precio y tiempo de entrega, una FAQ tiene pregunta y
-- respuesta. La tabla `conocimiento` (texto libre) sigue para lo narrativo.

CREATE TABLE IF NOT EXISTS catalogo (
  id              TEXT PRIMARY KEY,
  negocio_id      TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  descripcion     TEXT,
  -- Entero, en centavos. NULL = "precio por confirmar".
  precio_centavos INTEGER,
  dias_entrega    INTEGER,
  -- Llave del objeto en KV, no la imagen. La foto no vive en la base: cada
  -- consulta del agente al catálogo se traería los bytes sin necesitarlos, y
  -- eso se paga en latencia justo mientras un cliente espera respuesta.
  imagen_clave    TEXT,
  creado_en       TEXT NOT NULL,
  actualizado_en  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_catalogo_negocio ON catalogo (negocio_id, nombre);

CREATE TABLE IF NOT EXISTS faq (
  id             TEXT PRIMARY KEY,
  negocio_id     TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  pregunta       TEXT NOT NULL,
  respuesta      TEXT NOT NULL,
  creado_en      TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_faq_negocio ON faq (negocio_id);

-- ────────────────────────────────────────────────────────────  credenciales ───
-- Credenciales por negocio (token del bot, secreto del webhook), SIEMPRE
-- cifradas con AES-GCM. La llave maestra vive en secretos de Cloudflare
-- (CLAVE_CIFRADO): la base sola no alcanza para hablar por los bots.

CREATE TABLE IF NOT EXISTS credenciales (
  negocio_id     TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  clave          TEXT NOT NULL,
  valor_cifrado  TEXT NOT NULL,
  actualizado_en TEXT NOT NULL,
  PRIMARY KEY (negocio_id, clave)
);

-- ─────────────────────────────────────────────────────────────  entrevistas ───
-- El estado de la entrevista de onboarding. El negocio se crea al responder la
-- primera pregunta (el nombre), así que la fila nace ya con su negocio_id — y
-- una entrevista por negocio: la clave primaria ES el negocio.

CREATE TABLE IF NOT EXISTS entrevistas (
  negocio_id     TEXT PRIMARY KEY REFERENCES negocios(id) ON DELETE CASCADE,
  estado_json    TEXT NOT NULL,
  creado_en      TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);

-- --------------------------------------------------------------- entrantes ---
-- La bandeja de entrada de los canales que llegan en lote (la familia Meta).
--
-- Existe por una razón y solo una: Meta manda hasta 1000 actualizaciones por
-- POST y reintenta durante 36 horas ante fallo, así que hay que responder 200
-- YA. Si respondiéramos 200 y procesáramos después, un Worker que muere a mitad
-- pierde el lote EN SILENCIO — porque Meta ya se fue tranquilo y no reintenta.
-- Escribir aquí ANTES de responder mueve la durabilidad del proceso a la base.
--
-- Y la llave primaria compuesta ES el índice de idempotencia: la segunda
-- entrega del mismo lote choca contra ella y el INSERT OR IGNORE la descarta.
-- Sin eso, el reintento de Meta no es una red sino una tormenta de duplicados.
CREATE TABLE IF NOT EXISTS entrantes (
  negocio_id    TEXT NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
  canal         TEXT NOT NULL,               -- whatsapp | messenger | instagram
  id_externo    TEXT NOT NULL,               -- wamid o mid
  -- El MensajeEntrante ya normalizado, como JSON. Se guarda interpretado y no
  -- crudo porque interpretar es puro y barato: hacerlo en la ruta deja la
  -- bandeja pequeña y el drenaje tonto.
  carga         TEXT NOT NULL,
  creado_en     TEXT NOT NULL,
  procesado_en  TEXT,                        -- NULL mientras esté pendiente
  PRIMARY KEY (negocio_id, canal, id_externo)
);

-- Lo que barre el cron: los pendientes de un negocio.
CREATE INDEX IF NOT EXISTS idx_entrantes_pendientes
  ON entrantes (negocio_id, procesado_en);
