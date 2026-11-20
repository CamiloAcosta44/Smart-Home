-- v3: solicitudes completas (plano de la casa y catálogo de dispositivos). No borra datos.
ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS detalle JSONB;
ALTER TABLE casas ADD COLUMN IF NOT EXISTS plano JSONB;
ALTER TABLE dispositivos DROP CONSTRAINT IF EXISTS dispositivos_tipo_check;
ALTER TABLE dispositivos ADD CONSTRAINT dispositivos_tipo_check CHECK (tipo IN (
  'sensor_movimiento', 'sensor_luz', 'led', 'cortina',
  'sensor_temperatura', 'sensor_puerta', 'enchufe', 'camara', 'alarma'));
