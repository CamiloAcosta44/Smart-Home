"""Servidor de la Casa Inteligente (capa de aplicación), según UmlFinal_v3.drawio (dominio en dominio.py).

Es la API; además sirve la app del usuario (../app) para que todo salga de un solo dominio.

  puente.py (PC con el Arduino de cada casa) ──WebSocket /ws──┐
  app del usuario (navegador)                ──WebSocket /ws──┤── ControladorAutomatizacion / ControladorHogar
                                             ──REST /api/*────┘   ControladorSolicitudes / ControladorAdministracion
                                                                   └── RepositorioPostgres ── PostgreSQL
Correr:  .venv/bin/uvicorn app:app --host 0.0.0.0 --port 8765

Patrones (ver también la leyenda del diagrama):
  GRASP Controlador ........ los 4 controladores reciben todo lo que llega de la UI y del puente.
  GRASP Fabricación Pura ... ServicioAutenticacion, ServicioNotificaciones y RepositorioPostgres no son del dominio:
                             existen para que el dominio no cargue con BD, contraseñas ni envíos.
  GRASP Polimorfismo / SOLID O, L .. en dominio.py (Regla, Condicion, Accion, Dispositivo).
"""
import asyncio
import hashlib
import os
import secrets
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Literal

import bcrypt
import psycopg
from fastapi import Depends, FastAPI, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field, ValidationError, model_validator

from dominio import Actuador, Regla, Sensor, crearDispositivo
from repositorio import RepositorioPostgres

DSN = os.environ.get("CASA_DB", "dbname=casa_inteligente")
ORIGENES = os.environ.get("CASA_ORIGENES", "*").split(",")  # desde dónde se puede abrir la app
DIAS_SESION = 30
GUARDAR_LUZ_CADA_S = 60    # la luz llega cada segundo; no llenar la tabla eventos
AVISO_DESCONEXION_S = 10   # si el puente no vuelve en este tiempo, se avisa al dueño

# ---------- configuración y repositorios ----------
# GRASP Indirección: todo acceso a una tabla pasa por un RepositorioPostgres; los controladores no arman SQL de tablas.

conn = psycopg.connect(DSN, autocommit=True, row_factory=dict_row)
usuarios, casas, habitaciones, dispositivos, reglas, horarios, eventos, notificaciones, solicitudes = (
    RepositorioPostgres(conn, t) for t in (
        "usuarios", "casas", "habitaciones", "dispositivos", "reglas", "horarios", "eventos", "notificaciones", "solicitudes"))

CANAL_TIPO = {"mov": "sensor_movimiento", "luz": "sensor_luz", "led": "led", "led2": "led", "cortina": "cortina"}  # led2: segundo LED (pin 10), mismas reglas que el primero
# Catálogo de lo que se puede pedir. Los 4 primeros los maneja el Arduino; el resto se instala y queda «sin conectar».
CATALOGO = {"sensor_movimiento": "Sensor de movimiento", "sensor_luz": "Sensor de luz", "led": "Luz inteligente",
            "cortina": "Cortina motorizada", "sensor_temperatura": "Sensor de temperatura", "sensor_puerta": "Sensor de puerta",
            "enchufe": "Enchufe inteligente", "camara": "Cámara", "alarma": "Alarma"}


# ---------- utilidades (consultas que cruzan varias tablas) ----------

def iso(fila):
    return {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in fila.items()}


def publico(u):
    return {k: u[k] for k in ("id", "nombre", "correo", "rol")}


def dispositivos_de(id_casa):
    return conn.execute("""SELECT d.*, h.nombre AS habitacion FROM dispositivos d
                           JOIN habitaciones h ON h.id = d.id_habitacion
                           WHERE h.id_casa = %s ORDER BY h.id, d.id""", [id_casa]).fetchall()


def casa_de_disp(idDisp):
    r = conn.execute("""SELECT h.id_casa FROM dispositivos d JOIN habitaciones h ON h.id = d.id_habitacion
                        WHERE d.id = %s""", [idDisp]).fetchone()
    return r and r["id_casa"]


def puede(u, id_casa) -> bool:
    c = casas.buscar(id_casa) if id_casa else None
    return bool(c) and (u["rol"] == "admin" or c["id_propietario"] == u["id"])


# ---------- servicios ----------
# GRASP Fabricación Pura + SOLID S: cada servicio tiene una sola razón para cambiar
# (cómo se autentica / cómo se avisa), y los controladores solo los usan.

def _hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


