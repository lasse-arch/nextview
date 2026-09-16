const QUOTES: { text: string; author: string }[] = [
  { text: "Salg handler ikke om at overtale nogen - det handler om at hjælpe dem med at træffe den rigtige beslutning.", author: "Ukendt" },
  { text: "Hver dag er en ny mulighed for at booke det møde, der ændrer alt.", author: "Ukendt" },
  { text: "De bedste sælgere lytter dobbelt så meget, som de taler.", author: "Ukendt" },
  { text: "Et nej i dag er ikke et nej for altid - bare et nej lige nu.", author: "Ukendt" },
  { text: "Succes er summen af små indsatser, gentaget dag efter dag.", author: "Robert Collier" },
  { text: "Kunder køber ikke produkter, de køber bedre resultater.", author: "Ukendt" },
  { text: "Den bedste tid at ringe det svære opkald er nu - ikke efter kaffen.", author: "Ukendt" },
  { text: "Din holdning i morges bestemmer din omsætning i eftermiddag.", author: "Ukendt" },
  { text: "Gør noget i dag, som dit fremtidige jeg vil takke dig for.", author: "Ukendt" },
  { text: "Hver afvisning bringer dig tættere på et ja.", author: "Ukendt" },
  { text: "Det er ikke kunden, der skal overbevises - det er dig, der skal tro på det du sælger.", author: "Ukendt" },
  { text: "Momentum starter med den første handling om morgenen.", author: "Ukendt" },
  { text: "Byg relationer, ikke bare pipelines.", author: "Ukendt" },
  { text: "Disciplin slår motivation, hver gang det tæller.", author: "Ukendt" },
  { text: "Den, der stiller flest spørgsmål, styrer samtalen.", author: "Ukendt" },
  { text: "Godt sømandsskab ses ikke i stille vejr - godt salg ses ikke kun når det er nemt.", author: "Ukendt" },
  { text: "En god dag starter med én lille sejr - book den først.", author: "Ukendt" },
  { text: "Kunderne husker, hvordan du fik dem til at føle sig, længe efter de har glemt tilbuddet.", author: "Maya Angelou (frit citeret)" },
  { text: "Fokusér på at være nyttig - salget følger med.", author: "Ukendt" },
  { text: "De store aftaler starter altid som et lille 'ja tak til et møde'.", author: "Ukendt" },
  { text: "Gør i dag det, andre ikke gider - høst i morgen det, andre ikke kan.", author: "Ukendt" },
  { text: "Din næste kunde venter ikke på dig - de venter på nogen. Vær den nogen.", author: "Ukendt" },
  { text: "Energien du møder op med smitter af på hele samtalen.", author: "Ukendt" },
  { text: "En opfølgning i dag er en aftale i morgen.", author: "Ukendt" },
  { text: "Det er lettere at holde en kunde end at finde en ny - pas godt på dem du har.", author: "Ukendt" },
  { text: "Alt godt salg starter med et ægte spørgsmål: Hvordan kan jeg hjælpe?", author: "Ukendt" },
  { text: "Du sælger ikke i dag for at nå målet - du sælger i dag for at blive den, der altid når det.", author: "Ukendt" },
  { text: "Skab værdi før du beder om noget til gengæld.", author: "Ukendt" },
  { text: "En rolig start med en klar plan slår en hektisk dag uden retning.", author: "Ukendt" },
  { text: "De bedste resultater kommer af konsekvent indsats, ikke af enkelte geniale træk.", author: "Ukendt" },
];

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

export function getQuoteOfTheDay(date: Date = new Date()): { text: string; author: string } {
  const index = dayOfYear(date) % QUOTES.length;
  return QUOTES[index];
}
