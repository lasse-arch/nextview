# Nextview360 tour-drejebog

Sådan laver vi en god tour. Denne fil læses af Claude i tour-editoren i Arpo
(og af Claude Code, når vi bygger videre på tour-motoren) - ret den her, så
lærer begge det nye.

## Det vigtigste

1. **Mobilen først.** De fleste besøgende er på telefon. Korte tekster, store
   knapper, intet der dækker hele skærmen længe.
2. **Aldrig forvirrende.** Få valg ad gangen. Én tydelig vej videre. Hellere
   fjerne en funktion end at tilføje en, der skal forklares.
3. **Touren skal konvertere.** Den slutter altid ved en handling: book bord,
   bliv elev, book en rundvisning, lej en boks, bliv medlem. Handlingen er
   altid synlig (CTA) og kommer igen, når folk har set nok ("Din plads venter").
4. **Rød tråd fra hjemmesiden.** Touren ligner kundens hjemmeside: samme
   farver, skrift, logo, tone og de samme handlinger (samme booking-link).
   Den besøgende skal føle, at de stadig er hos kunden - ikke hos os.
5. **Kunden er afsender.** Skriv i kundens stemme, til målgruppen (du/din).
   Nextview360 nævnes kun som "Præsenteret af nextview360" i menuen.
6. **Sandt indhold.** Opfind aldrig priser, antal, åbningstider, navne eller
   tilbud. Brug kun det, kunden eller hjemmesiden siger. Mangler noget, så
   spørg eller lad det være ude.

## Start: hvordan touren åbner

Ikke alle tours skal starte med et valg. Vælg ud fra, hvor folk kommer fra:

- **Direkte i touren** - når folk kommer fra en knap på hjemmesiden, der allerede
  har fortalt historien (fx "Se rummet" ved en bestemt boks). Hurtigst.
- **Forside** (cover) - stort foto af stedet, kort velkomst, én knap ind
  ("Træd indenfor") og stederne at vælge imellem. Premium; godt til
  restauranter, showrooms, hoteller. Fortsætter hjemmesidens fortælling.
- **Velkomst med fliser** - 3-5 fliser til det, folk kommer for. Godt når der
  er få, tydelige valg (efterskole: "Se et værelse", "Find dit værksted").
  Marker højst én flise som "Anbefalet".
- **Kort film** (intro) - fx en drone, der flyver ned til indgangen, før touren.
  Kun når der findes god video; max ca. 8 sekunder.
- **Luftfoto / tegnet kort** - til store områder (campingplads, skole med mange
  huse): folk vælger på kortet, hvor de vil ind.

"Vis mig rundt" er et godt førstevalg for folk, der ikke ved, hvad de leder efter.

## Menu

- Fast mønster: **Velkommen til [Kunde]** → evt. **[Kunde] fra luften** →
  **2-5 grupper** i den besøgendes rækkefølge (først oplevelsen, så det
  praktiske, så "dit sted") → **handlingen** (Book bord, Ledige pladser …).
- Gruppenavne taler til målgruppen: "Din hverdag", "Dit hjem på …", "Til dit selskab".
- Max ca. 7 steder pr. gruppe. Udelad grupper uden rum.
- Sidemenu er standard. **Bar i bunden** (dock) til restauranter/showrooms med
  få, faste ting. **Rumvælger** (picker) til ens rum i størrelser (lager, hotel).

## Rundvisning ("Vis mig rundt")

4-7 stop, der fortæller en historie og slutter der, hvor man skal handle.
1-2 korte sætninger pr. stop. 6-10 sekunder pr. stop.

Med stemme (en lydfil pr. stop, `audio`): godt til skoler og steder, hvor en
rolig fortæller sælger stemningen (fx Tolne Efterskole). Slå "Man trykker selv
videre" til (`manual`), så gæsten styrer tempoet; ellers kommer næste stop, når
stemmen er færdig. Et sidste stop uden sted (tom `href`) er et afslutningskort.
Gæsten kan altid slå lyden fra. Lydfiler hostes hos os som alle andre filer.

## Specialskoler og gæster, der gerne vil vide, hvad der kommer

Fx specialefterskoler (ADHD, autisme, nedsat kognitivt funktionsniveau):
- **Designet "Helt enkel"** (`design: { welcome: "simple", menu: "simple" }`):
  2-3 store knapper under hinanden, og en menu, der er én liste af store knapper.
  Ingen fliser, ingen undermenuer, ingen paneler ovenpå hinanden.
- **Intet dukker op af sig selv**: ingen "Din plads venter", ingen stedkort, ingen timere.
  Skriv i velkomsten, at der ikke sker noget, før man selv trykker.
- **Rolige skift**: `jump: "fade"` i stedet for at flyve gennem bygningen.
- **Stemme-rundtur, man selv styrer** (`manual`), og guiden viser altid "Næste: …".
- **"Sådan ser en dag ud"** (`day`): skolens rigtige dagsrytme fra ugeskemaet,
  med "Se stedet" ved hvert tidspunkt. Mens man kigger, viser en bjælke, hvilken
  del af dagen det er, og hvad der kommer bagefter.
