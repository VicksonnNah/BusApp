# Bus arrivals

A small static app that checks live arrivals for all bus services at a selected stop using the ArriveLah API. Enter a stop code to change stops, then choose a bus service to view its arrival times. The selected stop is saved in this browser. When available, the app also displays the stop name from the BusRouter stop catalogue.

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
