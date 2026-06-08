# Zobrazovač teploty – obývačka

Jednoduchý web na zobrazenie aktuálnej teploty, vlhkosti a tlaku zo senzora BME280.
Dáta sa načítavajú z ThingSpeak kanála `3318002`.

## Čo zobrazuje
- **Aktuálna teplota** – hlavný, ústredný prvok.
- **Vlhkosť a tlak** – menším písmom pod teplotou.
- **Graf teploty** – priebeh dnešnej teploty.

## Spustenie
Sú to statické súbory, stačí otvoriť `index.html` v prehliadači.

Alebo cez lokálny server (kvôli `fetch`):

```bash
python -m http.server 8000
# potom otvor http://localhost:8000
```

## Súbory
- `index.html` – štruktúra stránky
- `style.css` – štýly (tmavý moderný vzhľad)
- `app.js` – načítanie dát z ThingSpeak, prepočty a graf (Chart.js)

## Dáta (ThingSpeak)
- `field1` → teplota (°C)
- `field2` → vlhkosť (%)
- `field3` → tlak (hPa)

Stránka sa automaticky obnovuje každú minútu.
