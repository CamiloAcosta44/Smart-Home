# Tecnologías del proyecto — Casa Inteligente

Aplicación web (computador y móvil) en **Python**, escalable, con un ESP32 conectado por **WebSocket** en la misma red local.

## 1. Backend (Python)

| Pieza | Tecnología | Motivo |
|---|---|---|
| Framework | **Django 5** | Autenticación, roles, sesiones, ORM y migraciones incluidos. Resuelve Usuario/Administrador. |
| API | **Django REST Framework** (o Django Ninja) | API que consume el front. |
| WebSocket | **Django Channels** + **Daphne/Uvicorn** (ASGI) | Cada conexión del ESP32 es un *consumer* = `ConexionWiFi`. |
| Tiempo real al navegador | Channels (el mismo) | El estado llega sin recargar la página. |
| Capa de canales | **Redis** | Reparte mensajes entre procesos de Channels. |
| Base de datos | **PostgreSQL** desde el inicio (en desarrollo y producción) | Casas, solicitudes, eventos/logs. Escrituras concurrentes de sensores, `JSONB` y logs que crecen sin parar. Se levanta con Docker Compose. |
| Notificaciones | **pywebpush** (Web Push con VAPID) | `ServicioNotificaciones`. |
| Tareas en segundo plano | Ninguna al inicio (Celery solo si hacen falta reportes o limpieza de logs) | Evita complejidad innecesaria. |

- **Panel del Administrador:** el Django Admin puede cubrir casas activas, dispositivos y logs; si se exige uno propio, se hace en React.
- **Alternativa descartada:** FastAPI es más ligero, pero habría que construir autenticación, roles y admin a mano.
- Al usar PostgreSQL desde el inicio, el entorno de desarrollo es igual al de producción y se pueden aprovechar `JSONB` e índices avanzados. Driver: **psycopg 3**.

## 2. Frontend (TypeScript)

- **React + Vite + TypeScript** (no Next.js: ya hay backend y no se necesita SSR).
- **Tailwind CSS** con una librería de componentes (shadcn/ui o similar), responsive.
- **TanStack Query** para la API y **WebSocket nativo** para el tiempo real.
- **PWA** con `vite-plugin-pwa`: indispensable para notificaciones (Web Push exige *service worker*; en iPhone solo funciona con la web instalada en la pantalla de inicio).

## 3. Firmware (ESP32)

Fuera del alcance directo del servidor, pero el protocolo sí (ver `PROTOCOLO_ESP32.md`):

- **PlatformIO** con el framework Arduino.
- Librerías: **WebSockets** (Links2004) y **ArduinoJson**.
- El ESP32 es cliente WebSocket, se autentica con un token por casa y reenvía por UART al Arduino.

## 4. Infraestructura y calidad

- **Docker Compose**: Django, PostgreSQL y Redis, con **Caddy** o Nginx delante.
- **pytest-django** (backend), **Vitest** (front), **Playwright** (prueba de punta a punta).
- **Ruff** y **mypy** en Python; **ESLint** en TypeScript.

## 5. Advertencias

1. **HTTPS en red local.** Las notificaciones y los *service workers* solo funcionan en HTTPS (o `localhost`). Abrir la web desde el celular con `http://192.168.x.x` no funcionará. Opciones: certificado local con **mkcert**, Caddy con certificado interno, o un túnel (Cloudflare Tunnel). El ESP32 puede usar `ws://` dentro de la LAN.
2. **Escalabilidad = diseño, no framework.** Lo que permite crecer es un modelo de datos multi-casa (cada Casa con su ESP32 y token), la interfaz `CanalComunicacion` y un monolito ordenado. Más adelante se puede pasar de WebSocket a **MQTT** (Mosquitto) sin reescribir. No empezar con microservicios.

## 6. Correspondencia con el diagrama de clases

| Diagrama | Código |
|---|---|
| Usuario, Administrador, Casa, Habitación, Dispositivo, Solicitud, Evento, Regla | Modelos de Django |
| SistemaCentral (Controller) | Módulo de servicios (`services.py`), no un modelo |
| ConexionWiFi (`CanalComunicacion`) | Consumer de Channels |
| ServicioNotificaciones | Servicio con `pywebpush` |
| `Regla.evaluar()` | Función que corre al llegar cada Evento |

## 7. Decisiones pendientes

- Autenticación: sesiones de Django (más simple con SPA en el mismo origen) o JWT.
- Relación Administrador–Usuario: herencia directa o clase base común (ver conversación del diagrama).
- Cómo se resolverá HTTPS para las notificaciones en la red local.