class ServicioAutenticacion:
    def iniciarSesion(self, correo, contrasena):
        u = next(iter(usuarios.listar(correo=correo.strip().lower())), None)
        if not u or not self._verificarContrasena(u, contrasena):
            return None
        token = secrets.token_urlsafe(24)
        conn.execute("INSERT INTO sesiones VALUES (%s, %s, now() + make_interval(days => %s))", [_hash(token), u["id"], DIAS_SESION])
        conn.execute("DELETE FROM sesiones WHERE expira < now()")
        return token, u

    @staticmethod  # privado en el UML: nadie fuera del servicio sabe que se usa bcrypt
    def _verificarContrasena(u, contrasena) -> bool:
        return bcrypt.checkpw(contrasena.encode(), u["contrasena_hash"].encode())

    def registrar(self, nombre, correo, contrasena):
        correo = correo.strip().lower()
        if usuarios.listar(correo=correo):
            return None
        h = bcrypt.hashpw(contrasena.encode(), bcrypt.gensalt()).decode()
        return usuarios.guardar({"nombre": nombre.strip(), "correo": correo, "contrasena_hash": h, "rol": "cliente"})

    def usuario(self, token):
        if not token:
            return None
        return conn.execute("""SELECT u.* FROM sesiones s JOIN usuarios u ON u.id = s.id_usuario
                               WHERE s.token_hash = %s AND s.expira > now()""", [_hash(token)]).fetchone()

    def cerrarSesion(self, token):
        conn.execute("DELETE FROM sesiones WHERE token_hash = %s", [_hash(token)])


class ServicioNotificaciones:
    async def enviar(self, id_usuario, mensaje):
        n = iso(notificaciones.guardar({"id_usuario": id_usuario, "mensaje": mensaje}))
        await ctl.difundir([w for w, a in ctl.apps.items() if a["uid"] == id_usuario], {"tipo": "notificacion", **n})

    async def enviarCasa(self, casa, mensaje):
        """Al dueño de la casa; si no tiene dueño, a los administradores."""
        destinos = [casa["id_propietario"]] if casa["id_propietario"] else [a["id"] for a in usuarios.listar(rol="admin")]
        for uid in destinos:
            await self.enviar(uid, mensaje)


# ---------- controladores ----------
# GRASP Controlador: primera clase (después de la API/WebSocket) que recibe cada evento del sistema.
# Están separados por caso de uso (Alta cohesión): automatización, hogar, administración y solicitudes.

class ControladorAutomatizacion:
    """Lecturas del puente → eventos y reglas; envío de acciones al puente correcto."""
    def __init__(self):
        self.puentes = {}          # websocket -> id de casa
        self.apps = {}             # websocket -> {"uid": usuario, "casa": casa que está mirando}
        self.pedido = {}           # idDisp -> última (acción, valor) enviada, para no repetirla
        self.ultimoGuardado = {}   # idDisp -> (valor, hora) del último evento guardado
        self.cumplia = {}          # id de regla -> ¿su condición se cumplía en la lectura anterior?
        self.avisos = {}           # id de casa -> tarea que avisará de la desconexión

    def puenteConectado(self, id_casa):
        return id_casa in self.puentes.values()

    def disp_por_canal(self, id_casa, canal):
        return next((d for d in dispositivos_de(id_casa) if d["canal"] == canal), None)

    async def procesarLectura(self, id_casa, canal, valor: str):
        d = self.disp_por_canal(id_casa, canal)
        try:
            float(valor)
        except ValueError:
            return  # lectura corrupta del serial: se descarta
        sensor = d and crearDispositivo(d)
        if not isinstance(sensor, Sensor):  # solo un Sensor produce lecturas
            return
        dispositivos.guardar({"id": d["id"], "estado": valor})
        antes, hora = self.ultimoGuardado.get(d["id"], (None, 0))
        if valor != antes and (d["tipo"] != "sensor_luz" or time.time() - hora >= GUARDAR_LUZ_CADA_S):
            eventos.guardar(sensor.generarEvento(valor))  # GRASP Creador: el Sensor crea su Evento
            self.ultimoGuardado[d["id"]] = (valor, time.time())
        casa = casas.buscar(id_casa)
        if d["tipo"] == "sensor_movimiento" and valor == "1" and d["estado"] != "1" and casa["modo_ausente"]:
            await servicioNotificaciones.enviarCasa(casa, f"Alerta: movimiento en «{casa['direccion']}» con el modo ausente activado")
        if casa["estado_sistema"] == "encendido":
            await self.evaluarReglas(casa, d["id"], valor)
        await self.publicarEstado(id_casa)

    async def evaluarReglas(self, casa, idDisp, valor):
        # Solo actúa cuando la condición pasa de falsa a verdadera: así un botón manual
        # no se deshace con la siguiente lectura (la luz llega cada segundo).
        for f in reglas.listar(id_casa=casa["id"], id_sensor=idDisp, activa=True):
            # GRASP Polimorfismo: no se pregunta qué tipo de condición o acción tiene la regla.
            # Bajo acoplamiento: la regla recibe con qué enviar/avisar, no conoce a este controlador.
            r = Regla.desdeFila(f, self.enviarAccion, servicioNotificaciones.enviarCasa)
            cumple = r.evaluar(idDisp, valor)
            if cumple and not self.cumplia.get(r.id):
                await r.ejecutar(casa)
            self.cumplia[r.id] = cumple

    async def confirmar(self, id_casa, canal, valor):
        d = self.disp_por_canal(id_casa, canal)
        if d:
            dispositivos.guardar({"id": d["id"], "estado": valor})
            if valor != d["estado"]:
                eventos.guardar({"id_disp": d["id"], "valor": valor})
            await self.publicarEstado(id_casa)

    async def enviarAccion(self, idDisp, accion, valor=None, forzar=False):
        d = dispositivos.buscar(idDisp)
        if not d or not d["canal"]:
            return
        if not forzar and self.pedido.get(idDisp) == (accion, valor):
            return
        self.pedido[idDisp] = (accion, valor)
        id_casa = casa_de_disp(idDisp)
        msg = {"tipo": "accion", "canal": d["canal"], "accion": accion}
        if valor is not None:
            msg["valor"] = valor
        await self.difundir([w for w, c in self.puentes.items() if c == id_casa], msg)

    async def publicarEstado(self, id_casa):
        for w, a in list(self.apps.items()):
            if a["casa"] == id_casa:
                await self.difundir([w], hogar.consultarEstado(usuarios.buscar(a["uid"]), id_casa))

    async def difundir(self, destinos, msg):
        for w in list(destinos):
            try:
                await w.send_json(msg)
            except Exception:
                self.puentes.pop(w, None)
                self.apps.pop(w, None)

    async def puenteConectado_(self, w, casa):
        self.puentes[w] = casa["id"]
        aviso = self.avisos.pop(casa["id"], None)
        if aviso and aviso.done():  # ya se había avisado que se desconectó
            await servicioNotificaciones.enviarCasa(casa, f"El Arduino de «{casa['direccion']}» se volvió a conectar")
        elif aviso:
            aviso.cancel()
        await self.publicarEstado(casa["id"])

    async def puenteDesconectado(self, id_casa):
        await self.publicarEstado(id_casa)
        if self.puenteConectado(id_casa):
            return

        async def avisar():
            await asyncio.sleep(AVISO_DESCONEXION_S)
            casa = casas.buscar(id_casa)
            if casa and not self.puenteConectado(id_casa):
                await servicioNotificaciones.enviarCasa(casa, f"El Arduino de «{casa['direccion']}» se desconectó")
        self.avisos[id_casa] = asyncio.create_task(avisar())


