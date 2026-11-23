"""Programa puente del PC servidor (ClienteServidor en el UML).

Lee el puerto serie del Arduino y reenvía por WebSocket (JSON) al servidor;
las acciones que llegan del servidor se escriben al Arduino. Si el servidor se
reinicia, el puente se vuelve a conectar solo.

  Arduino real:      python puente.py --puerto /dev/ttyACM0
  Simulado (Wokwi):  python puente.py --sim [--escenario demo.yaml] [--minutos 5]

Opciones: --servidor ws://host:8765/ws (o variable CASA_SERVIDOR; por defecto ws://localhost:8765/ws)
          --token CLAVE  clave del puente de la casa (o variable CASA_TOKEN_PUENTE,
                         o el archivo token_puente.txt junto a este programa).
"""
import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

import websockets

AQUI = Path(__file__).resolve().parent
PROYECTO = AQUI.parent
CANALES = {"mov", "luz", "led", "led2", "cortina"}


def accion_a_serial(m):
    """{'canal': 'led', 'accion': 'encender'} -> 'CMD led 1'; acción desconocida -> None."""
    c, a = m.get("canal"), m.get("accion")
    if c in ("led", "led2") and a in ("encender", "apagar"):
        return f"CMD {c} {1 if a == 'encender' else 0}"
    if c == "cortina" and a in ("abrir", "cerrar"):
        return f"CMD cortina {100 if a == 'abrir' else 0}"
    if c == "cortina" and a == "posicion":
        return f"CMD cortina {max(0, min(100, int(m.get('valor', 0))))}"
    return None


def serial_a_json(linea):
    """'EVT luz 512' -> lectura; 'OK led 1' -> confirmacion; otra cosa -> None."""
    p = linea.split()
    if len(p) == 3 and p[0] in ("EVT", "OK") and p[1] in CANALES:
        return {"tipo": "lectura" if p[0] == "EVT" else "confirmacion", "canal": p[1], "valor": p[2]}
    return None


class PuertoSim:
    """El serial del Arduino simulado: stdin/stdout de `wokwi-cli --interactive`."""

    async def abrir(self, escenario, minutos):
        cli = os.path.expanduser("~/.wokwi/bin/wokwi-cli")
        args = [cli, "--interactive", "--timeout", str(minutos * 60_000), "--timeout-exit-code", "0"]
        if escenario:
            args += ["--scenario", str(Path(escenario).resolve())]
        self.p = await asyncio.create_subprocess_exec(
            *args, str(PROYECTO), stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE)

    async def leer(self):
        l = await self.p.stdout.readline()
        if not l:
            raise EOFError("la simulación terminó")
        return l.decode(errors="replace").strip()

    async def escribir(self, t):
        self.p.stdin.write((t + "\n").encode())
        await self.p.stdin.drain()


class PuertoReal:
    """El Arduino físico por USB."""

    def abrir(self, puerto):
        import serial
        self.s = serial.Serial(puerto, 115200, timeout=1)

    async def leer(self):
        while True:
            l = await asyncio.to_thread(self.s.readline)
            if l:
                return l.decode(errors="replace").strip()

    async def escribir(self, t):
        await asyncio.to_thread(self.s.write, (t + "\n").encode())


def leer_token(arg):
    if arg:
        return arg
    if os.environ.get("CASA_TOKEN_PUENTE"):
        return os.environ["CASA_TOKEN_PUENTE"]
    archivo = AQUI / "token_puente.txt"
    if archivo.exists():
        return archivo.read_text().strip()
    sys.exit("Falta la clave del puente: usa --token (la ves en la app, Admin > Casas)")


async def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--sim", action="store_true", help="usar el Arduino simulado en Wokwi")
    g.add_argument("--puerto", help="puerto serie del Arduino real, p. ej. /dev/ttyACM0")
    ap.add_argument("--servidor", default=os.environ.get("CASA_SERVIDOR", "ws://localhost:8765/ws"))
    ap.add_argument("--token", help="clave del puente de la casa")
    ap.add_argument("--escenario", help="YAML de Wokwi que mueve los sensores (solo --sim)")
    ap.add_argument("--minutos", type=int, default=5, help="duración máxima de la simulación (gasta cupo Wokwi CI)")
    a = ap.parse_args()
    token = leer_token(a.token)

    if a.sim:
        if not os.environ.get("WOKWI_CLI_TOKEN"):
            sys.exit("Falta la variable WOKWI_CLI_TOKEN")
        puerto = PuertoSim()
        await puerto.abrir(a.escenario, a.minutos)
    else:
        puerto = PuertoReal()
        puerto.abrir(a.puerto)

    cola = asyncio.Queue(maxsize=200)  # lecturas del Arduino mientras no hay servidor se descartan

    async def leer_arduino():
        while True:
            linea = await puerto.leer()
            print("ARDUINO >", linea, flush=True)
            m = serial_a_json(linea)
            if m and not cola.full():
                cola.put_nowait(m)

    async def con_servidor():
        espera = 1
        while True:
            try:
                async with websockets.connect(a.servidor) as ws:
                    await ws.send(json.dumps({"tipo": "hola", "rol": "puente", "token": token}))
                    print("Conectado al servidor", a.servidor, flush=True)
                    espera = 1
                    while not cola.empty():  # no mandar lecturas viejas
                        cola.get_nowait()

                    async def subir():
                        while True:
                            await ws.send(json.dumps(await cola.get()))

                    async def bajar():
                        async for raw in ws:
                            cmd = accion_a_serial(json.loads(raw))
                            if cmd:
                                print("ARDUINO <", cmd, flush=True)
                                await puerto.escribir(cmd)

                    async def latido():  # le dice al Arduino que el servidor sigue conectado
                        while True:
                            await puerto.escribir("HB")
                            await asyncio.sleep(5)

                    await asyncio.gather(subir(), bajar(), latido())
            except websockets.ConnectionClosed as e:
                if e.rcvd and e.rcvd.code == 4401:
                    sys.exit("El servidor rechazó la clave del puente")
                print("Servidor desconectado; reintentando…", flush=True)
            except OSError:
                print(f"No hay servidor en {a.servidor}; reintento en {espera} s", flush=True)
            await asyncio.sleep(espera)
            espera = min(espera * 2, 15)

    await asyncio.gather(leer_arduino(), con_servidor())


if __name__ == "__main__":
    assert serial_a_json("EVT luz 512") == {"tipo": "lectura", "canal": "luz", "valor": "512"}
    assert serial_a_json("OK cortina 0") == {"tipo": "confirmacion", "canal": "cortina", "valor": "0"}
    assert serial_a_json("Wokwi CLI v0.29.1") is None
    assert accion_a_serial({"canal": "led", "accion": "encender"}) == "CMD led 1"
    assert accion_a_serial({"canal": "cortina", "accion": "posicion", "valor": 150}) == "CMD cortina 100"
    assert accion_a_serial({"canal": "led", "accion": "abrir"}) is None
    try:
        asyncio.run(main())
    except (EOFError, KeyboardInterrupt) as e:
        print("Fin:", e or "interrumpido")
