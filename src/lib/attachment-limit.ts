/*
 * How much a mail's attachments may weigh when they are sent from Arpo. The
 * files go up to the server with the send itself, and Vercel turns away any
 * request over 4.5 MB before our code sees it (the seller only got "Der skete
 * en fejl"). 4 MB leaves room for the mail's own text. Bigger files: make them
 * smaller first, or share them as a link.
 */
export const MAX_SEND_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const ATTACHMENT_TOO_BIG =
  "Filerne fylder for meget (højst 4 MB i alt kan sendes fra Arpo). Gør PDF'en mindre, fx ved at gemme den i lavere kvalitet, eller del den som et link.";