class ControladorHogar:
    """Lo que hace el dueño desde la app: ver el estado y controlar sus dispositivos."""
    def consultarEstado(self, u, id_casa):
        if not puede(u, id_casa):
            return {"tipo": "estado", "sinCasa": True}
        ds = dispositivos_de(id_casa)
        evs = conn.execute("SELECT * FROM eventos WHERE id_disp = ANY(%s) ORDER BY id DESC LIMIT 20",
                           [[d["id"] for d in ds]]).fetchall()
        casa = {k: v for k, v in casas.buscar(id_casa).items() if k not in ("token_puente", "plano")}
        return {"tipo": "estado", "idCasa": id_casa, "puenteConectado": ctl.puenteConectado(id_casa),
                "casa": casa, "dispositivos": ds, "eventos": [iso(e) for e in evs]}

    async def controlarDispositivo(self, u, idDisp, accion, valor=None):
        d = dispositivos.buscar(idDisp)
        if not d or not puede(u, casa_de_disp(idDisp)):
            return
        # GRASP Experto: el Actuador decide si acepta la acción (y la Cortina limita su apertura a 0–100 %).
        act = crearDispositivo(d)
        pedido = act.ejecutarAccion(accion, valor) if isinstance(act, Actuador) else None
        if pedido:
            await ctl.enviarAccion(idDisp, *pedido, forzar=True)

    async def actualizarCasa(self, id_casa, cambios):
        casas.guardar({"id": id_casa, **cambios})
        if cambios.get("estado_sistema") == "apagado":  # encender/apagar es de ControladorAdministracion (UML)
            await admin_.apagarSistema(id_casa)
        if cambios.get("estado_sistema") == "encendido":
            admin_.encenderSistema(id_casa)
        await ctl.publicarEstado(id_casa)


