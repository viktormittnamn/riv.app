# Riv

Riv (tidigare arbetsnamn Rivblock) är ett digitalt rivblock för avgränsade mål. Man skapar ett block med ett bestämt antal lappar, till exempel 10 pass, 21 dagar eller 30 sidor. Sedan river man av en lapp med fingret varje gång man gjort det. Blocket är klart när det är tomt. Det finns inga streaks och inget straff för missade dagar.

## Vad som finns

| Del | Var | Status |
|---|---|---|
| Appen (webb/PWA) | `src/` → byggs till `dist/index.html` (en fil, ~210 KB) | Klar, testad |
| iPhone-app | `ios/` (Capacitor 7, Swift Package Manager) | Projekt klart, kräver Xcode för att bygga |
| Android-app | `android/` (Capacitor 7) | Projekt klart, kräver Android Studio |
| Landningssida + integritet + support | `site/` | Klar, behöver kontakt-e-post |
| App Store-skärmbilder sv/en (6,9") | `store/screenshots/` | Klara |
| App Store-texter sv/en | `store/listing.md` | Klara |
| Research & positionering | `docs/RESEARCH.md` | Klar |
| Lanseringsguide steg för steg | `docs/LAUNCH.md` | Klar |

## Funktioner

- Hylla med flera block. Avklarade block sparas som "Tomma block".
- Två tempon: **En om dagen** (nästa lapp öppnas dagen efter, missad dag = lappen väntar) och **Eget tempo**.
- Riv med fingret längs perforeringen. Ljuden skapas i appen och vibrationen följer perforeringen (riktig haptik i appen, `navigator.vibrate` på Android-webben).
- En valfri anteckning på varje lapp. Ångra syns direkt efter varje rivning.
- Ett tomt block visar kartongen med alla lappar, datum, anteckningar och statistik.
- Delningsbild 1080×1350 (Instagram 4:5).
- Sex papper: Rosa, Smör, Mint, Himmel, Kvitto, Kol.
- Svenska och engelska (automatiskt efter telefonens språk, eller valt i inställningar).
- Daglig påminnelse (i appen), säkerhetskopia (spara/läs in), ljus och mörk design.
- Tillgänglighet: lappen kan rivas med Enter/mellanslag, skärmläsaren får besked och rörelser minskas om telefonen ber om det.
- Introblock första gången man öppnar appen. Man lär sig genom att riva.
- Betalvägg förberedd men avstängd (`PAYWALL` i `src/main.js`).

## Kommandon

```sh
npm install
npm run dev        # utvecklingsserver, öppna adressen i mobilen på samma wifi
npm test           # enhetstester (logik)
npm run build      # bygger dist/index.html och dist/artifact.html
npm run e2e        # klicktester i riktig Chrome (kör build först)
npm run shots      # App Store-skärmbilder
npm run site       # bygger appen in i site/app/ → ladda upp hela site/
npm run ios        # bygger, synkar och öppnar Xcode (kräver Xcode)
npm run android    # samma för Android Studio
```

## Struktur

```
src/logic.js     ren logik (block, rivning, dagar, migrering, backup) – enhetstestad
src/main.js      vyer, rivfysik, sheets, inställningar
src/i18n.js      svenska + engelska
src/platform.js  webb vs app: lagring, haptik, delning, påminnelser, köp
src/audio.js     syntetiserade pappersljud (Web Audio)
src/share.js     delningsbilden (canvas)
src/styles.css   design (tokens överst)
tests/           logic.test.js (vitest), e2e.mjs, store-shots.mjs
```

Teckensnitten (Big Shoulders Display, Instrument Sans, IBM Plex Mono) ligger i `src/fonts/` under SIL Open Font License och byggs in i filen. Appen fungerar därför helt offline.
