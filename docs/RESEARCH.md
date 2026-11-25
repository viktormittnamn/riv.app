# Research och positionering (november 2026)

## Marknaden

Det finns väldigt många vanappar i App Store. En sökning på "habit tracker" ger dussintals nya appar från 2026. Nästan alla bygger på samma mall: bockar, cirklar, kalenderrutnät och streaks.

Exempel som ligger nära Rivblock:

| App | Vad den gör | Skillnad mot Rivblock |
|---|---|---|
| [Tear & Try](https://www.alternativeto.net/software/tear-and-try/about/) | Rivkalender med en ny *slumpad* mikro-utmaning per dag | Appen bestämmer utmaningen, reklamfinansierad, mynt |
| [Reflect](https://apps.apple.com/us/app/habit-tracker-reflect/id6757188703) | Ändliga cykler på 7/14/21 dagar, "inga streaks" | Klassiskt UI, gratis med köp i appen |
| [Do ① Thing](https://apps.apple.com/us/app/do-thing/id6763198346) | En vana, en dag, engångsköp $0.99 | Bara en vana, inget fysiskt objekt |
| [TwentyOne](https://apps.apple.com/us/app/-/id6763133927) | 21-dagarsutmaning eller rutiner | Gratis + köp, vanligt UI |
| [Mostly Daily](https://apps.apple.com/app/id6817720468) | Nollställs inte vid en miss, mosaik | Kalender/mosaik, ingen rivning |
| [Streak-Free](https://apps.apple.com/us/app/id6737206675) | Uttalat streak-fri | Lista/kalender |

**Slutsats:** "inga streaks" och "ändliga utmaningar" finns redan som säljargument. Det räcker inte ensamt. Det som ingen annan har är det **fysiska objektet**: perforering, ljud, vibration, papper som faller, ett tomt block att visa upp. Därför ska marknadsföringen visa själva rivningen, inte listor med funktioner.

## Positionering

> **Rivblock – riv av när du gjort det.**
> Ett block per mål. Blocket är klart när det är tomt.

- Målgrupp: 20–40 år, trötta på appar med grafer och prenumerationer, gillar design och papper (bullet journals, Muji, Moleskine).
- Använd ordet "block", inte "vana". Ett block tar slut, en vana gör det inte.
- Det som delas är tomt block-bilden, en trofé man vill visa upp.

## Haptik i webbläsaren (teknisk research)

- iOS Safari stöder inte `navigator.vibrate`.
- Ett trick med `<input type="checkbox" switch>` gav en kort haptisk knäpp i iOS 17.4–26.4. Enligt [ios-haptics](https://unpkg.com/ios-haptics@3.1.1/README.md) och [iOS Haptics Tester](https://rapidtoolset.com/en/tool/ios-haptics-tester) stängde Apple det i iOS 26.5. Tricket finns kvar i koden som reserv, men det går inte att räkna med.
- Därför ger bara den inbyggda appen (Capacitor Haptics) riktig vibration på iPhone. Det är ett starkt skäl att ge ut appen i App Store och inte bara som webbapp.

## Pris

Små designfokuserade engångsköpappar ligger kring $0.99–$4.99 (Do ① Thing $0.99, Ascend One $2.99). Rekommendation: **39 kr** som betalapp vid lansering, eller gratis + 49 kr engångsköp om testerna visar att folk vill prova först.

## Idéer till version 1.1+

1. **Delade block för två** (Geminis idé 3): båda river från samma block. Det sprids naturligt eftersom varje block kräver en inbjudan, men det kräver en server.
2. **Hemskärmswidget** med dagens lapp (kräver Swift-kod i Xcode).
3. Fler papper som köp: termokvitto med tryckt logga, biobiljett, garderobsnummer.
4. "Mallar" för populära block, som 75 Hard, Dry January eller 30 dagars yoga, så att man kommer igång snabbare.
5. Live-aktivitet eller lås-skärmswidget med en räknare för lappar kvar.
