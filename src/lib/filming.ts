/**
 * Text for the "Book filming" calendar invite - kept apart from the action
 * so it can be previewed/tested without Google.
 *
 * `start` is wall-clock-as-UTC (like meetingDate): its UTC digits are the
 * Copenhagen time the customer picked, so it's formatted in UTC here.
 */
export function formatFilmingDate(start: Date): { date: string; time: string } {
  const date = new Intl.DateTimeFormat("da-DK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(start);
  const time = new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })
    .format(start)
    .replace(".", ":");
  return { date, time };
}

export function formatHours(hours: number): string {
  const text = String(hours).replace(".", ",");
  return `${text} ${hours === 1 ? "time" : "timer"}`;
}

/** "Lasse", "Lasse og Victor", "Lasse, Victor og Gustav". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} og ${names[names.length - 1]}`;
}

export function buildFilmingDescription(input: {
  start: Date;
  hours: number;
  crewNames: string[];
  contactName?: string | null;
  address?: string | null;
  organizer: { fullName: string; email: string; phone?: string | null };
}): string {
  const { date, time } = formatFilmingDate(input.start);
  const greeting = input.contactName?.trim() ? `Hej ${input.contactName.trim().split(/\s+/)[0]},` : "Hej,";
  const crew = input.crewNames.length ? joinNames(input.crewNames) : "vi";
  return [
    greeting,
    "",
    `Som aftalt kommer vi ud til jer og optager ${date} kl. ${time}${input.address ? ` på ${input.address}` : ""}.`,
    `Fra Nextview360 kommer: ${crew}.`,
    "",
    "Så optagelsen bliver så flot som muligt, beder vi jer sørge for, at:",
    "• der er pænt og ryddet op i alle rum, der skal optages (også gange, toiletter og fællesarealer)",
    "• løse ting som papirer, kabler, tasker, overtøj og affald er fjernet fra borde, gulve og vindueskarme",
    "• alle døre og rum, vi skal ind i, er låst op og tilgængelige",
    "• lyset er tændt og gardiner/persienner trukket op",
    "• der helst ikke er personer i rummene, mens vi optager dem",
    "• der er en kontaktperson til stede, som kan vise os rundt og svare på spørgsmål",
    "",
    `Bemærk: Det er kun starttidspunktet (kl. ${time}), der er gældende. Sluttidspunktet i invitationen er kun et estimat på, hvor lang tid vi forventer, det tager (ca. ${formatHours(input.hours)}) - vi tager selvfølgelig først hjem, når vi er færdige.`,
    "",
    "Har I spørgsmål inden, er I velkomne til at kontakte os.",
    "",
    "Vi glæder os til at komme ud til jer!",
    "",
    "Med venlig hilsen",
    "Nextview360",
    input.organizer.fullName,
    input.organizer.email,
    input.organizer.phone ?? "",
  ]
    .join("\n")
    .trimEnd();
}
