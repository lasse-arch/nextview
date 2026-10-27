"use server";

import { cookies } from "next/headers";

/** The customer page's language (DA/EN) - just remembered in a cookie, nothing else about the visitor. */
export async function setPortalLanguage(lang: "da" | "en"): Promise<void> {
  (await cookies()).set("nv360_lang", lang === "en" ? "en" : "da", { path: "/", maxAge: 31_536_000, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
}