class ControladorAdministracion:
    """Casas, dispositivos, encendido del sistema y atención de solicitudes."""
    def encenderSistema(self, id_casa):
        casas.guardar({"id": id_casa, "estado_sistema": "encendido"})
        ctl.cumplia.clear()  # las reglas vuelven a aplicar con la próxima lectura

    async def apagarSistema(self, id_casa):
        casas.guardar({"id": id_casa, "estado_sistema": "apagado"})
        for d in dispositivos_de(id_casa):
            if d["tipo"] == "led":
                await ctl.enviarAccion(d["id"], "apagar", forzar=True)

    def crearCasa(self, direccion, id_propietario, plano=None):
        c = casas.guardar({"direccion": direccion.strip(), "id_propietario": id_propietario,
                           "token_puente": secrets.token_urlsafe(18), "plano": Jsonb(plano) if plano else None})
        for hb in (plano or {}).get("habitaciones") or [{"nombre": "Sala"}]:
            h = habitaciones.guardar({"id_casa": c["id"], "nombre": hb["nombre"]})
            self.crearDispositivos(h["id"], hb.get("dispositivos", []))
        return c

    def crearDispositivos(self, id_habitacion, pedidos):
        """Los dispositivos pedidos quedan creados «sin conectar»; el admin les asigna el canal al instalarlos."""
        for p in pedidos:
            for i in range(p["cantidad"]):
                nombre = CATALOGO[p["tipo"]] + (f" {i + 1}" if p["cantidad"] > 1 else "")
                dispositivos.guardar({"id_habitacion": id_habitacion, "nombre": nombre, "tipo": p["tipo"], "canal": None})

    def agregarDispositivo(self, id_habitacion, nombre, tipo, canal):
        h = habitaciones.buscar(id_habitacion)
        if not h:
            raise HTTPException(404, "Habitación no encontrada")
        if canal:
            if CANAL_TIPO[canal] != tipo:
                raise HTTPException(422, f"El canal «{canal}» es para dispositivos de tipo {CANAL_TIPO[canal]}")
            if any(d["canal"] == canal for d in dispositivos_de(h["id_casa"])):
                raise HTTPException(409, f"Esta casa ya tiene un dispositivo en el canal «{canal}»")
        return dispositivos.guardar({"id_habitacion": id_habitacion, "nombre": nombre.strip(), "tipo": tipo, "canal": canal})

    async def atenderSolicitud(self, idSol, aprobar):
        s = solicitudes.buscar(idSol)
        if not s:
            raise HTTPException(404, "Solicitud no encontrada")
        if s["estado"] != "pendiente":
            raise HTTPException(409, "La solicitud ya fue atendida")
        solicitudes.guardar({"id": idSol, "estado": "aprobada" if aprobar else "rechazada"})
        extra, d = "", s["detalle"] or {}
        if aprobar and s["tipo"] == "casa":
            c = self.crearCasa(d.get("direccion") or s["descripcion"], s["id_usuario"], d or None)
            extra = f": ya puedes ver «{c['direccion']}» en Inicio"
        if aprobar and s["tipo"] == "dispositivo":
            if d and casas.buscar(d["id_casa"]):
                id_hab = d.get("id_habitacion")
                if not id_hab or not habitaciones.buscar(id_hab):
                    id_hab = habitaciones.guardar({"id_casa": d["id_casa"], "nombre": d.get("nueva_habitacion") or "Nueva habitación"})["id"]
                self.crearDispositivos(id_hab, d["dispositivos"])
                await ctl.publicarEstado(d["id_casa"])
            extra = ": el administrador los conectará pronto"
        await servicioNotificaciones.enviar(s["id_usuario"], f"Tu solicitud de {s['tipo']} fue {'aprobada' if aprobar else 'rechazada'}{extra}")


class ControladorSolicitudes:
    """Pedidos del cliente (casa nueva o dispositivos). Los atiende ControladorAdministracion."""
    async def solicitarCasa(self, u, descripcion, detalle=None):
        if detalle:
            x = DetalleCasa(**detalle)
            n = sum(p.cantidad for hb in x.habitaciones for p in hb.dispositivos)
            descripcion = f"{x.direccion} · {x.ancho}×{x.largo} m · {plural(len(x.habitaciones), 'habitación', 'habitaciones')} · {plural(n, 'dispositivo')}"
            detalle = x.model_dump()
        return await self._crear(u, "casa", descripcion, detalle)

    async def solicitarDispositivo(self, u, descripcion, detalle=None):
        if detalle:
            x = DetalleDisp(**detalle)
            exigir(u, x.id_casa)
            hab = habitaciones.buscar(x.id_habitacion) if x.id_habitacion else None
            if x.id_habitacion and (not hab or hab["id_casa"] != x.id_casa):
                raise HTTPException(422, "Esa habitación no es de la casa elegida")
            if not hab and not (x.nueva_habitacion or "").strip():
                raise HTTPException(422, "Elige una habitación o escribe el nombre de una nueva")
            lugar = hab["nombre"] if hab else x.nueva_habitacion.strip()
            descripcion = f"{plural(sum(p.cantidad for p in x.dispositivos), 'dispositivo')} para «{lugar}» en {casas.buscar(x.id_casa)['direccion']}"
            detalle = x.model_dump()
        return await self._crear(u, "dispositivo", descripcion, detalle)

    async def _crear(self, u, tipo, descripcion, detalle):
        descripcion = descripcion.strip()
        if len(descripcion) < 3:
            raise HTTPException(422, "Describe lo que necesitas")
        s = iso(solicitudes.guardar({"id_usuario": u["id"], "tipo": tipo, "descripcion": descripcion[:300],
                                     "detalle": Jsonb(detalle) if detalle else None}))
        for a in usuarios.listar(rol="admin"):
            if a["id"] != u["id"]:
                await servicioNotificaciones.enviar(a["id"], f"Nueva solicitud de {tipo} de {u['nombre']}")
        return s

    def listar(self, u):
        filas = solicitudes.listar() if u["rol"] == "admin" else solicitudes.listar(id_usuario=u["id"])
        nombres = {x["id"]: x["nombre"] for x in usuarios.listar()}
        return [iso({**s, "usuario": nombres.get(s["id_usuario"])}) for s in reversed(filas)]


# Una sola instancia de cada servicio y controlador, creadas aquí y en ningún otro lugar.
auth, servicioNotificaciones = ServicioAutenticacion(), ServicioNotificaciones()
ctl, hogar, admin_, ctlSolicitudes = ControladorAutomatizacion(), ControladorHogar(), ControladorAdministracion(), ControladorSolicitudes()


