# Plan de despliegue: servidor en el PC del Arduino

```
Arduino ─USB─ PC: puente.py → servidor v3 + Postgres + app ─ túnel HTTPS fijo ─► celulares
```

## Fases
1. **Poner la v3 como código que corre** — HECHO (22 nov 2026)
   - `servidor/` y `app/` reemplazados por la v3; respaldo en `backup_2026-11-22/` (código y `bd/casa_inteligente.sql`).
   - `migrar_v3.sql` aplicado a la base real sin perder datos.
   - Pendiente: reiniciar el servidor para cargar la v3.
2. **Túnel con URL fija y gratuita**
   - Recomendado: Tailscale Funnel (`tailscale funnel 8765`). Alternativa: ngrok con dominio estático gratuito.
   - Limitar `CASA_ORIGENES` a la URL del túnel.
3. **Servicios que arrancan con el PC** (`systemd`)
   - `casa-servidor`: `uvicorn app:app --host 127.0.0.1 --port 8765`.
   - `casa-puente`: `puente.py` con `CASA_SERVIDOR=ws://localhost:8765/ws` (plantilla en `despliegue/puente.service`).
   - Túnel como servicio. Desactivar la suspensión del PC.
4. **Verificación**
   - `prueba.py`; abrir la URL pública desde un celular con datos móviles, iniciar sesión e instalar la PWA.
   - Probar lectura y comando; reiniciar el PC y confirmar que todo sube solo.
5. **Con el Arduino**
   - Subir el firmware (`wokwi/firmware`, `sh build.sh`, avrdude) y arrancar el puente.
   - Probar el respaldo: detener el puente y comprobar que la cortina sigue reaccionando (300 lux abre, 250 cierra, tras 15 s sin latido `HB`).
6. **Operación**
   - Cambios: editar y `git pull`; el servidor se recarga con `--reload`. Para la app, subir la versión del caché en `sw.js`.
   - Copia semanal: `pg_dump casa_inteligente > copia.sql` (cron).
   - Plan B sin depender del PC: VM Always Free de Oracle con `docker-compose.yml` (ver `DESPLIEGUE.md`).

Guía paso a paso de esta opción: `DESPLIEGUE_LOCAL.md` (servicios `despliegue/casa-servidor.service` y `despliegue/puente.service`).
