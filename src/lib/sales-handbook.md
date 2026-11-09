# Sælger-håndbog (til nextviewAI under Generator → Spørg)

Det, en sælger skal kunne svare på om touren, Matterport, kundeportalen og
Arpo. Skrevet ud fra, hvordan systemet faktisk virker - ret den her, når
noget ændrer sig. Ting, kun teamet ved (fx kamera, scanningstid pr. m²),
gemmes som svar i teamets FAQ under Spørg.

## Sådan bliver en tour til

1. **Scanning.** Vi scanner stedet med Matterport: en 3D-model af lokalerne
   med scanpunkter, man går imellem. Vi filmer uden mennesker i billedet.
   Udendørs bruger vi drone (luftfoto/drone-360°), og hvor der ikke er
   scannet, kan touren vise kundens egne fotos og 360°-billeder.
2. **Touren bygges i Arpo** (Tours i menuen, tour-editoren): menu, velkomst
   eller forside, infopunkter/stedkort, "Vis mig rundt" med speak, Find vej,
   knapper til booking, flere sprog, live data (ledige pladser, rum, datoer),
   Virtual staging (video, billede, skilt, årshjul, skattekiste og
   "Følg os"-skilte på en flade i rummet), "Se det i brug" - i kundens logo,
   farver og skrift. Tour-drejebogen beskriver, hvordan en god tour bygges.
3. **Gennemgang hos kunden.** Touren sendes til gennemgang: kunden får et
   link (og ser den i kundeportalen under Rettelser), stiller sig det rigtige
   sted i touren og trykker "Giv feedback". Vi retter, kunden godkender.
4. **Udgivelse.** Touren udgives og ligger på tour.nextview360.dk (en fast,
   hurtig kopi). Ændres touren senere, skal den udgives igen (Del og udgiv →
   Udgiv), før ændringen ses på den udgivne kopi.
5. **Live.** Kunden sættes Live i Arpo (det starter faktureringen og sender
   velkomstmailen), og touren lægges på kundens hjemmeside, Google og
   sociale medier.

## Matterport

- Touren kører på Matterports egen 3D-viewer, men hostet på vores eget
  domæne. Det er derfor, vores tours kan skjule Matterports logo, "Powered
  by" og deres indlæsningsskærm - kunden er afsender, ikke Matterport.
- Ældre tours ligger på explore.nextview360.dk (bygget i MPSkins). Nye tours
  bygges i Arpo med vores egen tour-motor, som kan langt mere (Vis mig
  rundt, Find vej, live data, Virtual staging, kundeportal med egne tal).
- **Personer i scans** (Tours → Personer i scans): nextviewAI gennemgår alle
  scanpunkter og finder dem, hvor en person er kommet med i billedet. Teamet
  ser dem igennem og vælger at skjule scanpunktet eller beholde det.
- Besøgstal: for tours i Arpo bruger vi vores egne tal (de samme, som kunden
  ser). For ældre tours kan tallene hentes fra Matterport/explore.
- Ved spørgsmål om kameraet, scanningstid, filstørrelser eller Matterports
  abonnement: svar ud fra teamets FAQ - står det ikke der, så henvis til
  Victor (Sales & Tech Manager).

## Kundeportalen (/kunde)

Kunden logger ind på nextview360.dk/login med et link på mail (ingen
adgangskode) og ser kun deres egne tours. Fanerne:

- **Hjem:** overblik - besøg de seneste dage, hvor mange gik på opdagelse,
  typisk besøg, hvor mange gik videre til booking/kontakt, og deres tours.
- **Statistik:** alle tallene: besøg over tid, mest besøgte steder, klik.
- **På hjemmesiden:** koden til at sætte touren ind på hjemmesiden, i den
  størrelse de vælger (bred, høj, fast højde eller hele skærmen). nextviewAI
  kan finde stedet på kundens hjemmeside og vise, hvordan det ser ud. Links
  og QR-kode, også direkte til et bestemt sted i touren, et menupunkt,
  luftfotoet eller en "Vis mig rundt".
- **Brug touren:** tips til at dele linket (Facebook, Instagram, Google,
  nyhedsbreve).
- **Rettelser:** touren til gennemgang - skriv rettelser i touren, se svar
  på dem, og godkend touren.
- **Kontrakt:** kontrakten.
- **Brugere:** kunden kan selv invitere kolleger og deres udvikler, med
  roller (se nedenfor).
- **Lodtrækning:** listen over deltagere i en skattejagt - træk en vinder,
  eksportér, slet. Deltagerne slettes automatisk efter den periode, der er
  valgt.
- **Hjælp:** kontakt til os.
- Besøgsrapporten kommer også på mail, og kunden vælger selv hvor tit.

Roller i kundeportalen:

- **Ejer:** alt - tal, koden og placeringen, rettelser, godkendelse,
  kontrakten, brugerne og lodtrækningen.
- **Medarbejder:** tal, koden og placeringen, rettelser og lodtrækningen
  (godkendelse kun hvis ejeren har givet lov).
- **Udvikler:** kun koden til hjemmesiden, placeringen og en forhåndsvisning
  af touren - fx et webbureau. Adgangen udløber af sig selv.
- **Kun tal:** kun tours og statistik.

## Salget i Arpo

- En deal går gennem: Lead → Kontaktet → Møde booket → Opfølgning →
  Kontrakt sendt → Kontrakt underskrevet → Filmet → Gennemgang inden live →
  Live (eller Tabt).
- **Generator:** Mail (nextviewAI skriver mailen, med pris og tours, som
  teamet skriver), SMS (send en eksempel-tour - du får besked, når kunden
  kigger) og Spørg (her).
- **Ringeliste, Kalender, Opgaver, Leadindbakke:** opkald, møder og
  opfølgning. Den, der booker mødet eller sætter genopkaldet, bliver ejer af
  dealen.
- **Kontrakt:** laves og sendes til underskrift fra dealen. Etablering kan
  faktureres ved underskrift eller først, når kunden har godkendt leveringen.
- **Filmning:** bookes fra dealen med kalenderinvitation til kunden.
- **Betaling:** faktura eller Betalingsservice.
- **Online kunder:** alle tours, der er ude, efter branche - gode eksempler
  at sende til nye kunder.
