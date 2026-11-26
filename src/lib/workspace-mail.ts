import "server-only";
import { prisma } from "@/lib/db";
import { getAppBaseUrl } from "@/lib/email-oauth";
import { LOGIN_LINK_FROM, LOGIN_MAIL_FROM } from "@/lib/customer-login";
import { resendReady, sendSystemMail } from "@/lib/system-mail";

/*
 * The mail with a Google account's first password - a new employee's, or after a reset - sent to their own (private)
 * e-mail only. The wording waits for Lasse's approval: until WORKSPACE_MAIL_APPROVED is true, Arpo neither creates
 * accounts nor resets passwords.
 */
export const WORKSPACE_MAIL_APPROVED = false;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export type WorkspaceMailKind = "new" | "reset";

export function workspaceMailText(kind: WorkspaceMailKind, firstName: string, workEmail: string, password: string) {
  const login = `${getAppBaseUrl()}/login`;
  const subject = kind === "new" ? "Din arbejdskonto hos Nextview360" : "Ny adgangskode til din arbejdskonto";
  const lines = [
    `Hej ${firstName}`,
    kind === "new" ? "Velkommen til Nextview360! Din arbejdskonto hos Google er klar:" : "Adgangskoden til din arbejdskonto hos Nextview360 er nulstillet:",
    `E-mail: ${workEmail}\nMidlertidig adgangskode: ${password}`,
    "Log ind på https://mail.google.com med den. Google beder dig vælge din egen adgangskode første gang - den midlertidige virker kun, til du har gjort det.",
    `Bagefter logger du ind i Arpo på ${login} med "Log ind med Google".`,
    "Slet gerne denne mail, når du er logget ind.",
  ];
  const bodyText = `${lines.join("\n\n")}\n\nVenlig hilsen\nNextview360`;
  const bodyHtml = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1f;max-width:520px">
${lines.map((l) => `<p>${esc(l).replace(/\n/g, "<br>")}</p>`).join("\n")}
<p>Venlig hilsen<br>Nextview360</p>
</div>`;
  return { subject, bodyText, bodyHtml };
}

export async function sendWorkspaceMail(kind: WorkspaceMailKind, to: string, firstName: string, workEmail: string, password: string): Promise<void> {
  const { subject, bodyText, bodyHtml } = workspaceMailText(kind, firstName, workEmail, password);
  const sender = await prisma.emailAccount.findFirst({ where: { provider: "GOOGLE", email: LOGIN_MAIL_FROM } });
  if (!sender && !resendReady()) throw new Error("Ingen mail-afsender: sæt RESEND_API_KEY i Vercel, eller forbind Gmail for info@ under Indstillinger → E-mail.");
  await sendSystemMail(sender, { to: [to], subject, bodyText, bodyHtml, fromName: "Nextview360", fromAddress: LOGIN_LINK_FROM, gmailFromAddress: LOGIN_MAIL_FROM, replyTo: LOGIN_MAIL_FROM });
}
