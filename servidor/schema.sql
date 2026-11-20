-- Casa Inteligente: tablas del repositorio (PostgreSQL), según UmlFinal.drawio.
DROP TABLE IF EXISTS sesiones, horarios, notificaciones, eventos, reglas, solicitudes, dispositivos, habitaciones, casas, usuarios CASCADE;

CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  correo TEXT NOT NULL UNIQUE,
  contrasena_hash TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'cliente' CHECK (rol IN ('cliente', 'admin'))
);

-- Se guarda el hash del token, no el token: si se filtra la base, las sesiones no sirven.
CREATE TABLE sesiones (
  token_hash TEXT PRIMARY KEY,
  id_usuario INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira TIMESTAMPTZ NOT NULL
);

-- token_puente: clave con la que el puente (PC con el Arduino) dice de qué casa es.
CREATE TABLE casas (
  id SERIAL PRIMARY KEY,
  direccion TEXT NOT NULL,
  estado_sistema TEXT NOT NULL DEFAULT 'encendido' CHECK (estado_sistema IN ('encendido', 'apagado')),
  modo_ausente BOOLEAN NOT NULL DEFAULT FALSE,
  id_propietario INT REFERENCES usuarios(id) ON DELETE SET NULL,
  token_puente TEXT NOT NULL UNIQUE,
  plano JSONB  -- plano de la solicitud (medidas y habitaciones), si la casa vino de una
);

CREATE TABLE habitaciones (
  id SERIAL PRIMARY KEY,
  id_casa INT NOT NULL REFERENCES casas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL
);

-- canal: nombre en el protocolo serial del Arduino (mov, luz, led, cortina); NULL = aún sin conectar.
CREATE TABLE dispositivos (
  id SERIAL PRIMARY KEY,
  id_habitacion INT NOT NULL REFERENCES habitaciones(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('sensor_movimiento', 'sensor_luz', 'led', 'cortina',
                                     'sensor_temperatura', 'sensor_puerta', 'enchufe', 'camara', 'alarma')),
  canal TEXT CHECK (canal IN ('mov', 'luz', 'led', 'led2', 'cortina')),
  estado TEXT
);

-- Regla = Condicion (sensor operador valor) + Accion (actuador comando | notificar mensaje).
CREATE TABLE reglas (
  id SERIAL PRIMARY KEY,
  id_casa INT NOT NULL REFERENCES casas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  id_sensor INT NOT NULL REFERENCES dispositivos(id) ON DELETE CASCADE,
  operador TEXT NOT NULL CHECK (operador IN ('>=', '<=', '==')),
  valor REAL NOT NULL,
  id_actuador INT REFERENCES dispositivos(id) ON DELETE CASCADE,
  comando TEXT NOT NULL CHECK (comando IN ('encender', 'apagar', 'abrir', 'cerrar', 'notificar')),
  mensaje TEXT,
  activa BOOLEAN NOT NULL DEFAULT TRUE
);

-- Horario: a la hora dada, en los días dados (1 = lunes ... 7 = domingo), ejecuta el comando.
CREATE TABLE horarios (
  id SERIAL PRIMARY KEY,
  id_casa INT NOT NULL REFERENCES casas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  hora TIME NOT NULL,
  dias TEXT NOT NULL DEFAULT '1234567',
  id_actuador INT NOT NULL REFERENCES dispositivos(id) ON DELETE CASCADE,
  comando TEXT NOT NULL CHECK (comando IN ('encender', 'apagar', 'abrir', 'cerrar')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  ultima DATE  -- último día en que se ejecutó, para no repetirlo
);

CREATE TABLE eventos (
  id SERIAL PRIMARY KEY,
  id_disp INT NOT NULL REFERENCES dispositivos(id) ON DELETE CASCADE,
  valor TEXT NOT NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX eventos_disp_fecha ON eventos (id_disp, fecha);

CREATE TABLE notificaciones (
  id SERIAL PRIMARY KEY,
  id_usuario INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  mensaje TEXT NOT NULL,
  leida BOOLEAN NOT NULL DEFAULT FALSE,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE solicitudes (
  id SERIAL PRIMARY KEY,
  id_usuario INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('casa', 'dispositivo')),
  descripcion TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  detalle JSONB,  -- plano de la casa o lista de dispositivos pedidos
  fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);
