import { cookies } from "next/headers";

export const PRESENTATION_MODE_COOKIE = "presentationMode";

export async function isPresentationMode(): Promise<boolean> {
  const store = await cookies();
  return store.get(PRESENTATION_MODE_COOKIE)?.value === "1";
}
