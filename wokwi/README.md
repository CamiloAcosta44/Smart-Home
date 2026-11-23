# Casa Inteligente — simulación en Wokwi

Arquitectura (según `UmlFinal.drawio` y los diagramas de arquitectura y aplicación):

```
Arduino Mega 2560 (Wokwi) ──serial USB──> PC servidor: puente.py ──WebSocket JSON──> servidor.py (ControladorAutomatizacion + Reglas)
                                                                                     └──> apps (ver_estado.py) ven el estado
```

El Arduino solo lee sensores y ejecuta comandos; las reglas corren en el backend.

| Archivo | Qué es |
|---|---|
| `diagram.json`, `wokwi.toml` | Plano del circuito en protoboard de 400 puntos: PIR (D2), LDR + 10 kΩ (A0), LED + 220 Ω (D7), servo de la cortina (D9), botón de prueba (D3) |
| `firmware/firmware.ino`, `firmware/build.sh` | Firmware del Arduino y su compilación con el avr-gcc del Arduino IDE |
| `pc/puente.py` | Programa puente (ClienteServidor): serial ↔ WebSocket. `--sim` (Wokwi) o `--puerto /dev/ttyACM0` (real) |
| `pc/servidor.py` | Backend: `ControladorAutomatizacion.procesarLectura → evaluarReglas` |
| `pc/ver_estado.py` | Cliente que muestra el estado (lo que verá la app de escritorio) |
| `demo.yaml` | Escenario que mueve los sensores y comprueba el pin del LED |

### Montaje en la protoboard (plano para armarlo en físico)

`diagram.json` es el plano: cada pieza está en un agujero real de una protoboard de 400 puntos (30 columnas). Vista de referencia: `plano.jpg`.
Columnas numeradas 1–30 de izquierda a derecha; filas a–e (mitad de arriba) y f–j (mitad de abajo).
Rieles: arriba **+** (fila superior) y **−**; abajo **+** y **−** (fila inferior). El riel + de abajo no se usa.

| # | Desde | Hasta | Color |
|---|---|---|---|
| 1 | Arduino **5V** | riel **+ de arriba** (agujero 1) | rojo |
| 2 | Arduino **GND** (junto al pin 13, fila de arriba) | riel **− de abajo** (agujero 1) | negro |
| 3 | riel − de arriba (1) | riel − de abajo (1) — puente por el lado izquierdo | negro |
| 4 | PIR **VCC** | riel + de arriba | rojo |
| 5 | PIR **OUT** | columna **25** fila f | verde |
| 6 | PIR **GND** | riel − de arriba | negro |
| 7 | Arduino **D2** | columna **25** fila j | verde |
| 8 | Servo **V+** (rojo) | riel + de arriba | rojo |
| 9 | Servo **GND** (marrón) | riel − de arriba | negro |
| 10 | Servo **señal** (naranja) | columna **17** fila f | naranja |
| 11 | Arduino **D9** | columna **17** fila j | naranja |
| 12 | Arduino **D7** | columna **20** fila j | amarillo |
| 13 | Resistencia **220 Ω** | columna 14 fila h ↔ columna 20 fila h | — |
| 14 | **LED**: pata larga (+) | columna **14** fila f | — |
| 15 | **LED**: pata corta (−) | columna **13** fila f | — |
| 16 | columna 13 fila j | riel − de abajo | negro |
| 17 | Resistencia **10 kΩ** | riel + de arriba (agujero 25) ↔ columna **30** fila c | — |
| 18 | **LDR** pata 1 | columna **30** fila d | morado |
| 19 | **LDR** pata 2 | riel − de arriba | negro |
| 20 | Arduino **A0** | columna **30** fila e | morado |

En Wokwi la LDR es un potenciómetro (Wokwi no tiene LDR de dos patas) y hay un botón azul «Simular movimiento» en la columna 24 → D3: **no van en el montaje físico**.
Wokwi tampoco calcula divisores de resistencias: la de 10 kΩ está para que el plano sea igual al físico.

## Protocolo

- Serial (115200): Arduino → `EVT luz <lux>`, `EVT mov <0|1>`, `OK led <0|1>`, `OK cortina <0-100>`; PC → `CMD led <0|1>`, `CMD cortina <0-100>`
- WebSocket: `{"tipo":"lectura","idDisp":2,"valor":"512"}`, `{"tipo":"accion","idDisp":3,"accion":"encender"}`, `{"tipo":"estado",...}`
- idDisp: 1 movimiento, 2 luz, 3 LED, 4 cortina

## Reglas

| Condición | Acción |
|---|---|
| Hay movimiento | Enciende el LED |
| No hay movimiento | Apaga el LED |
| Luz ≥ 800 lux | Cierra la cortina (servo 0°) |
| Luz ≤ 200 lux | Abre la cortina (servo 90°) |

## Correr la demo (3 terminales, desde esta carpeta)

```bash
export WOKWI_CLI_TOKEN=wok_...        # token de https://wokwi.com/dashboard/ci
./firmware/build.sh                   # solo si cambias el firmware

.venv/bin/python pc/servidor.py                                       # 1. backend
.venv/bin/python pc/ver_estado.py                                     # 2. app que mira el estado
.venv/bin/python pc/puente.py --sim --escenario demo.yaml --minutos 1 # 3. Arduino simulado + puente
```

Sin `--escenario`, la simulación corre sin cambios en los sensores hasta que pasan los `--minutos`. Cada minuto descuenta del cupo de Wokwi CI.

Con el Arduino real: sube `firmware.ino` desde el Arduino IDE y corre `pc/puente.py --puerto /dev/ttyACM0`.

## Verlo de forma visual

En https://wokwi.com/projects/new/arduino-uno pega `diagram.json` en la pestaña *diagram.json* y `firmware.ino` en *sketch.ino*, y dale Play.
Haz clic en el PIR (*Simulate motion*) o gira el potenciómetro (la LDR) para cambiar la luz. Escribe `CMD led 1` o `CMD cortina 0` en el Serial Monitor para hacer de backend.
El editor web no se conecta con `puente.py`; para eso está `wokwi-cli`.

## Limitaciones

- El PIR de Wokwi no se puede automatizar; por eso existe el botón de D3 («Simular movimiento»). En el montaje real se deja sin conectar.
- La curva lux (`GAMMA`, `RL10`) supone una LDR típica con 10 kΩ hacia 5V; con la LDR real los lux son aproximados. Si hace falta, ajustar los umbrales de `servidor.py`.
- No incluye PostgreSQL, login ni la app de escritorio: las reglas y los idDisp están fijos en `servidor.py`.
