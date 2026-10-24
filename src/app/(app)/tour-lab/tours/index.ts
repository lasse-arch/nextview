import type { TourConfig } from "./types";
import { halvorsminde } from "./halvorsminde";
import { fitnessGronlandstorv } from "./fitness-gronlandstorv";

/** The prototype tours, by their /tour-lab/<slug> address. */
export const TOURS: Record<string, TourConfig> = {
  [halvorsminde.slug]: halvorsminde,
  [fitnessGronlandstorv.slug]: fitnessGronlandstorv,
};
