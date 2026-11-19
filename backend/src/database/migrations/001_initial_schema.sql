PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS usuario (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  contrasena_hash TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('Alumno', 'Docente', 'Bibliotecario')),
  suspendido_hasta TEXT NULL,
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sesion (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuario(id),
  creada_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS titulo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  autor TEXT NOT NULL,
  isbn TEXT NULL,
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ejemplar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo_id INTEGER NOT NULL REFERENCES titulo(id),
  codigo TEXT NOT NULL UNIQUE,
  solo_en_sala INTEGER NOT NULL DEFAULT 0 CHECK (solo_en_sala IN (0, 1)),
  estado TEXT NOT NULL CHECK (estado IN ('disponible', 'reservado', 'prestado', 'en_reparacion'))
);

CREATE TABLE IF NOT EXISTS feriado (
  fecha TEXT PRIMARY KEY,
  descripcion TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reserva (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuario(id),
  titulo_id INTEGER NOT NULL REFERENCES titulo(id),
  ejemplar_id INTEGER NULL REFERENCES ejemplar(id),
  estado TEXT NOT NULL CHECK (estado IN ('confirmada', 'desactivada', 'retirada', 'vencida', 'cancelada')),
  creada_en TEXT NOT NULL,
  vence_retiro_en TEXT NULL,
  corrimiento_informado TEXT NULL,
  desactivada_motivo TEXT NULL CHECK (desactivada_motivo IS NULL OR desactivada_motivo IN ('suspension', 'reparacion')),
  orden_cola_en TEXT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reserva_ejemplar_activa
  ON reserva(ejemplar_id)
  WHERE estado = 'confirmada' AND ejemplar_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS cupo_penalizado (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuario(id),
  reserva_id INTEGER NOT NULL UNIQUE REFERENCES reserva(id),
  penalizado_hasta TEXT NOT NULL,
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prestamo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reserva_id INTEGER NOT NULL UNIQUE REFERENCES reserva(id),
  usuario_id INTEGER NOT NULL REFERENCES usuario(id),
  ejemplar_id INTEGER NOT NULL REFERENCES ejemplar(id),
  retirado_en TEXT NOT NULL,
  vence_en TEXT NOT NULL,
  renovado INTEGER NOT NULL DEFAULT 0 CHECK (renovado IN (0, 1)),
  devuelto_en TEXT NULL,
  dias_atraso INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lista_espera (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo_id INTEGER NOT NULL REFERENCES titulo(id),
  usuario_id INTEGER NOT NULL REFERENCES usuario(id),
  reserva_desactivada_id INTEGER NULL REFERENCES reserva(id),
  estado TEXT NOT NULL CHECK (estado IN ('esperando', 'avisado', 'confirmado', 'expirado', 'cancelado')),
  orden_en TEXT NOT NULL,
  avisado_en TEXT NULL,
  confirmar_hasta TEXT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_espera_usuario_titulo_activa
  ON lista_espera(titulo_id, usuario_id)
  WHERE estado IN ('esperando', 'avisado') AND reserva_desactivada_id IS NULL;
