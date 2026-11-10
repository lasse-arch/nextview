/*
 * What has changed in the tour engine - newest first. Shown on Tours
 * ("Tour-motoren") next to "Opdater alle udgivne tours", so the team knows
 * what a republish brings. Add a line whenever the engine itself changes
 * (what the visitor sees or how the tour runs) - not for editor-only work.
 * kind: "ny" (a feature), "sikkerhed", "hastighed", "rettelse".
 */

export type EngineChange = { date: string; kind: "ny" | "sikkerhed" | "hastighed" | "rettelse"; text: string };

export const ENGINE_CHANGES: EngineChange[] = [
  { date: "2026-11-10", kind: "rettelse", text: "Virtual staging: filmens lyd slukker, når et stedkort læses op eller rundvisningens stemme taler - og tænder man filmens lyd, stopper oplæsningen. Aldrig to lyde på én gang." },
  { date: "2026-11-10", kind: "rettelse", text: "Historier: når rækken åbnes igen (▴ eller \"Historier ▾\"), står den ved det sted, man er - ikke ved starten." },
  { date: "2026-11-10", kind: "rettelse", text: "Historier på telefon: linjerne øverst går ikke længere ind under MENU-knappen." },
  { date: "2026-11-10", kind: "rettelse", text: "\"Her er menuen\" vises kun for den, der går selv rundt - ikke mens historierne spiller, under en rundvisning, Find vej eller \"Sådan ser en dag ud\"." },
  { date: "2026-11-10", kind: "ny", text: "Historier på telefon: når man trykker på en historie (eller Afspil), folder rækken sig sammen til en lille afspiller i bunden - billede med tiden rundt om, navnet, Pause, Videre og ▴ for hele rækken." },
  { date: "2026-11-10", kind: "rettelse", text: "Virtual staging: har man tændt lyden på en film og går væk fra den (eller vender sig væk), toner lyden selv ud og slukker - og forbliver slukket. Også når touren lægges væk på telefonen." },
  { date: "2026-11-10", kind: "rettelse", text: "Virtual staging: \"Tryk for lyd\" / \"Slå lyd fra\" under en film bliver der også fra scanpunkterne ved siden af (inden for 15 m) - ikke kun fra det første." },
  { date: "2026-11-10", kind: "rettelse", text: "Stående skærme i Virtual staging drejer nu mod gæsten, forsvinder ikke ved skift af scanpunkt, og \"Tryk for lyd\" sidder under skærmen." },
  { date: "2026-11-10", kind: "rettelse", text: "Stedkort på telefon: mindre - 2 linjer tekst og \"Læs mere\", lidt mindre skrift, og knapperne side om side." },
  { date: "2026-11-10", kind: "ny", text: "Virtual staging: en video, et billede eller et skilt kan stå op midt i rummet (fx en hal) og vender altid mod gæsten." },
  { date: "2026-11-10", kind: "rettelse", text: "Historier: Pause, Videre og luk står fast i højre side - de flytter sig ikke efter, hvor langt rummets navn er." },
  { date: "2026-11-10", kind: "ny", text: "Historier kan starte skjult (foldet sammen) - gæsten åbner dem selv med knappen." },
  { date: "2026-11-10", kind: "ny", text: "Knapperne får selv mørk tekst på en lys knapfarve (fx guld), så hjemmesidens egen farve kan bruges, som den er." },
  { date: "2026-11-10", kind: "rettelse", text: "Historier: rene ikoner på Pause og Videre, og den mørke toning øverst har ikke længere skarpe kanter." },
  { date: "2026-11-09", kind: "rettelse", text: "Mobil: logoet i boksen øverst over luftfotoet forsvandt, når det var en SVG." },
  { date: "2026-11-09", kind: "ny", text: "Byg dit skema: vælg fag i hver fagblok og se din uge (#skema)." },
  { date: "2026-11-09", kind: "rettelse", text: "Skrifttyper hentes ikke to gange, når overskrift og tekst har samme skrift." },
  { date: "2026-11-06", kind: "ny", text: "Skattejagt: skattekister i Virtual staging med lodtrækning." },
  { date: "2026-11-06", kind: "rettelse", text: "Vis mig rundt på telefon: personerne overlapper ikke, og kortet fylder mindre." },
  { date: "2026-11-06", kind: "rettelse", text: "Baggrundsfilm og intro-film starter også på iPhone hver gang." },
  { date: "2026-11-06", kind: "ny", text: "Start-links til alle menupunkter, luftfotoet og hver Vis mig rundt (?rum=)." },
  { date: "2026-11-05", kind: "rettelse", text: "Telefon: et træk opad flytter ikke længere hele touren." },
  { date: "2026-11-05", kind: "rettelse", text: "Skrifter med én tykkelse virker igen, og velkomsten passer i en lav ramme." },
  { date: "2026-11-04", kind: "ny", text: "\"Se det i brug\": en kort film eller et billede af stedet i brug." },
  { date: "2026-11-04", kind: "ny", text: "Virtual staging i 3D: billeder, videoer, skilte og \"Følg os\"-skilte på fladerne." },
  { date: "2026-11-04", kind: "ny", text: "Find vej: steder uden for menuen og søgning på nummerintervaller." },
  { date: "2026-11-04", kind: "ny", text: "Links pr. sprog: hvert link kan have sin egen adresse på hvert sprog." },
  { date: "2026-11-04", kind: "rettelse", text: "iPad: toppen gemmer sig ikke under Safaris værktøjslinje, og knapperne er fingerstore." },
  { date: "2026-11-04", kind: "rettelse", text: "180°/360°-billeder i rundvisningen vises først, når de er hentet - intet strakt billede imens." },
];
