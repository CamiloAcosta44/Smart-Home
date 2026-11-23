"""Cliente que solo mira el estado de la casa (lo que vería la app de escritorio)."""
import asyncio, json, sys
import websockets

async def main(url):
    async with websockets.connect(url) as ws:
        await ws.send(json.dumps({"tipo": "hola", "rol": "app"}))
        async for raw in ws:
            e = json.loads(raw)
            print(f"ESTADO  movimiento={e['movimiento']}  luz={e['luz']} lux  "
                  f"led={e['led']}  cortina={e['cortina']}%", flush=True)

asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "ws://localhost:8765"))
