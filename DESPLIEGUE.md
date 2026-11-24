# Despliegue

> Para correr el servidor en el PC del Arduino con túnel, ver `DESPLIEGUE_LOCAL.md`. Esta guía es el plan B con VPS y Docker.

```
Arduino ─USB─ PC (puente.py) ─wss─► VPS: Caddy(HTTPS) → servidor FastAPI (+ app) → PostgreSQL ◄─https─ celular
```

## 1. Servidor + app (VPS con Docker)
1. Apunta un dominio a la IP de la VPS (puede ser gratis con DuckDNS).
2. En la VPS: `git clone <repo> && cd <repo>`, `cp .env.example .env` y edita `DOMINIO` y `DB_PASS`.
3. `docker compose up -d --build`
4. Solo la primera vez, crea tablas y administrador:
   `docker compose exec servidor python crear_bd.py --correo tu@correo.com --nombre "Tu nombre"`
   (borra datos: no repetir). Entra a `https://DOMINIO` e instala la app desde el navegador.
5. Actualizar: `git pull && docker compose up -d --build`.

Sin VPS: Render/Railway sirven con el mismo `Dockerfile` + su Postgres (variable `CASA_DB`).

## 2. Puente (PC del Arduino)
1. Cierra el Monitor Serie del IDE y sube el firmware (`wokwi/firmware`, `sh build.sh`).
2. Copia la clave del puente desde la app (Admin > Casas).
3. Edita `puente.service` y instálalo (instrucciones dentro). Se reinicia solo y se reconecta.
   Probar a mano: `CASA_SERVIDOR=wss://DOMINIO/ws python pc/puente.py --puerto /dev/ttyACM0 --token CLAVE`

## 3. Respaldo en el Arduino
El puente manda `HB` cada 5 s mientras hay conexión con el servidor. Sin latido por 15 s
(internet o servidor caído) el firmware controla la cortina solo: abre sobre 300 lux, cierra bajo 250.
Al volver el servidor, retoma el control.

## Desarrollo local
`uvicorn app:app --reload --port 8765` en `servidor/`: la app queda en http://localhost:8765.
