# Release Checklist

## Before packaging

1. Oppdater versjonsnummeret i `manifest.json`.
2. Bekreft at personvernerklaeringen og support-siden fortsatt matcher faktisk databruk.
3. Bekreft at `permissions` og `host_permissions` fortsatt er minimale.
4. Oppdater README og `docs/web-store-submission.md` hvis funksjonaliteten har endret seg.
5. Kontroller at GitHub Pages er aktivert fra `/docs` pa `main` og at disse URL-ene virker uten innlogging:
   - `https://oleremidahl.github.io/pendle-tid/`
   - `https://oleremidahl.github.io/pendle-tid/privacy-policy/`
   - `https://oleremidahl.github.io/pendle-tid/support/`

## Listing and compliance

1. Oppdater Chrome Web Store listing med korrekt tittel, beskrivelse og kategori.
2. Bekreft at Privacy-tabben samsvarer med personvernerklaeringen.
3. Bekreft at reviewer notes samsvarer med manifestet og faktisk kode, inkludert Entur-sokeforslag fra options-siden og kravet om eksplisitt valgt reisemal.
4. Oppdater supportkontakt i Chrome Web Store til en aktiv e-post eller support-hub.

## Screenshots

1. Ta minst fire oppdaterte skjermbilder som viser:
   - options-siden med sokeforslag
   - FINN kjopsannonse med popup i utvidet visning
   - FINN kjopsannonse med popup i minimert visning
   - FINN leieannonse med utvidet kollektivdetalj
2. Eksporter skjermbildene som `1280x800` eller `640x400`.
3. Legg dem i `docs/screenshots/` og oppdater eventuell filnavnsliste.

## Package and verify

1. Kjor:

   ```bash
   ./scripts/package-extension.sh
   ```

2. Kontroller at zip-filen bare inneholder runtime-filene for utvidelsen.
3. Last inn zip-innholdet som unpacked build i Chrome og gjor en siste smoke test.
4. Last opp zip-filen til Chrome Web Store.