# ---------- horarios: se revisan cada 15 s ----------

async def ejecutarHorarios():
    ahora = datetime.now()
    filas = conn.execute("""SELECT * FROM horarios WHERE activo AND to_char(hora, 'HH24:MI') = %s
                            AND (ultima IS NULL OR ultima < %s)""", [ahora.strftime("%H:%M"), ahora.date()]).fetchall()
    for f in filas:
        if str(ahora.isoweekday()) in f["dias"]:
            horarios.guardar({"id": f["id"], "ultima": ahora.date()})
            await ctl.enviarAccion(f["id_actuador"], f["comando"], forzar=True)


async def reloj():
    while True:
        try:
            await ejecutarHorarios()
        except Exception as e:  # que un error no detenga los horarios
            print("Error en horarios:", e, flush=True)
        await asyncio.sleep(15)


@asynccontextmanager
async def vida(_):
    tarea = asyncio.create_task(reloj())
    yield
    tarea.cancel()
    for t in ctl.avisos.values():
        t.cancel()


# ---------- API REST ----------
# Capa delgada: valida la entrada (Pydantic), revisa permisos y delega en un controlador.

app = FastAPI(title="Casa Inteligente", lifespan=vida)
app.add_middleware(CORSMiddleware, allow_origins=ORIGENES, allow_methods=["*"], allow_headers=["*"])


# --- autenticación y permisos ---

def token_de(authorization: str = Header("")):
    return authorization.removeprefix("Bearer ").strip()


def usuario_actual(token: str = Depends(token_de)):
    u = auth.usuario(token)
    if not u:
        raise HTTPException(401, "Sesión no válida")
    return u


def admin(u=Depends(usuario_actual)):
    if u["rol"] != "admin":
        raise HTTPException(403, "Solo para administradores")
    return u


def exigir(u, id_casa):
    if not puede(u, id_casa):
        raise HTTPException(403, "No tienes acceso a esta casa")


# --- modelos de entrada (datos que llegan por la API; no son clases del dominio) ---

class Login(BaseModel):
    correo: str
    contrasena: str


class Registro(BaseModel):
    nombre: str = Field(min_length=2, max_length=60)
    correo: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=120)
    contrasena: str = Field(min_length=8, max_length=72)


class PedidoDisp(BaseModel):
    tipo: Literal["sensor_movimiento", "sensor_luz", "led", "cortina", "sensor_temperatura", "sensor_puerta", "enchufe", "camara", "alarma"]
    cantidad: int = Field(ge=1, le=10)


class HabPlano(BaseModel):
    nombre: str = Field(min_length=1, max_length=40)
    tipo: Literal["sala", "cocina", "habitacion", "bano", "comedor", "estudio", "garaje", "patio", "otro"]
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    w: int = Field(ge=1)
    h: int = Field(ge=1)
    dispositivos: list[PedidoDisp] = Field(default_factory=list, max_length=12)


class DetalleCasa(BaseModel):
    """solicitarCasa: dirección + plano en cuadrícula de 1 m."""
    direccion: str = Field(min_length=3, max_length=120)
    tipo_vivienda: Literal["casa", "apartamento", "oficina"]
    ancho: int = Field(ge=3, le=30)
    largo: int = Field(ge=3, le=30)
    habitaciones: list[HabPlano] = Field(min_length=1, max_length=30)
    comentarios: str = Field("", max_length=500)

    @model_validator(mode="after")
    def plano_valido(self):
        ocupado = set()
        for hb in self.habitaciones:
            if hb.x + hb.w > self.ancho or hb.y + hb.h > self.largo:
                raise ValueError(f"«{hb.nombre}» se sale del plano")
            celdas = {(i, j) for i in range(hb.x, hb.x + hb.w) for j in range(hb.y, hb.y + hb.h)}
            if celdas & ocupado:
                raise ValueError(f"«{hb.nombre}» se cruza con otra habitación")
            ocupado |= celdas
        return self


class DetalleDisp(BaseModel):
    """solicitarDispositivo: casa, habitación (existente o nueva) y lista del catálogo."""
    id_casa: int
    id_habitacion: int | None = None
    nueva_habitacion: str | None = Field(None, max_length=40)
    dispositivos: list[PedidoDisp] = Field(min_length=1, max_length=12)
    comentarios: str = Field("", max_length=500)


class NuevaSolicitud(BaseModel):
    tipo: Literal["casa", "dispositivo"]
    descripcion: str = Field("", max_length=300)
    detalle: dict | None = None


def plural(n, uno, varios=None):
    return f"{n} {uno if n == 1 else varios or uno + 's'}"


def primer_error(e: ValidationError):
    return e.errors()[0]["msg"].removeprefix("Value error, ")


class CambioDispositivo(BaseModel):
    nombre: str | None = Field(None, min_length=2, max_length=60)
    canal: Literal["mov", "luz", "led", "led2", "cortina", ""] | None = None


class Decision(BaseModel):
    aprobar: bool


class NuevaCasa(BaseModel):
    direccion: str = Field(min_length=3, max_length=120)
    id_propietario: int | None = None


