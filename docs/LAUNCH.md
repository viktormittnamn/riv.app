# Lansering steg för steg

Det här kan du göra själv. Allt som går att förbereda utan ditt konto är förberett.

## Steg 1 – Testa med vänner (gratis, 10 minuter)

1. Kör `npm run site` i mappen `~/Rivblock` (eller be Claude göra det).
2. Gå till **app.netlify.com/drop** och dra in mappen `~/Rivblock/site`.
3. Du får en adress, till exempel `https://namn.netlify.app`. Skapa ett gratis konto, så försvinner sidan inte efter en timme.
4. Öppna `https://namn.netlify.app/app/` i Safari på iPhone → Dela → **Lägg till på hemskärmen**.
5. Skicka länken till 5–10 vänner och be dem använda appen i en vecka.

**Fråga dem:** Rev du av lappar efter dag 3? Delade du någon bild? Vad saknades?

> På webben vibrerar inte iPhone (Apple stängde tricket i iOS 26.5). Ljudet fungerar. Den riktiga vibrationen kommer med App Store-versionen.

## Steg 2 – Bygg iPhone-appen

1. Installera **Xcode** från Mac App Store (gratis, ca 10 GB).
2. Öppna Terminal och kör:
   ```sh
   cd ~/Rivblock
   sudo xcode-select -s /Applications/Xcode.app
   npm run ios
   ```
3. Xcode öppnas. Välj en iPhone-simulator uppe till vänster och tryck ▶. Appen startar.
4. Vill du köra den på din egen telefon: koppla in den med sladd, välj den i listan, gå till **Signing & Capabilities** och välj ditt Apple-ID under *Team*. Det är gratis att köra på din egen telefon.

## Steg 3 – Apple Developer-konto

- **developer.apple.com/programs** → Enroll. Det kostar 99 USD per år (cirka 1 100 kr).
- Som privatperson tar det ofta 1–2 dagar. Med företag behövs ett D-U-N-S-nummer, och då tar det längre tid.

## Steg 4 – App Store Connect

1. **appstoreconnect.apple.com** → Mina appar → + → Ny app.
   - Namn: `Rivblock` (är det upptaget: `Rivblock – Rivlappar`)
   - Primärt språk: Svenska. Lägg till engelska som extra språk.
   - Paket-ID: `se.rivblock.app` (redan inställt i projektet. Ändra i `capacitor.config.json` och i Xcode om du vill ha ett eget).
2. Klistra in texterna från `store/listing.md`.
3. Ladda upp skärmbilderna från `store/screenshots/` (`sv-1…5.png` och `en-1…5.png`). De har rätt storlek för 6,9".
4. Integritet: välj **"Data samlas inte in"**.
5. URL:er: ladda upp `site/` (steg 1) och använd `…/privacy.html` och `…/support.html`.
   **Byt först ut `KONTAKT-E-POST` i `site/support.html`** mot en adress du vill visa.
6. Pris: se nedan.

## Steg 5 – Skicka in

I Xcode: Product → Archive → Distribute App → App Store Connect → Upload. Gå sedan tillbaka till App Store Connect, välj bygget och klicka på *Skicka för granskning*. Granskningen tar oftast 1–3 dagar.

## Pris – rekommendation

| Modell | För | Emot |
|---|---|---|
| **Betalapp, 29–39 kr** (rekommenderas för start) | Ingen kod behövs, äkta "betala en gång". Få men nöjda användare. | Färre nedladdningar |
| Gratis + engångsköp 49 kr | Fler testar | Kräver StoreKit-plugin (RevenueCat), mer jobb och fler saker som kan gå fel |

Börja som betalapp. Om det märks att folk vill testa först kan du byta till gratis + köp i version 1.1. Koden för betalvägg finns redan (`PAYWALL` i `src/main.js`, gränsen är 2 egna block och 3 papper).

## Android (valfritt)

Installera Android Studio, kör `npm run android` och sedan Build → Generate Signed Bundle. Ett Google Play-konto kostar 25 USD en gång.

## Marknadsföring (gratis)

- 5–8 sekunders skärminspelning: en lapp rivs med ljudet på. Lägg upp på TikTok och Reels, utan voiceover, och låt ljudet bära.
- Lägg upp en "tomt block"-bild när du själv blir klar med ett block.
- Reddit: r/getdisciplined, r/productivity, r/iosapps (endast på självpresentations-trådar).
- Product Hunt när appen finns i App Store.
