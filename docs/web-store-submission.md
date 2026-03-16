# Chrome Web Store Submission Notes

## Listing

- Navn: `Finn Pendle Tid`
- Primærspråk: `Norwegian (nb)`
- Foreslatt kategori: `Productivity`
- Homepage URL: `https://oleremidahl.github.io/pendle-tid/`
- Support URL: `https://oleremidahl.github.io/pendle-tid/support/`
- Privacy policy URL: `https://oleremidahl.github.io/pendle-tid/privacy-policy/`

## Short Description

Sammenlign kollektiv pendletid og ren gangtid direkte i FINN-boligannonser.

## Full Description

Finn Pendle Tid gjør boligjakten på FINN.no mer praktisk for pendlere.

Utvidelsen viser en liten popup overst til hoyre pa boligannonser for kjøp og leie, og sammenligner to alternativer:

- kollektiv reisetid til reisemalet ditt
- total tid og distanse hvis du gar hele veien

Du velger selv reisemal og tidspunktet du vil vare fremme. Utvidelsen bruker dette som et fast sammenligningsgrunnlag mot neste hverdag, slik at det blir lettere a sammenligne ulike boliger pa en rettferdig mate.

Hovedfunksjoner:

- kompakt popup direkte pa FINN-boligannonser
- kollektiv + gange vist samtidig
- utvidbar detaljvisning for kollektivruten
- sokeforslag for reisemal via Entur
- lagring av innstillinger i Chrome

Finn Pendle Tid fungerer kun pa FINN.no sine boligsider og bruker Entur for geokoding og ruteberegning.

## Single Purpose Field

Denne utvidelsen har ett formål: å sammenligne kollektiv pendletid og ren gangtid fra FINN-boligannonser til et brukerdefinert reisemål.

## Permission Justification

- `storage`
  - brukes for a lagre brukerens reisemal og valgt ankomsttid i `chrome.storage.sync`
- `webNavigation`
  - brukes for a oppdage nar FINN navigerer mellom annonser i samme fane, slik at popupen kan oppdateres riktig
- `https://www.finn.no/*`
  - begrenser innlasting og adresseavlesning til FINN
- `https://api.entur.io/*`
  - brukes for geokoding og ruteberegning

## Privacy Tab Answers

### Data types to disclose

- `Website content`
  - fordi utvidelsen leser adresseteksten pa den aktuelle FINN-annonsen
- `Location`
  - fordi brukeren lagrer et reisemal som adresse eller koordinater

### Certifications to answer "Yes"

- data brukes kun for utvidelsens beskrevne kjernefunksjon
- data selges ikke
- data brukes ikke til kredittvurdering eller utlansformal
- data brukes ikke til annonser eller markedsforing
- data brukes ikke til a bestemme forsikringspriser eller boligtilbud
- data overfores kun til Entur for geokoding og ruteberegning

### Dashboard notes

- Opplysningene i Privacy-tabben ma matche personvernerklaeringen ordrett i innhold, ikke bare i intensjon.
- Hvis Chrome Web Store krever en mer konservativ tolkning av lagret reisemal, velg heller en ekstra datakategori enn a underopplyse.

## Reviewer Notes

Finn Pendle Tid har ett brukerrettet formål: å vise sammenlignbar pendletid på FINN sine boligannonser.

Teknisk oppfører utvidelsen seg slik:

- den injiseres bare på FINN.no sine boligsider for kjøp og leie
- den leser bare adresseteksten i den aktuelle annonsen
- den sender bare nødvendige adresseopplysninger til Entur for geokoding og ruteoppslag
- den har ingen egen backend og laster ikke fjernkode
- den bruker ikke analyser, annonser eller sporing
- den lagrer bare reisemål og ankomsttid i `chrome.storage.sync`

## Screenshot Checklist

Chrome Web Store krever minst ett skjermbilde, og anbefaler opptil fem. Hvert skjermbilde bor vare `1280x800` eller `640x400`, full bleed og vise faktisk brukeropplevelse.

For denne første publiseringen:

1. `01-options-search-dropdown.png`
   - options-siden med apent sokeforslagsfelt for reisemal
2. `02-finn-buy-popup.png`
   - FINN kjopsannonse med kompakt popup synlig
3. `03-finn-rental-popup-expanded.png`
   - FINN leieannonse med popup og utvidet kollektivdetalj

Se også [docs/screenshots/README.md](/docs/screenshots/README.md).
