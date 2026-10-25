import type { TourConfig } from "./types";
import { halvorsminde } from "./halvorsminde";
import { fitnessGronlandstorv } from "./fitness-gronlandstorv";
import { decoflame } from "./decoflame";
import { jalsa } from "./jalsa";

/** The prototype tours, by their /tour-lab/<slug> address. */
export const TOURS: Record<string, TourConfig> = {
  [halvorsminde.slug]: halvorsminde,
  [fitnessGronlandstorv.slug]: fitnessGronlandstorv,
  [decoflame.slug]: decoflame,
  [jalsa.slug]: jalsa,
};