class CambioCasa(BaseModel):
    direccion: str | None = Field(None, min_length=3, max_length=120)
    estado_sistema: Literal["encendido", "apagado"] | None = None
    modo_ausente: bool | None = None


class NuevaHabitacion(BaseModel):
    nombre: str = Field(min_length=2, max_length=60)


class NuevoDispositivo(BaseModel):
    nombre: str = Field(min_length=2, max_length=60)
    tipo: Literal["sensor_movimiento", "sensor_luz", "led", "cortina", "sensor_temperatura", "sensor_puerta", "enchufe", "camara", "alarma"]
    canal: Literal["mov", "luz", "led", "led2", "cortina"] | None = None


class DatosRegla(BaseModel):
    nombre: str = Field(min_length=2, max_length=80)
    id_sensor: int
    operador: Literal[">=", "<=", "=="]
    valor: float
    comando: Literal["encender", "apagar", "abrir", "cerrar", "notificar"]
    id_actuador: int | None = None
    mensaje: str | None = Field(None, max_length=200)
    activa: bool = True


class DatosHorario(BaseModel):
    nombre: str = Field(min_length=2, max_length=80)
    hora: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d(:00)?$")
    dias: str = Field(pattern=r"^[1-7]{1,7}$")
    id_actuador: int
    comando: Literal["encender", "apagar", "abrir", "cerrar"]
    activo: bool = True


# --- validaciones de reglas y horarios ---

def acepta(fila, accion):
    d = crearDispositivo(fila)
    return isinstance(d, Actuador) and d.acepta(accion)


def validar_regla(id_casa, r: DatosRegla):
    ds = {d["id"]: d for d in dispositivos_de(id_casa)}
    s = ds.get(r.id_sensor)
    if not s or not isinstance(crearDispositivo(s), Sensor):
        raise HTTPException(422, "Elige un sensor de esta casa")
    if r.comando == "notificar":
        if not (r.mensaje or "").strip():
            raise HTTPException(422, "Escribe el mensaje de la notificación")
        return {**r.model_dump(), "id_actuador": None, "mensaje": r.mensaje.strip()}
    a = ds.get(r.id_actuador)
    if not a or not acepta(a, r.comando):
        raise HTTPException(422, "Elige un actuador de esta casa que acepte esa acción")
    return {**r.model_dump(), "mensaje": None}


def validar_horario(id_casa, h: DatosHorario):
    a = next((d for d in dispositivos_de(id_casa) if d["id"] == h.id_actuador), None)
    if not a or not acepta(a, h.comando):
        raise HTTPException(422, "Elige un actuador de esta casa que acepte esa acción")
    return {**h.model_dump(), "dias": "".join(sorted(set(h.dias))), "ultima": None}


# --- endpoints ---

@app.get("/api/salud")
def salud():
    return {"ok": True}


@app.post("/api/login")
def login(d: Login):
    r = auth.iniciarSesion(d.correo, d.contrasena)
    if not r:
        raise HTTPException(401, "Correo o contraseña incorrectos")
    token, u = r
    return {"token": token, "usuario": publico(u)}


@app.post("/api/registro", status_code=201)
def registro(d: Registro):
    if not auth.registrar(d.nombre, d.correo, d.contrasena):
        raise HTTPException(409, "Ya existe una cuenta con ese correo")
    token, u = auth.iniciarSesion(d.correo, d.contrasena)
    return {"token": token, "usuario": publico(u)}


@app.post("/api/logout", status_code=204)
def logout(token: str = Depends(token_de)):
    auth.cerrarSesion(token)


@app.get("/api/yo")
def yo(u=Depends(usuario_actual)):
    return publico(u)


# casas

@app.get("/api/casas")
def mis_casas(u=Depends(usuario_actual)):
    filas = casas.listar() if u["rol"] == "admin" else casas.listar(id_propietario=u["id"])
    nombres = {x["id"]: x["nombre"] for x in usuarios.listar()}
    return [{**c, "propietario": nombres.get(c["id_propietario"]), "puenteConectado": ctl.puenteConectado(c["id"])}
            for c in filas]


@app.post("/api/casas", status_code=201)
def nueva_casa(d: NuevaCasa, _=Depends(admin)):
    if d.id_propietario and not usuarios.buscar(d.id_propietario):
        raise HTTPException(422, "Ese usuario no existe")
    return admin_.crearCasa(d.direccion, d.id_propietario)


@app.patch("/api/casas/{id_casa}")
async def cambiar_casa(id_casa: int, d: CambioCasa, u=Depends(usuario_actual)):
    exigir(u, id_casa)
    cambios = {k: v for k, v in d.model_dump().items() if v is not None}
    if cambios:
        await hogar.actualizarCasa(id_casa, cambios)
    return {k: v for k, v in casas.buscar(id_casa).items() if k != "token_puente"}


@app.get("/api/casas/{id_casa}/habitaciones")
def ver_habitaciones(id_casa: int, u=Depends(usuario_actual)):
    exigir(u, id_casa)
    ds = dispositivos_de(id_casa)
    return [{**h, "dispositivos": [d for d in ds if d["id_habitacion"] == h["id"]]}
            for h in habitaciones.listar(id_casa=id_casa)]


