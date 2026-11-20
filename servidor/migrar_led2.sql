-- LED 2 (pin 10): nuevo canal "led2" con las mismas reglas que el LED. No borra datos.
ALTER TABLE dispositivos DROP CONSTRAINT IF EXISTS dispositivos_canal_check;
ALTER TABLE dispositivos ADD CONSTRAINT dispositivos_canal_check CHECK (canal IN ('mov', 'luz', 'led', 'led2', 'cortina'));
-- Casa de prueba (id 1, sala id 1): dispositivo y sus dos reglas, si aún no existen.
INSERT INTO dispositivos (id_habitacion, nombre, tipo, canal)
  SELECT 1, 'Luz 2 (LED)', 'led', 'led2' WHERE NOT EXISTS (SELECT 1 FROM dispositivos WHERE canal = 'led2' AND id_habitacion = 1);
INSERT INTO reglas (id_casa, nombre, id_sensor, operador, valor, id_actuador, comando)
  SELECT 1, 'Movimiento enciende luz 2', 1, '==', 1, d.id, 'encender' FROM dispositivos d
  WHERE d.canal = 'led2' AND d.id_habitacion = 1 AND NOT EXISTS (SELECT 1 FROM reglas WHERE nombre = 'Movimiento enciende luz 2');
INSERT INTO reglas (id_casa, nombre, id_sensor, operador, valor, id_actuador, comando)
  SELECT 1, 'Sin movimiento apaga luz 2', 1, '==', 0, d.id, 'apagar' FROM dispositivos d
  WHERE d.canal = 'led2' AND d.id_habitacion = 1 AND NOT EXISTS (SELECT 1 FROM reglas WHERE nombre = 'Sin movimiento apaga luz 2');
