"""Backend mínimo de la Casa Inteligente (capa de aplicación).

Servidor WebSocket. El programa puente le envía lecturas y recibe acciones;
cualquier otro cliente (la app de escritorio, ver_estado.py) recibe el estado.

Clases según UmlFinal.drawio (versión reducida, sin BD ni login):
  ControladorAutomatizacion.procesarLectura -> evaluarReglas -> Regla(Condicion, Accion)

Uso:  python servidor.py [--puerto 8765]
"""
import argparse
import asyncio
import json
from dataclasses import dataclass
from datetime import datetime

import websockets

# idDisp de la casa de prueba (en el sistema real salen de PostgreSQL).
SENSOR_MOV, SENSOR_LUZ, LED, CORTINA = 1, 2, 3, 4
NOMBRES = {SENSOR_MOV: "movimiento", SENSOR_LUZ: "luz", LED: "led", CORTINA: "cortina"}


@dataclass
class Evento:
    idDisp: int
    valor: str
    fecha: datetime


@dataclass
class CondicionUmbral:
    idDisp: int
    operador: str  # ">=" | "<="
    valor: float

    def cumple(self, e: Evento) -> bool:
        if e.idDisp != self.idDisp:
            return False
        v = float(e.valor)
        return v >= self.valor if self.operador == ">=" else v <= self.valor


@dataclass
class CondicionMovimiento:
    hayMovimiento: bool

    def cumple(self, e: Evento) -> bool:
        return e.idDisp == SENSOR_MOV and (e.valor == "1") == self.hayMovimiento


@dataclass
class AccionActuador:
    objetivo: int
    comando: str  # encender | apagar | abrir | cerrar


@dataclass
class Regla:
    nombre: str
    condicion: object
    accion: AccionActuador
    activa: bool = True

    def evaluar(self, e: Evento) -> bool:
        return self.activa and self.condicion.cumple(e)


# ponytail: reglas fijas en código; vienen de la tabla reglas cuando haya PostgreSQL.
# Umbrales de luz con histéresis (800/200 lux) para que la cortina no oscile.
REGLAS = [
    Regla("Movimiento enciende luces", CondicionMovimiento(True), AccionActuador(LED, "encender")),
    Regla("Sin movimiento apaga luces", CondicionMovimiento(False), AccionActuador(LED, "apagar")),
    Regla("Mucha luz cierra cortina", CondicionUmbral(SENSOR_LUZ, ">=", 800), AccionActuador(CORTINA, "cerrar")),
    Regla("Poca luz abre cortina", CondicionUmbral(SENSOR_LUZ, "<=", 200), AccionActuador(CORTINA, "abrir")),
]


class ControladorAutomatizacion:
    def __init__(self):
        self.puentes = set()   # ClienteServidor del PC con el Arduino
        self.clientes = set()  # apps que solo ven el estado
        self.estado = {"movimiento": None, "luz": None, "led": None, "cortina": None}
        self.pedido = {}       # última acción enviada por actuador, para no repetirla

    async def procesarLectura(self, idDisp: int, valor: str):
        e = Evento(idDisp, valor, datetime.now())
        self.estado[NOMBRES[idDisp]] = valor
        await self.evaluarReglas(e)
        await self.publicarEstado()

    async def evaluarReglas(self, e: Evento):
        for r in REGLAS:
            if r.evaluar(e) and self.pedido.get(r.accion.objetivo) != r.accion.comando:
                self.pedido[r.accion.objetivo] = r.accion.comando
                log(f"REGLA  «{r.nombre}» -> {NOMBRES[r.accion.objetivo]} {r.accion.comando}")
                msg = json.dumps({"tipo": "accion", "idDisp": r.accion.objetivo, "accion": r.accion.comando})
                websockets.broadcast(self.puentes, msg)

    async def publicarEstado(self):
        websockets.broadcast(self.clientes, json.dumps({"tipo": "estado", **self.estado}))

    async def atender(self, ws):
        rol = None
        try:
            async for raw in ws:
                m = json.loads(raw)
                if m["tipo"] == "hola":
                    rol = m.get("rol")
                    (self.puentes if rol == "puente" else self.clientes).add(ws)
                    log(f"CONEXION {rol}")
                    if rol != "puente":
                        await ws.send(json.dumps({"tipo": "estado", **self.estado}))
                elif m["tipo"] == "lectura":
                    await self.procesarLectura(int(m["idDisp"]), str(m["valor"]))
                elif m["tipo"] == "confirmacion":
                    self.estado[NOMBRES[int(m["idDisp"])]] = str(m["valor"])
                    log(f"ARDUINO confirmó {NOMBRES[int(m['idDisp'])]} = {m['valor']}")
                    await self.publicarEstado()
        except (json.JSONDecodeError, KeyError, ValueError) as err:
            log(f"mensaje inválido de {rol}: {err}")
        finally:
            self.puentes.discard(ws)
            self.clientes.discard(ws)


def log(t):
    print(datetime.now().strftime("%H:%M:%S"), t, flush=True)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--puerto", type=int, default=8765)
    a = ap.parse_args()
    c = ControladorAutomatizacion()
    async with websockets.serve(c.atender, "0.0.0.0", a.puerto):
        log(f"Servidor en ws://0.0.0.0:{a.puerto}")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
