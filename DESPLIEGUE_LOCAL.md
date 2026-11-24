# Despliegue local: servidor en el PC del Arduino + túnel

```
Arduino ─USB─ puente.py ─ws://localhost─► servidor (FastAPI + app + PostgreSQL) ─ túnel HTTPS ─► celulares
```
La app la sirve el mismo servidor, así que la URL del túnel abre la app y habla con `/api` y `/ws` sin CORS.
Un comando desde el celular llega al servidor, este lo manda al puente por su WebSocket y el puente lo escribe al Arduino (`CMD led 1`).

## 1. Una sola vez
```bash
git clone https://github.com/CamiloAcosta44/Smart-Home && cd Smart-Home
python3 -m venv servidor/.venv && servidor/.venv/bin/pip install -r servidor/requirements.txt
python3 -m venv wokwi/.venv   && wokwi/.venv/bin/pip install -r wokwi/requirements.txt
createdb casa_inteligente
cd servidor && .venv/bin/python crear_bd.py --correo tu@correo.com --nombre "Tu nombre" && cd ..
# crear_bd.py BORRA los datos: solo en una base nueva. Deja la clave del puente en wokwi/pc/token_puente.txt
sudo usermod -aG dialout $USER      # luego cerrar sesión y volver a entrar
```
Firmware: cierra el Monitor Serie, `sh wokwi/firmware/build.sh` y sube `build/firmware.hex` con avrdude.

## 2. Servicios (arrancan con el PC)
Edita `USUARIO` (y la ruta si no clonaste en `~/Smart-Home`) en los dos archivos de `despliegue/`.
```bash
sudo cp despliegue/casa-servidor.service despliegue/puente.service /etc/systemd/system/
sudo systemctl enable --now casa-servidor
# clave del puente: si usaste crear_bd.py ya está en wokwi/pc/token_puente.txt (borra la línea CASA_TOKEN_PUENTE);
# si no, cópiala de la app (Admin > Casas) a puente.service
sudo systemctl enable --now puente
```
Logs: `journalctl -u puente -f` (debe verse `Conectado al servidor` y `ARDUINO < CMD led 1` al pulsar en la app).
Desactiva la suspensión del PC (Configuración > Energía).

## 3. Túnel con URL fija
- **Tailscale Funnel** (recomendado): `sudo tailscale up` y `sudo tailscale funnel --bg 8765`; la URL es `https://<pc>.<tailnet>.ts.net`. Persiste tras reiniciar.
- **ngrok** (dominio estático gratuito): `ngrok http --url=TU-DOMINIO.ngrok-free.app 8765`.
- Cloudflare Quick Tunnel (`cloudflared tunnel --url http://localhost:8765`) cambia de URL en cada arranque: solo para pruebas.

Luego pon esa URL en `CASA_ORIGENES` de `casa-servidor.service` y `sudo systemctl daemon-reload && sudo systemctl restart casa-servidor`.

## 4. Verificar
1. Desde el celular con datos móviles abre la URL, inicia sesión e instala la PWA.
2. Pulsa encender/apagar luz y mover cortina: deben cambiar en el Arduino.
3. Mueve la mano frente al PIR: debe verse el evento en la app.
4. Respaldo: `sudo systemctl stop puente`; tras 15 s la cortina sigue reaccionando a la luz (300 abre, 250 cierra).
5. Reinicia el PC: todo debe subir solo.

## Operación
- Cambios: `git pull && sudo systemctl restart casa-servidor`. Si cambias la app, sube la versión del caché en `app/sw.js`.
- Copia: `pg_dump casa_inteligente > copia.sql`.
- Plan B sin depender de este PC: VM con Docker, ver `DESPLIEGUE.md`.
