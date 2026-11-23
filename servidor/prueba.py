"""Prueba de punta a punta. Requiere el servidor en :8799 y una base creada con
CASA_ADMIN_PASS=clave-prueba crear_bd.py --correo prueba@casa.test  (¡borra los datos!).
"""
import asyncio
import json
import os
import urllib.request

import psycopg

import websockets

B, W = "http://127.0.0.1:8799", "ws://127.0.0.1:8799/ws"
TOKEN_PUENTE = psycopg.connect(os.environ["CASA_DB"]).execute("SELECT token_puente FROM casas ORDER BY id LIMIT 1").fetchone()[0]


def api(ruta, datos=None, tok=None, metodo=None):
    hd = {"Content-Type": "application/json", **({"Authorization": "Bearer " + tok} if tok else {})}
    r = urllib.request.Request(B + ruta, json.dumps(datos).encode() if datos is not None else None, hd,
                               method=metodo or ("POST" if datos is not None else "GET"))
    try:
        x = urllib.request.urlopen(r).read()
        return json.loads(x) if x else None
    except urllib.error.HTTPError as e:
        return e.code


async def recibir(w, tipo, t=3):
    while True:
        m = json.loads(await asyncio.wait_for(w.recv(), t))
        if m.get("tipo") == tipo:
            return m


async def nada(w, tipo, t=1):
    try:
        await recibir(w, tipo, t)
        raise SystemExit(f"llegó un {tipo} que no debía")
    except asyncio.TimeoutError:
        pass


