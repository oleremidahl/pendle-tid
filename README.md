<!-- cSpell:disable -->
# Finn Pendle Tid

En liten Chrome-utvidelse som gjør FINN-boligannonser mer nyttige ved å vise hvor lang tid det faktisk tar å komme seg til reisemålet ditt.

## Hva gjør utvidelsen?

Når du åpner en boligannonse på FINN.no, viser utvidelsen en kompakt popup øverst til høyre på siden med:
- **Kollektiv**: total reisetid, avgang, ankomst og samlet gådistanse
- **Gå hele veien**: total gåtid og total distanse uten transport
- **Etappevis oversikt** for kollektivruten, inkludert bytter og ventetid
- **Fast sammenligningsgrunnlag** basert på neste hverdag og tidspunktet du vil være fremme
- **Tydelige statusmeldinger** når reisemål mangler, adresser ikke kan tolkes, eller ruter ikke finnes

Utvidelsen er bygget i ren Manifest V3 med vanlig HTML, CSS og JavaScript, uten avhengigheter eller build-steg.

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

## Kom i gang

1. Last utvidelsen i Chrome via `chrome://extensions/`
2. Åpne utvidelsens **Options**-side eller klikk på utvidelsesikonet
3. Skriv inn reisemålet ditt, velg riktig treff fra søkeforslagene, og sett når du vil være fremme
4. Gå til en boligannonse på [Finn.no](https://www.finn.no)
5. Popupen vises automatisk øverst til høyre på siden

## Innstillinger

Du trenger ikke å redigere kode for å bruke utvidelsen.

På options-siden kan du:
- søke etter reisemålet ditt med forslag fra Entur
- velge riktig treff fra nedtrekkslisten
- lagre tidspunktet du ønsker å være fremme, på format `HH:mm`

Utvidelsen lagrer bare et gyldig Entur-treff, slik at sammenligningen blir stabil og presis på tvers av annonser.

## Opplevelse i FINN

- Popupen er liten, fastplassert og enkel å skanne mens du blar i annonser
- Kollektiv og gange vises samtidig i hver sin kompakte seksjon
- Kollektivdelen kan utvides for å vise etapper og bytter
- Popupen kan lukkes og kommer tilbake når du åpner eller navigerer til en ny annonse
- Fungerer på både kjøps- og leieannonser på FINN

## Teknologi

- **Entur API** - For kollektivtransport-data i Norge
- **Chrome Extension Manifest V3**
- Vanilla JavaScript
- `chrome.storage.sync` for innstillinger

## Notater

- Bruker Entur sitt API for sanntids kollektivtransport-data
- Bruker neste hverdag og valgt ankomsttid for å gi mer sammenlignbare pendletall
- Krever internettilkobling for å hente rutedata

---
