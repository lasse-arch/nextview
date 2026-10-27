/*
 * The industries "Online kunder" sorts tours by - so a seller about to meet a
 * campsite quickly finds campsite tours to show. Set on the deal; until then
 * a guess from the name.
 */

export const INDUSTRIES = [
  "Efterskole og skole",
  "Fitness og sport",
  "Camping og ferie",
  "Hotel og overnatning",
  "Restaurant og café",
  "Oplevelser og attraktioner",
  "Butik og showroom",
  "Opbevaring og lager",
  "Erhverv og kontor",
  "Bolig og ejendom",
  "Kirke og begravelse",
  "Andet",
] as const;
export type Industry = (typeof INDUSTRIES)[number];

const GUESS: [RegExp, Industry][] = [
  [/efterskole|friskole|skole|gymnasi|højskole|institution|børnehave/i, "Efterskole og skole"],
  [/fitness|padel|sport|træning|crossfit|golf|svømme|klub/i, "Fitness og sport"],
  [/camping|feriepark|ferieby|feriecenter|sommerhus/i, "Camping og ferie"],
  [/hotel|kro\b|b&b|vandrerhjem|motel|hostel|gæstehus/i, "Hotel og overnatning"],
  [/restaurant|caf[eé]|sushi|pizza|bistro|brasserie|\bbar\b|grill|bageri/i, "Restaurant og café"],
  [/fun ?art|park|oplevelse|museum|zoo|akvarie|legeland|bowling|biograf/i, "Oplevelser og attraktioner"],
  [/depot|opbevaring|lager|storage/i, "Opbevaring og lager"],
  [/begravelse|kirke|kirkegård|bedemand/i, "Kirke og begravelse"],
  [/bolig|ejendom|udlejning|lejlighed|mægler/i, "Bolig og ejendom"],
  [/pejs|showroom|butik|møbel|bil|vin|blomst|isbutik|tøj|design|køkken/i, "Butik og showroom"],
  [/kontor|erhverv|byg|aps|a\/s|tømrer|værksted|fabrik/i, "Erhverv og kontor"],
];

/** The deal's own choice, else a guess from the name. */
export function industryOf(name: string, set: string | null | undefined): Industry {
  if (set && (INDUSTRIES as readonly string[]).includes(set)) return set as Industry;
  return GUESS.find(([re]) => re.test(name))?.[1] ?? "Andet";
}