async def main():
    assert api("/api/login", {"correo": "prueba@casa.test", "contrasena": "mala"}) == 401
    adm = api("/api/login", {"correo": "prueba@casa.test", "contrasena": "clave-prueba"})["token"]
    assert api("/api/yo", tok=adm)["rol"] == "admin"
    casa = api("/api/casas", tok=adm)[0]
    cid = casa["id"]
    ds = {d["canal"]: d for h in api(f"/api/casas/{cid}/habitaciones", tok=adm) for d in h["dispositivos"]}

    async with websockets.connect(W) as app, websockets.connect(W) as pu:
        await app.send(json.dumps({"tipo": "hola", "rol": "app", "token": adm}))
        await recibir(app, "listo")
        await app.send(json.dumps({"tipo": "seleccionar", "idCasa": cid}))
        est = await recibir(app, "estado")
        assert len(est["dispositivos"]) == 4 and not est["puenteConectado"] and "token_puente" not in est["casa"]

        async with websockets.connect(W) as malo:  # puente con clave falsa
            await malo.send(json.dumps({"tipo": "hola", "rol": "puente", "token": "falsa"}))
            try:
                await malo.recv()
                raise SystemExit("puente falso aceptado")
            except websockets.ConnectionClosed as e:
                assert e.rcvd.code == 4401

        await pu.send(json.dumps({"tipo": "hola", "rol": "puente", "token": TOKEN_PUENTE}))
        assert (await recibir(app, "estado"))["puenteConectado"]

        # reglas por flanco: movimiento -> LED y aviso
        await pu.send(json.dumps({"tipo": "lectura", "canal": "mov", "valor": "1"}))
        assert await recibir(pu, "accion") == {"tipo": "accion", "canal": "led", "accion": "encender"}
        assert "Movimiento" in (await recibir(app, "notificacion"))["mensaje"]
        await pu.send(json.dumps({"tipo": "lectura", "canal": "luz", "valor": "2300"}))
        assert (await recibir(pu, "accion"))["accion"] == "cerrar"
        await pu.send(json.dumps({"tipo": "lectura", "canal": "luz", "valor": "2310"}))
        await nada(pu, "accion")  # sigue cumpliéndose: no se repite
        await pu.send(json.dumps({"tipo": "lectura", "canal": "luz", "valor": "abc"}))  # lectura corrupta: se ignora

        # control manual y posición de la cortina
        await app.send(json.dumps({"tipo": "control", "idDisp": ds["cortina"]["id"], "accion": "posicion", "valor": 40}))
        assert await recibir(pu, "accion") == {"tipo": "accion", "canal": "cortina", "accion": "posicion", "valor": 40}
        await pu.send(json.dumps({"tipo": "confirmacion", "canal": "cortina", "valor": "40"}))
        while next(d for d in (await recibir(app, "estado"))["dispositivos"] if d["canal"] == "cortina")["estado"] != "40":
            pass  # timeout de recibir() si nunca llega
        await app.send(json.dumps({"tipo": "control", "idDisp": ds["led"]["id"], "accion": "abrir"}))
        await nada(pu, "accion")  # acción que el LED no acepta

        # sistema apagado: no hay reglas; modo ausente: alerta
        assert api(f"/api/casas/{cid}", {"estado_sistema": "apagado", "modo_ausente": True}, adm, "PATCH")["modo_ausente"]
        assert (await recibir(pu, "accion"))["accion"] == "apagar"
        await pu.send(json.dumps({"tipo": "lectura", "canal": "mov", "valor": "0"}))
        await pu.send(json.dumps({"tipo": "lectura", "canal": "mov", "valor": "1"}))
        assert "modo ausente" in (await recibir(app, "notificacion"))["mensaje"]
        await nada(pu, "accion")
        api(f"/api/casas/{cid}", {"estado_sistema": "encendido", "modo_ausente": False}, adm, "PATCH")

        # crear, editar y borrar una regla
        assert api(f"/api/casas/{cid}/reglas", {"nombre": "x", "id_sensor": ds["led"]["id"], "operador": ">=", "valor": 1,
                                                 "comando": "encender", "id_actuador": ds["led"]["id"]}, adm) == 422
        r = api(f"/api/casas/{cid}/reglas", {"nombre": "Luz media", "id_sensor": ds["luz"]["id"], "operador": "<=", "valor": 500,
                                              "comando": "encender", "id_actuador": ds["led"]["id"]}, adm)
        assert api(f"/api/reglas/{r['id']}", {"valor": 450}, adm, "PATCH")["valor"] == 450
        assert api(f"/api/reglas/{r['id']}", {"comando": "abrir"}, adm, "PATCH") == 422
        assert api(f"/api/reglas/{r['id']}", tok=adm, metodo="DELETE") is None

        # horario: se ejecuta en el minuto actual
        import datetime
        if datetime.datetime.now().second > 40:  # el reloj revisa cada 15 s: no crear al final del minuto
            await asyncio.sleep(61 - datetime.datetime.now().second)
        ahora = datetime.datetime.now().strftime("%H:%M")
        h = api(f"/api/casas/{cid}/horarios", {"nombre": "Prueba", "hora": ahora, "dias": "1234567",
                                                "id_actuador": ds["led"]["id"], "comando": "apagar"}, adm)
        assert h["hora"].startswith(ahora)
        assert (await recibir(pu, "accion", 20))["accion"] == "apagar"
        assert api(f"/api/horarios/{h['id']}", {"activo": False}, adm, "PATCH")["activo"] is False

    # historial
    hist = api(f"/api/casas/{cid}/historial?horas=24", tok=adm)
    tipos = {s["tipo"]: s for s in hist["series"]}
    assert tipos["sensor_luz"]["puntos"] and tipos["sensor_movimiento"]["puntos"]

    # cliente nuevo: sin casa, pide una, el admin la aprueba -> casa nueva suya
    cli = api("/api/registro", {"nombre": "Cliente", "correo": "cli@casa.test", "contrasena": "clave-cliente"})["token"]
    assert api("/api/registro", {"nombre": "Cliente", "correo": "cli@casa.test", "contrasena": "clave-cliente"}) == 409
    assert api("/api/casas", tok=cli) == []
    assert api(f"/api/casas/{cid}/reglas", tok=cli) == 403
    s = api("/api/solicitudes", {"tipo": "casa", "descripcion": "Calle 1 # 2-3"}, cli)
    assert api(f"/api/solicitudes/{s['id']}", {"aprobar": True}, cli) == 403
    assert api(f"/api/solicitudes/{s['id']}", {"aprobar": True}, adm) is None
    assert api(f"/api/solicitudes/{s['id']}", {"aprobar": True}, adm) == 409
    mias = api("/api/casas", tok=cli)
    assert [c["direccion"] for c in mias] == ["Calle 1 # 2-3"]
    nueva = mias[0]["id"]
    hab = api(f"/api/casas/{nueva}/habitaciones", tok=cli)[0]
    assert api(f"/api/habitaciones/{hab['id']}/dispositivos", {"nombre": "Foco", "tipo": "led", "canal": "led"}, cli) == 403
    assert api(f"/api/habitaciones/{hab['id']}/dispositivos", {"nombre": "Foco", "tipo": "led", "canal": "luz"}, adm) == 422
    d = api(f"/api/habitaciones/{hab['id']}/dispositivos", {"nombre": "Foco", "tipo": "led", "canal": "led"}, adm)
    assert api(f"/api/habitaciones/{hab['id']}/dispositivos", {"nombre": "Otro", "tipo": "led", "canal": "led"}, adm) == 409
    assert api(f"/api/casas/{nueva}/habitaciones", {"nombre": "Cocina"}, adm)["nombre"] == "Cocina"
    assert api(f"/api/dispositivos/{d['id']}", tok=adm, metodo="DELETE") is None
    # solicitud completa de casa: plano en cuadrícula + dispositivos por habitación
    plano = {"direccion": "Cra 7 # 10-20", "tipo_vivienda": "apartamento", "ancho": 8, "largo": 6, "comentarios": "",
             "habitaciones": [
                 {"nombre": "Sala", "tipo": "sala", "x": 0, "y": 0, "w": 5, "h": 4,
                  "dispositivos": [{"tipo": "led", "cantidad": 2}, {"tipo": "sensor_movimiento", "cantidad": 1}]},
                 {"nombre": "Cocina", "tipo": "cocina", "x": 5, "y": 0, "w": 3, "h": 3, "dispositivos": [{"tipo": "camara", "cantidad": 1}]}]}
    malo = {**plano, "habitaciones": [*plano["habitaciones"], {"nombre": "Baño", "tipo": "bano", "x": 4, "y": 3, "w": 2, "h": 2}]}
    assert api("/api/solicitudes", {"tipo": "casa", "detalle": malo}, cli) == 422  # se cruza con la sala
    assert api("/api/solicitudes", {"tipo": "casa", "detalle": {**plano, "ancho": 4}}, cli) == 422  # se sale
    s2 = api("/api/solicitudes", {"tipo": "casa", "detalle": plano}, cli)
    assert "8×6 m" in s2["descripcion"] and s2["detalle"]["habitaciones"][0]["nombre"] == "Sala"
    assert api(f"/api/solicitudes/{s2['id']}", {"aprobar": True}, adm) is None
    c2 = next(c for c in api("/api/casas", tok=cli) if c["direccion"] == "Cra 7 # 10-20")
    assert c2["plano"]["ancho"] == 8
    habs2 = api(f"/api/casas/{c2['id']}/habitaciones", tok=cli)
    assert [h["nombre"] for h in habs2] == ["Sala", "Cocina"]
    assert sorted(d["nombre"] for d in habs2[0]["dispositivos"]) == ["Luz inteligente 1", "Luz inteligente 2", "Sensor de movimiento"]
    assert habs2[1]["dispositivos"][0]["tipo"] == "camara" and habs2[1]["dispositivos"][0]["canal"] is None
    # pedido de dispositivos para una habitación nueva
    assert api("/api/solicitudes", {"tipo": "dispositivo", "detalle": {"id_casa": cid, "nueva_habitacion": "x", "dispositivos": [{"tipo": "led", "cantidad": 1}]}}, cli) == 403
    s3 = api("/api/solicitudes", {"tipo": "dispositivo", "detalle": {"id_casa": c2["id"], "nueva_habitacion": "Estudio",
                                                                        "dispositivos": [{"tipo": "sensor_luz", "cantidad": 1}]}}, cli)
    assert api(f"/api/solicitudes/{s3['id']}", {"aprobar": True}, adm) is None
    est = api(f"/api/casas/{c2['id']}/habitaciones", tok=cli)[-1]
    assert est["nombre"] == "Estudio" and est["dispositivos"][0]["tipo"] == "sensor_luz"
    # el admin conecta un dispositivo pedido a un canal del Arduino
    luz = habs2[0]["dispositivos"][0]
    assert api(f"/api/dispositivos/{luz['id']}", {"canal": "luz"}, adm, "PATCH") == 422
    assert api(f"/api/dispositivos/{luz['id']}", {"canal": "led"}, adm, "PATCH")["canal"] == "led"
    assert api(f"/api/dispositivos/{luz['id']}", {"canal": "led"}, cli, "PATCH") == 403
    assert any("aprobada" in n["mensaje"] for n in api("/api/notificaciones", tok=cli))
    assert api("/api/notificaciones/leidas", {}, cli) is None
    assert not any(not n["leida"] for n in api("/api/notificaciones", tok=cli))
    assert api("/api/admin/usuarios", tok=cli) == 403 and len(api("/api/admin/usuarios", tok=adm)) == 2

    # la sesión vive en la base: logout la invalida
    assert api("/api/logout", {}, cli) is None and api("/api/yo", tok=cli) == 401
    print("TODO OK")


asyncio.run(main())