@app.post("/api/casas/{id_casa}/habitaciones", status_code=201)
def nueva_habitacion(id_casa: int, d: NuevaHabitacion, _=Depends(admin)):
    if not casas.buscar(id_casa):
        raise HTTPException(404, "Casa no encontrada")
    return habitaciones.guardar({"id_casa": id_casa, "nombre": d.nombre.strip()})


@app.post("/api/habitaciones/{id_hab}/dispositivos", status_code=201)
async def nuevo_dispositivo(id_hab: int, d: NuevoDispositivo, _=Depends(admin)):
    r = admin_.agregarDispositivo(id_hab, d.nombre, d.tipo, d.canal)
    await ctl.publicarEstado(habitaciones.buscar(id_hab)["id_casa"])
    return r


@app.patch("/api/dispositivos/{idDisp}")
async def cambiar_dispositivo(idDisp: int, d: CambioDispositivo, _=Depends(admin)):
    disp, id_casa = dispositivos.buscar(idDisp), casa_de_disp(idDisp)
    if not disp:
        raise HTTPException(404, "Dispositivo no encontrado")
    cambios = {k: v for k, v in d.model_dump().items() if v is not None}
    if "canal" in cambios:
        canal = cambios["canal"] or None
        if canal and CANAL_TIPO[canal] != disp["tipo"]:
            raise HTTPException(422, f"El canal «{canal}» es para dispositivos de tipo {CANAL_TIPO[canal]}")
        if canal and any(x["canal"] == canal and x["id"] != idDisp for x in dispositivos_de(id_casa)):
            raise HTTPException(409, f"Esta casa ya tiene un dispositivo en el canal «{canal}»")
        cambios["canal"] = canal
    r = dispositivos.guardar({"id": idDisp, **cambios}) if cambios else disp
    await ctl.publicarEstado(id_casa)
    return r


@app.delete("/api/dispositivos/{idDisp}", status_code=204)
async def borrar_dispositivo(idDisp: int, _=Depends(admin)):
    id_casa = casa_de_disp(idDisp)
    if not id_casa:
        raise HTTPException(404, "Dispositivo no encontrado")
    dispositivos.eliminar(idDisp)
    await ctl.publicarEstado(id_casa)


# reglas

@app.get("/api/casas/{id_casa}/reglas")
def ver_reglas(id_casa: int, u=Depends(usuario_actual)):
    exigir(u, id_casa)
    return reglas.listar(id_casa=id_casa)


@app.post("/api/casas/{id_casa}/reglas", status_code=201)
def nueva_regla(id_casa: int, r: DatosRegla, u=Depends(usuario_actual)):
    exigir(u, id_casa)
    return reglas.guardar({"id_casa": id_casa, **validar_regla(id_casa, r)})


def regla_propia(idRegla, u):
    r = reglas.buscar(idRegla)
    if not r:
        raise HTTPException(404, "Regla no encontrada")
    exigir(u, r["id_casa"])
    return r


@app.patch("/api/reglas/{idRegla}")
def cambiar_regla(idRegla: int, cambios: dict, u=Depends(usuario_actual)):
    r = regla_propia(idRegla, u)
    nueva = DatosRegla(**{**r, **{k: v for k, v in cambios.items() if k in DatosRegla.model_fields}})
    ctl.cumplia.pop(idRegla, None)
    return reglas.guardar({"id": idRegla, **validar_regla(r["id_casa"], nueva)})


@app.delete("/api/reglas/{idRegla}", status_code=204)
def borrar_regla(idRegla: int, u=Depends(usuario_actual)):
    regla_propia(idRegla, u)
    reglas.eliminar(idRegla)


# horarios

@app.get("/api/casas/{id_casa}/horarios")
def ver_horarios(id_casa: int, u=Depends(usuario_actual)):
    exigir(u, id_casa)
    return [iso(h) for h in horarios.listar(id_casa=id_casa)]


@app.post("/api/casas/{id_casa}/horarios", status_code=201)
def nuevo_horario(id_casa: int, h: DatosHorario, u=Depends(usuario_actual)):
    exigir(u, id_casa)
    return iso(horarios.guardar({"id_casa": id_casa, **validar_horario(id_casa, h)}))


def horario_propio(idH, u):
    h = horarios.buscar(idH)
    if not h:
        raise HTTPException(404, "Horario no encontrado")
    exigir(u, h["id_casa"])
    return h


@app.patch("/api/horarios/{idH}")
def cambiar_horario(idH: int, cambios: dict, u=Depends(usuario_actual)):
    h = horario_propio(idH, u)
    actual = {**iso(h), "hora": h["hora"].strftime("%H:%M")}
    nuevo = DatosHorario(**{**actual, **{k: v for k, v in cambios.items() if k in DatosHorario.model_fields}})
    return iso(horarios.guardar({"id": idH, **validar_horario(h["id_casa"], nuevo)}))


@app.delete("/api/horarios/{idH}", status_code=204)
def borrar_horario(idH: int, u=Depends(usuario_actual)):
    horario_propio(idH, u)
    horarios.eliminar(idH)


# historial (consultarLogs)

