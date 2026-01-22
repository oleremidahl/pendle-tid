# Finn Pendle Tid

En Chrome extension som automatisk viser pendletid fra boligannonser på Finn.no til ditt arbeidssted.

## 📍 Hva gjør extensionen?

Når du ser på en boligannonse på Finn.no, henter extensionen automatisk:
- **Pendletid** fra boligen til arbeidsstedet (Vippetangen)
- **Detaljert rute** med kollektivtransport (buss, trikk, tog, t-bane, etc.)
- **Gangavstand** totalt
- **Avgangstid** og **ankomsttid**
- **Steg-for-steg** veiledning med linjenummer og estimert tid

Informasjonen vises i en toast øverst til høyre på siden.

## Installasjon

### Steg 1: Last ned eller klon prosjektet
```bash
git clone https://github.com/oleremidahl/pendle-tid.git
```

### Steg 2: Åpne Chrome Extensions
1. Åpne Chrome
2. Gå til `chrome://extensions/`
3. Aktiver **Developer mode**

### Steg 3: Last inn extensionen
1. Klikk på **Load unpacked**
2. Velg mappen der du lastet ned prosjektet

## 💡 Bruk

1. Gå til [Finn.no](https://www.finn.no)
2. Søk etter boliger (kjøp eller utleie)
3. Åpne en boligannonse
4. Extensionen henter automatisk pendletid og viser informasjonen.

## ⚙️ Tilpasning

### Endre destinasjon (arbeidssted)

Åpne `content.js` og endre koordinatene i linje 1:

```javascript
const DESTINATION = { lat: 59.90386208001988, lon: 10.739245328835816 };
```

Erstatt med ditt eget arbeidssted sine koordinater (lat/lon).

### Planlegge rute basert på ankomsttid

For å få ruter som ankommer før et bestemt tidspunkt, åpne `content.js` og endre:

```javascript
const USE_ARRIVAL_TIME = false;  // Sett til true for å aktivere
const ARRIVAL_TIME = "2026-05-18T08:00:00+02:00";  // Ønsket ankomsttid
```

Når `USE_ARRIVAL_TIME` er `true`, vil extensionen vise ruter som ankommer før det angitte tidspunktet.

**Viktig:** Etter å ha gjort endringer i koden, må du refreshe extensionen i Chrome:
1. Gå til `chrome://extensions/`
2. Finn "Finn Pendle Tid"
3. Klikk på refresh-ikonet (🔄) for extensionen

## 🛠️ Teknologi

- **Entur API** - For kollektivtransport-data i Norge
- **Chrome Extension Manifest V3**
- Vanilla JavaScript

## 📝 Notater

- Bruker Entur sitt API for sanntids kollektivtransport-data
- Du kan valgfritt sette en ankomsttid for å planlegge når du må dra (se Tilpasning)
- Kun aktivert på Finn.no sine boligsider
- Krever internettilkobling for å hente rutedata

---
