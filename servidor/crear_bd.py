"""Crea las tablas (schema.sql), la casa de prueba (la protoboard) y el usuario administrador.

  .venv/bin/python crear_bd.py --correo tu@correo.com --nombre "Tu nombre"   # base nueva (pide contraseña)
  .venv/bin/python crear_bd.py --conservar-usuarios                          # rehace todo menos los usuarios

¡Borra los demás datos! La clave del puente de la casa de prueba queda en ../wokwi/pc/token_puente.txt.
"""
import argparse
import getpass
import os
import secrets
from pathlib import Path

import bcrypt
import psycopg

ap = argparse.ArgumentParser()
ap.add_argument("--correo")
ap.add_argument("--nombre", default="Administrador")
ap.add_argument("--conservar-usuarios", action="store_true")
a = ap.parse_args()
if not a.correo and not a.conservar_usuarios:
    ap.error("usa --correo o --conservar-usuarios")

with psycopg.connect(os.environ.get("CASA_DB", "dbname=casa_inteligente"), autocommit=True) as c:
    viejos = []
    if a.conservar_usuarios:
        viejos = c.execute("SELECT id, nombre, correo, contrasena_hash, rol FROM usuarios ORDER BY id").fetchall()
    c.execute((Path(__file__).parent / "schema.sql").read_text())
    for u in viejos:
        c.execute("INSERT INTO usuarios (id, nombre, correo, contrasena_hash, rol) VALUES (%s, %s, %s, %s, %s)", u)
    if viejos:
        c.execute("SELECT setval('usuarios_id_seq', (SELECT max(id) FROM usuarios))")
    if a.correo:
        clave = os.environ.get("CASA_ADMIN_PASS") or getpass.getpass("Contraseña del administrador: ")
        h = bcrypt.hashpw(clave.encode(), bcrypt.gensalt()).decode()
        c.execute("INSERT INTO usuarios (nombre, correo, contrasena_hash, rol) VALUES (%s, %s, %s, 'admin')",
                  [a.nombre, a.correo.strip().lower(), h])
    (admin,) = c.execute("SELECT id FROM usuarios WHERE rol = 'admin' ORDER BY id LIMIT 1").fetchone()

    token = secrets.token_urlsafe(18)
    (casa,) = c.execute("INSERT INTO casas (direccion, id_propietario, token_puente) VALUES (%s, %s, %s) RETURNING id",
                        ["Casa de prueba (protoboard)", admin, token]).fetchone()
    (sala,) = c.execute("INSERT INTO habitaciones (id_casa, nombre) VALUES (%s, 'Sala') RETURNING id", [casa]).fetchone()
    ids = {}
    for nombre, tipo, canal in [("Sensor de movimiento", "sensor_movimiento", "mov"), ("Sensor de luz", "sensor_luz", "luz"),
                                ("Luz (LED)", "led", "led"), ("Luz 2 (LED)", "led", "led2"), ("Cortina", "cortina", "cortina")]:
        (ids[canal],) = c.execute("INSERT INTO dispositivos (id_habitacion, nombre, tipo, canal) VALUES (%s, %s, %s, %s) RETURNING id",
                                  [sala, nombre, tipo, canal]).fetchone()
    for nombre, sensor, op, valor, act, cmd, msg in [
        ("Movimiento enciende luces", "mov", "==", 1, "led", "encender", None),
        ("Sin movimiento apaga luces", "mov", "==", 0, "led", "apagar", None),
        ("Movimiento enciende luz 2", "mov", "==", 1, "led2", "encender", None),
        ("Sin movimiento apaga luz 2", "mov", "==", 0, "led2", "apagar", None),
        ("Mucha luz cierra cortina", "luz", ">=", 800, "cortina", "cerrar", None),
        ("Poca luz abre cortina", "luz", "<=", 200, "cortina", "abrir", None),
        ("Avisar movimiento", "mov", "==", 1, None, "notificar", "Movimiento detectado en la sala"),
    ]:
        c.execute("INSERT INTO reglas (id_casa, nombre, id_sensor, operador, valor, id_actuador, comando, mensaje) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                  [casa, nombre, ids[sensor], op, valor, ids.get(act), cmd, msg])

if "CASA_DB" in os.environ:  # base de pruebas: no tocar la clave del puente real
    print(f"Base lista. Clave del puente: {token}")
else:
    archivo = Path(__file__).resolve().parent.parent / "wokwi" / "pc" / "token_puente.txt"
    archivo.write_text(token + "\n")
    archivo.chmod(0o600)
    print(f"Base lista. Clave del puente de la casa de prueba guardada en {archivo}")
