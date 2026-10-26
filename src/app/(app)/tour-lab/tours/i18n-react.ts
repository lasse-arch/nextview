"use client";

import { createContext, useContext } from "react";
import { makeT, type TourT } from "./i18n";

/** The tour's language and its words for the engine's components (see i18n.ts). */
export const TourLang = createContext<{ lang: string; t: TourT }>({ lang: "da", t: makeT({ translations: {} } as never, "da") });
export const useT = () => useContext(TourLang).t;