- **Korte, konkrete sætninger** - én ting pr. sætning.
- **Forældre og fagfolk** er dem, der handler: giv dem en flise og en menugruppe
  (book rundvisning, optagelse, særlig støtte).

## Stedkort og "Din plads venter"

- **Stedkort**: når man lander et vigtigt sted, kommer et lille kort med 1-3
  sætninger om stedet og evt. en knap (til et andet rum eller en side). Kun på
  de vigtigste steder - ikke overalt.
- **"Din plads venter"**: et kort efter ca. 90 sekunder med kundens vigtigste
  handling. Ét kort, aldrig mens menuen er åben.

## Links

- Steder i touren vælges ved at stå der i forhåndsvisningen ("Tilføj det sted,
  du ser") - så kommer den rigtige retning med.
- Booking/bestilling åbner gerne som **popup over touren**, så folk ikke
  forlader touren. Sider, der ikke kan vises i popup, åbner automatisk i ny fane.
- Kundens hjemmeside, Instagram, kort: **ny fane**.

## Design

- Farver fra hjemmesiden: `main` = den mørke/dominerende farve, `accent` =
  knapfarven, `accentDark` = en mørkere udgave af accent, `soft` = en lys
  baggrund. Sørg for god kontrast (hvid tekst på main, mørk tekst på soft).
- Skrift: hjemmesidens skrift, hvis den findes på Google Fonts - ellers en tæt
  på. Overskrifter må have deres egen skrift (fx en serif til restauranter).
- Mørkt logo → sæt "logoOnLight", så det står på lys baggrund.

## Brancher

- **Efterskole/højskole:** Årshjul · Din hverdag · Skoledagen · Dit hjem på
  [Skole]. Handling: "Ledige pladser"/"Book en rundvisning", CTA "Bliv elev".
  Velkomst med fliser, Vis mig rundt, stedkort i værelser og fællesrum.
- **Restaurant/café/bar:** Restauranten · Køkkenet · Til dit selskab ·
  Praktisk. Handling "Book bord" (popup), evt. "Bestil takeaway". Forside med
  foto + bar i bunden. Varm, indbydende tone.
- **Fitness:** Træning · Hold · Faciliteter. CTA "Bliv medlem".
- **Hotel/konference:** Dit ophold · Spis og drik · Møder og events ·
  Faciliteter. CTA "Book nu".
- **Butik/showroom:** Butikken · Service · Praktisk. CTA "Book fremvisning" /
  "Find os". Gerne kort film (drone) før touren.
- **Lager/udlejning (fx Boxdepotet):** Størrelser · Adgang og sikkerhed ·
  Faciliteter. Rumvælger, skift direkte mellem rum, ledige rum live, "Find vej"
  til boksen. CTA "Lej en boks".
- **Campingplads/stort område:** start på tegnet kort eller luftfoto.
- **Kirkegård/skovbegravelse:** rolig tone; kun "Kontakt os".
- **Ukendt:** oplevelse → praktisk → "dit sted" → handling.

## Konvertering og måling

Målet er at kunne sige til kunden: "Touren sendte X besøgende videre til
booking i denne måned". Derfor:

- **Én hovedhandling pr. tour**, og den er altid ét tryk væk (CTA-knappen, i
  menuen, på stedkort i de vigtigste rum og i "Din plads venter").
- **Booking i popup over touren**, så folk ikke mister touren, hvis de fortryder.
- **Handlingen der, hvor lysten opstår**: et stedkort i det smukkeste rum med
  "Book dette bord" / "Se ledige værelser" slår en knap i en menu.
- Arpo måler selv hver tour (besøg, hvad folk kigger på, klik på booking og
  kontakt) - se fanen Resultater. Links til kundens egne sider får
  utm_source=nextview360, så kunden også kan se bookingerne i sit eget system.
- Når tallene viser, at folk ikke når handlingen (fx mange besøg, få klik),
  så flyt handlingen tættere på: et stedkort, en flise på velkomsten, eller
  "Din plads venter" tidligere.

## Live data

Har kunden en side med ledige pladser, rum eller boliger (campingpladser,
depotrum, værelser), så vis dem live i touren (Live data): "12 ledige
pladser" med en book-knap ved hver - og "Ledig" ved de rum i menuen, der er
ledige. Det er det stærkeste salgsargument, en tour kan have: man ser
pladsen og kan booke den med det samme.

## Kunderejsen

En kunde kan have flere tours til forskellige steder i kunderejsen (fx én til
hjemmesidens forside og én til en bestemt produktside). Hver tour har ét mål.

## Interaktivt kort

Et tegnet kort, en situationsplan eller et dronefoto, som touren starter på
(`map`), med punkter man trykker på og går ind fra. Godt til steder med mange
bygninger eller et stort område (skoler, campingpladser, ferieparker).
- Sæt punkterne i editoren under "Interaktivt kort": "Sæt menuens rum ind"
  placerer menuens rum ét klik ad gangen (navn, sted i touren og ikon kommer med).
- Få kategorier (3-6) med tydelige farver - de bliver til filtret over kortet.
- De vigtigste steder lidt større (`size`), resten normale.
- Kortet kan stå alene - det behøver ikke en drone-scene.
