# Rush for 972?

A small static app that checks live arrivals for bus `972` at bus stop `44691` using the ArriveLah API.

## Run

```powershell
python -m http.server 5173 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:5173/
```

The app refreshes every 15 seconds and lets you adjust your walking time to the stop. It says:

- `Rush now` when the next bus is at or inside your walk time plus a 1 minute buffer.
- `Leave soon` when the bus is close but there is still a small buffer.
- `No need to rush` when there is enough time.
