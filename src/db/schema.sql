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
  creado_en       TEXT NOT NULL
);

-- Sirve para leer el hilo en orden y para que la purga por retención sea barata.
CREATE INDEX IF NOT EXISTS idx_msg_hilo
  ON mensajes (negocio_id, conversacion_id, creado_en);
CREATE INDEX IF NOT EXISTS idx_msg_purga ON mensajes (creado_en);

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