@app.get("/api/casas/{id_casa}/historial")
def historial(id_casa: int, horas: int = Query(24, ge=1, le=24 * 31), u=Depends(usuario_actual)):
    exigir(u, id_casa)
    paso_luz = "15 minutes" if horas <= 24 else "3 hours"
    paso_mov = "1 hour" if horas <= 24 else "1 day"
    series = []
    for d in dispositivos_de(id_casa):
        if d["tipo"] == "sensor_luz":
            q = """SELECT date_bin(%s::interval, fecha, '2000-01-01') AS t, round(avg(valor::float)) AS v FROM eventos
                   WHERE id_disp = %s AND fecha > now() - make_interval(hours => %s) GROUP BY t ORDER BY t"""
            paso = paso_luz
        elif d["tipo"] == "sensor_movimiento":
            q = """SELECT date_bin(%s::interval, fecha, '2000-01-01') AS t, count(*) AS v FROM eventos
                   WHERE id_disp = %s AND valor = '1' AND fecha > now() - make_interval(hours => %s) GROUP BY t ORDER BY t"""
            paso = paso_mov
        else:
            continue
        puntos = [[p["t"].isoformat(), p["v"]] for p in conn.execute(q, [paso, d["id"], horas]).fetchall()]
        series.append({"id": d["id"], "nombre": d["nombre"], "tipo": d["tipo"], "paso": paso, "puntos": puntos})
    return {"horas": horas, "series": series}


# notificaciones y solicitudes

@app.get("/api/notificaciones")
def mis_notificaciones(u=Depends(usuario_actual)):
    return [iso(n) for n in reversed(notificaciones.listar(id_usuario=u["id"]))][:50]


@app.post("/api/notificaciones/leidas", status_code=204)
def marcar_leidas(u=Depends(usuario_actual)):
    conn.execute("UPDATE notificaciones SET leida = TRUE WHERE id_usuario = %s AND NOT leida", [u["id"]])


@app.get("/api/solicitudes")
def ver_solicitudes(u=Depends(usuario_actual)):
    return ctlSolicitudes.listar(u)


@app.post("/api/solicitudes", status_code=201)
async def nueva_solicitud(d: NuevaSolicitud, u=Depends(usuario_actual)):
    pedir = ctlSolicitudes.solicitarCasa if d.tipo == "casa" else ctlSolicitudes.solicitarDispositivo
    try:
        return await pedir(u, d.descripcion, d.detalle)
    except ValidationError as e:
        raise HTTPException(422, primer_error(e))


@app.post("/api/solicitudes/{idSol}", status_code=204)
async def atender(idSol: int, d: Decision, _=Depends(admin)):
    await admin_.atenderSolicitud(idSol, d.aprobar)


@app.get("/api/admin/usuarios")
def ver_usuarios(_=Depends(admin)):
    return [publico(u) for u in usuarios.listar()]


# ---------- WebSocket: puentes de las casas y apps en vivo ----------
# Solo traduce mensajes a llamadas de los controladores (GRASP Controlador).

@app.websocket("/ws")
async def ws(w: WebSocket):
    await w.accept()
    try:
        while True:
            m = await w.receive_json()
            t = m.get("tipo")
            if t == "hola" and m.get("rol") == "puente":
                casa = next(iter(casas.listar(token_puente=str(m.get("token", "")))), None) if m.get("token") else None
                if not casa:
                    return await w.close(4401)
                await ctl.puenteConectado_(w, casa)
            elif t == "hola":
                u = auth.usuario(m.get("token", ""))
                if not u:
                    return await w.close(4401)
                ctl.apps[w] = {"uid": u["id"], "casa": None}
                await w.send_json({"tipo": "listo"})
            elif w in ctl.puentes and t == "lectura":
                await ctl.procesarLectura(ctl.puentes[w], str(m["canal"]), str(m["valor"]))
            elif w in ctl.puentes and t == "confirmacion":
                await ctl.confirmar(ctl.puentes[w], str(m["canal"]), str(m["valor"]))
            elif w in ctl.apps and t == "seleccionar":
                u = usuarios.buscar(ctl.apps[w]["uid"])
                id_casa = int(m["idCasa"])
                ctl.apps[w]["casa"] = id_casa if puede(u, id_casa) else None
                await w.send_json(hogar.consultarEstado(u, id_casa))
            elif w in ctl.apps and t == "control":
                await hogar.controlarDispositivo(usuarios.buscar(ctl.apps[w]["uid"]), int(m["idDisp"]), m["accion"], m.get("valor"))
    except (WebSocketDisconnect, KeyError, ValueError, TypeError):
        pass
    finally:
        id_casa = ctl.puentes.pop(w, None)
        ctl.apps.pop(w, None)
        if id_casa:
            await ctl.puenteDesconectado(id_casa)


# ---------- app del usuario (archivos estáticos) ----------
# Va al final: las rutas /api y /ws se resuelven antes. Si no existe la carpeta (solo API), no se monta.
APP_DIR = os.environ.get("CASA_APP") or str(Path(__file__).resolve().parent.parent / "app")
if os.path.isdir(APP_DIR):
    app.mount("/", StaticFiles(directory=APP_DIR, html=True), name="app")
