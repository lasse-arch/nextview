"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createCustomerSession } from "@/lib/auth";
import { consumeLoginLink, PORTAL_PAGES, requestLoginLink } from "@/lib/customer-login";

export type LinkState = { sent?: boolean; error?: string } | undefined;

/** "Send mig et login-link" - the same answer whether or not the e-mail is a customer's. */
export async function requestLoginLinkAction(_prev: LinkState, formData: FormData): Promise<LinkState> {
  const email = String(formData.get("email") || "").trim();
  if (!email) return { error: "Skriv din e-mail." };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() || "ukendt";
  await requestLoginLink(email, ip);
  return { sent: true };
}

/** The "Log ind" button on the page the e-mail's link opens. */
export async function loginWithLinkAction(formData: FormData): Promise<void> {
  const accountId = await consumeLoginLink(String(formData.get("t") || ""));
  if (!accountId) redirect("/login?error=link_invalid");
  await createCustomerSession(accountId);
  // Only a known page of their own customer page - never an address from the link.
  const to = String(formData.get("til") || "");
  redirect((PORTAL_PAGES as readonly string[]).includes(to) ? `/kunde?side=${to}` : "/kunde");
}
