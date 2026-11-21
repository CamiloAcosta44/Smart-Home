"""Dominio del UML v3: dispositivos y reglas.

GRASP Polimorfismo / SOLID Abierto-cerrado: un tipo nuevo de dispositivo, condición o acción
es una subclase más; los controladores no cambian.
Casa, Habitacion, Usuario, Solicitud, Notificacion y Evento siguen siendo filas (dict) del Repositorio.
"""


# ---------- Dispositivos ----------

class Dispositivo:
    """«abstract» en el UML. Los tipos del catálogo sin comportamiento propio (cámara, enchufe…) usan esta base."""
    tipo = None

    def __init__(self, fila: dict):
        self.id, self.nombre, self.estado = fila["id"], fila["nombre"], fila.get("estado")

    def obtenerEstado(self):
        return self.estado


class Sensor(Dispositivo):
    def generarEvento(self, valor: str) -> dict:
        """GRASP Creador: el sensor crea el Evento de su lectura."""
        return {"id_disp": self.id, "valor": valor}


class Actuador(Dispositivo):
    acciones = ()

    def acepta(self, accion: str) -> bool:
        return accion in self.acciones

    def ejecutarAccion(self, accion: str, valor=None):
        """Devuelve (accion, valor) listos para enviar, o None si el actuador no acepta la acción."""
        return (accion, valor) if self.acepta(accion) else None


class SensorLuz(Sensor):
    tipo = "sensor_luz"


class SensorMovimiento(Sensor):
    tipo = "sensor_movimiento"

    def hayMovimiento(self) -> bool:
        return self.estado == "1"


class LED(Actuador):
    tipo = "led"
    acciones = ("encender", "apagar")


class Servomotor:
    def __init__(self, angulo=0):
        self.angulo = angulo

    def mover(self, angulo: int):
        self.angulo = max(0, min(90, int(angulo)))  # la cortina usa de 0° (cerrada) a 90° (abierta)


class Cortina(Actuador):
    """Funciona con un Servomotor."""
    tipo = "cortina"
    acciones = ("abrir", "cerrar", "posicion")

    def __init__(self, fila: dict):
        super().__init__(fila)
        self.servo = Servomotor()
        self.porcentajeApertura = 0

    def ajustarApertura(self, p) -> int:
        """GRASP Experto: la cortina sabe que su apertura va de 0 a 100 %."""
        self.porcentajeApertura = max(0, min(100, int(p)))
        self.servo.mover(self.porcentajeApertura * 90 // 100)
        return self.porcentajeApertura

    def ejecutarAccion(self, accion: str, valor=None):
        if accion == "posicion":
            valor = self.ajustarApertura(valor)
        return super().ejecutarAccion(accion, valor)


TIPOS = {c.tipo: c for c in (SensorLuz, SensorMovimiento, LED, Cortina)}


def crearDispositivo(fila: dict) -> Dispositivo:
    return TIPOS.get(fila["tipo"], Dispositivo)(fila)


# ---------- Regla = Condicion + Accion(es) ----------

class Condicion:
    """«interface»"""
    def evaluar(self, idDisp, valor) -> bool:
        raise NotImplementedError


class CondicionUmbral(Condicion):
    def __init__(self, idSensor, operador, valor):
        self.idSensor, self.operador, self.valor = idSensor, operador, valor

    def evaluar(self, idDisp, valor) -> bool:
        if idDisp != self.idSensor:
            return False
        v = float(valor)
        return {">=": v >= self.valor, "<=": v <= self.valor, "==": v == self.valor}[self.operador]


class CondicionMovimiento(Condicion):
    """hay=True: se cumple cuando hay movimiento (1); hay=False: cuando no hay (0)."""
    def __init__(self, idSensor, hay: bool):
        self.idSensor, self.hay = idSensor, hay

    def evaluar(self, idDisp, valor) -> bool:
        return idDisp == self.idSensor and (str(valor) == "1") == self.hay


class Accion:
    """«interface»"""
    async def ejecutar(self, casa):
        raise NotImplementedError


class AccionActuador(Accion):
    def __init__(self, objetivo, comando, enviar):
        self.objetivo, self.comando, self.enviar = objetivo, comando, enviar

    async def ejecutar(self, casa):
        await self.enviar(self.objetivo, self.comando)


class AccionNotificar(Accion):
    def __init__(self, mensaje, notificar):
        self.mensaje, self.notificar = mensaje, notificar

    async def ejecutar(self, casa):
        await self.notificar(casa, self.mensaje)


class Regla:
    def __init__(self, id, nombre, activa, condicion: Condicion, acciones: list[Accion]):
        self.id, self.nombre, self.activa, self.condicion, self.acciones = id, nombre, activa, condicion, acciones

    def evaluar(self, idDisp, valor) -> bool:
        return self.activa and self.condicion.evaluar(idDisp, valor)

    async def ejecutar(self, casa):
        for a in self.acciones:
            await a.ejecutar(casa)

    @classmethod
    def desdeFila(cls, f: dict, enviar, notificar) -> "Regla":
        """Único lugar que decide qué Condicion y qué Accion corresponden a una fila de la tabla reglas.
        `enviar` y `notificar` llegan de fuera: el dominio no depende de los controladores (bajo acoplamiento)."""
        if f["operador"] == "==":
            cond = CondicionMovimiento(f["id_sensor"], f["valor"] == 1)
        else:
            cond = CondicionUmbral(f["id_sensor"], f["operador"], f["valor"])
        acc = (AccionNotificar(f["mensaje"], notificar) if f["comando"] == "notificar"
               else AccionActuador(f["id_actuador"], f["comando"], enviar))
        return cls(f["id"], f["nombre"], f["activa"], cond, [acc])


if __name__ == "__main__":  # autoprueba: python dominio.py
    assert CondicionMovimiento(1, True).evaluar(1, "1") and not CondicionMovimiento(1, True).evaluar(1, "0")
    assert CondicionMovimiento(1, False).evaluar(1, "0") and not CondicionMovimiento(1, False).evaluar(2, "0")
    assert CondicionUmbral(1, ">=", 800).evaluar(1, "900") and not CondicionUmbral(1, "<=", 200).evaluar(1, "300")
    c = crearDispositivo({"id": 1, "nombre": "c", "tipo": "cortina"})
    assert c.ejecutarAccion("posicion", 150) == ("posicion", 100) and c.servo.angulo == 90
    assert crearDispositivo({"id": 2, "nombre": "l", "tipo": "led"}).ejecutarAccion("abrir") is None
    assert isinstance(crearDispositivo({"id": 3, "nombre": "s", "tipo": "sensor_luz"}), Sensor)
    assert type(crearDispositivo({"id": 4, "nombre": "x", "tipo": "camara"})) is Dispositivo
    print("dominio OK")
