const CPH_TZ = "Europe/Copenhagen";

function copenhagenHour(date: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: CPH_TZ, hour: "2-digit", hour12: false }).format(date));
}

/** Time-appropriate templates for the current hour, so a fresh pick each
 * page load never lands on something like "Godaften" in the morning. */
function timeOfDayTemplates(hour: number, name: string): string[] {
  if (hour >= 5 && hour < 10) return [`Godmorgen, ${name}`, `Rigtig god morgen, ${name}`];
  if (hour >= 10 && hour < 12) return [`God formiddag, ${name}`];
  if (hour >= 12 && hour < 18) return [`God eftermiddag, ${name}`];
  if (hour >= 18 && hour < 23) return [`Godaften, ${name}`, `Hyggelig aften, ${name}`];
  return [`Godnat, ${name}`, `Sent oppe, ${name}?`];
}

/** Time-agnostic ones, always in the pool alongside whichever of the above fit right now. */
function evergreenTemplates(name: string): string[] {
  return [
    `Velkommen, ${name}`,
    `Hav en fremragende dag, ${name}`,
    `Du ser skarp ud i dag, ${name}`,
    `I dag er din dag, ${name}`,
    `Godt at se dig, ${name}`,
    `Klar til at lukke et par aftaler, ${name}?`,
  ];
}

/**
 * Picks a fresh, time-appropriate dashboard greeting on every render (see
 * DashboardPage) instead of a fixed "Velkommen, {name}" - mixes a couple of
 * templates that suit the current hour in Denmark with a set of generic,
 * always-valid ones, then picks one at random.
 */
export function getDashboardGreeting(name: string): string {
  if (!name) return "Velkommen";

  const hour = copenhagenHour(new Date());
  const templates = [...timeOfDayTemplates(hour, name), ...evergreenTemplates(name)];
  return templates[Math.floor(Math.random() * templates.length)];
}
