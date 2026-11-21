# Casa Inteligente — servidor (API)

```
Arduino de cada casa ──USB──> wokwi/pc/puente.py ──WebSocket /ws (con la clave de su casa)──┐
                                                                                            ├── app.py (FastAPI) ──> PostgreSQL
app del usuario (../app, cualquier dispositivo) ──REST /api/* + WebSocket /ws───────────────┘
```

El servidor no tiene interfaz: solo conecta los Arduinos, la base de datos y las apps. La app está en `../app`.

| Archivo | Clase(s) del UML |
|---|---|
| `schema.sql` | Tablas: usuarios, sesiones, casas, habitaciones, dispositivos, reglas, horarios, eventos, notificaciones, solicitudes |
| `repositorio.py` | `Repositorio<T>` / `RepositorioPostgres<T>` |
| `app.py` | `Regla` (`CondicionUmbral`, `CondicionMovimiento`, `AccionActuador`, `AccionNotificar`), `ControladorAutomatizacion`, `ControladorHogar`, `ControladorAdministracion`, `ControladorSolicitudes`, `ServicioAutenticacion`, `ServicioNotificaciones` |
| `crear_bd.py` | Crea las tablas, la casa de prueba (protoboard) con sus reglas y el admin. **Borra los datos** |
| `prueba.py` | Prueba de punta a punta de toda la API |

## Qué hace

- **Varias casas**: cada casa tiene su clave de puente; el puente de cada PC dice de qué casa es. Cada usuario ve solo sus casas (el admin, todas).
- **Reglas** (crear, editar, borrar) y **horarios** (hora + días de la semana). Las reglas actúan cuando la condición *empieza* a cumplirse, así un botón manual no se deshace con la siguiente lectura.
- **Modo ausente**: si hay movimiento, avisa al dueño con una alerta.
- **Avisos del Arduino**: si el puente se desconecta más de 10 s, avisa; y cuando vuelve.
- **Historial**: luz promedio cada 15 min (o 3 h en 7 días) y detecciones de movimiento por hora (o día).
- **Sesiones guardadas** en la base (30 días, se guarda el hash del token): reiniciar el servidor no cierra sesión.
- **Solicitudes completas**: la de casa trae el plano (medidas en cuadrícula de 1 m, habitaciones que no se cruzan) y los dispositivos de cada habitación; al aprobarla se crean la casa, sus habitaciones y sus dispositivos «sin conectar». La de dispositivos trae casa, habitación (existente o nueva) y cantidades del catálogo. El admin conecta cada dispositivo a su canal del Arduino desde Admin → Casas.

## API

| Método | Ruta | Quién |
|---|---|---|
| POST | `/api/login`, `/api/registro`, `/api/logout` · GET `/api/yo`, `/api/salud` | todos / usuario |
| GET · POST | `/api/casas` | usuario (sus casas) · admin crea |
| PATCH | `/api/casas/{id}` `{estado_sistema, modo_ausente, direccion}` | dueño o admin |
| GET · POST | `/api/casas/{id}/habitaciones` | dueño o admin · admin crea |
| POST · DELETE | `/api/habitaciones/{id}/dispositivos` · `/api/dispositivos/{id}` | admin |
| GET · POST | `/api/casas/{id}/reglas` · PATCH · DELETE `/api/reglas/{id}` | dueño o admin |
| GET · POST | `/api/casas/{id}/horarios` · PATCH · DELETE `/api/horarios/{id}` | dueño o admin |
| GET | `/api/casas/{id}/historial?horas=24` | dueño o admin |
| GET · POST | `/api/notificaciones`, `/api/notificaciones/leidas` | usuario |
| GET · POST | `/api/solicitudes` · POST `/api/solicitudes/{id}` `{"aprobar": true}` | usuario · admin |
| GET | `/api/admin/usuarios` | admin |
| WS | `/ws`: puente `hola{token}` → `lectura`/`confirmacion` por canal; app `hola{token}` → `seleccionar{idCasa}`, `control{idDisp, accion, valor}` | |

## Instalar (una vez)

```bash
sudo -u postgres createuser -d $USER && createdb casa_inteligente
cd ~/ProyectoTA/servidor
.venv/bin/python crear_bd.py --correo tu@correo.com --nombre "Tu nombre"   # pide la contraseña
```
Para pasar una base de la v2 a la v3 sin perder nada: `psql -d casa_inteligente -f migrar_v3.sql`.
Si ya tienes usuarios y quieres rehacer lo demás: `.venv/bin/python crear_bd.py --conservar-usuarios`.
Para rehacer `.venv`: `python3 -m venv .venv && .venv/bin/pip install fastapi "uvicorn[standard]" "psycopg[binary]" bcrypt`.

## Correr (3 terminales, una por comando)

```bash
cd ~/ProyectoTA/servidor && .venv/bin/uvicorn app:app --host 0.0.0.0 --port 8765      # 1. servidor
cd ~/ProyectoTA/wokwi && .venv/bin/python pc/puente.py --puerto /dev/ttyACM0             # 2. Arduino
cd ~/ProyectoTA/app && python3 -m http.server 8080                                       # 3. app
```
Abre http://localhost:8080. En otro dispositivo de la misma red: `http://<IP del PC>:8080`.
El puente toma la clave de `wokwi/pc/token_puente.txt` (la crea `crear_bd.py`); para otra casa, `--token <clave>` (la ves en la app: Admin → Casas).
Cierra el Monitor Serie del Arduino IDE antes de correr el puente (ocupan el mismo puerto). Si el servidor se reinicia, el puente se reconecta solo.

## Fuera de casa (ZeroTier, ya instalado en el PC)

1. Crea una cuenta gratis en https://my.zerotier.com y una red («Create A Network»). Copia su **Network ID**.
2. En el PC: `sudo zerotier-cli join <Network ID>`.
3. En el celular: instala la app **ZeroTier One** y únete al mismo Network ID.
4. En my.zerotier.com, en la red, marca **Auth** para el PC y el celular. Anota la IP ZeroTier del PC (p. ej. 10.147.x.x).
5. En el celular abre `http://<IP ZeroTier del PC>:8080`. Funciona desde cualquier lugar con internet.

Para abrirlo a internet sin ZeroTier (Cloudflare Tunnel) usa HTTPS y limita `CASA_ORIGENES` a la dirección de la app.

## Pruebas

```bash
podman run -d --rm --name casa-pg-test -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=casa_inteligente -p 55432:5432 docker.io/library/postgres:16-alpine
export CASA_DB="host=127.0.0.1 port=55432 user=postgres dbname=casa_inteligente"
CASA_ADMIN_PASS=clave-prueba .venv/bin/python crear_bd.py --correo prueba@casa.test
.venv/bin/uvicorn app:app --port 8799 &  .venv/bin/python prueba.py
```
Con `CASA_DB` definida, `crear_bd.py` no toca la clave del puente real.
