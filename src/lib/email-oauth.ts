export function getAppBaseUrl(): string {
  return process.env.APP_BASE_URL || "http://localhost:3000";
}

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/calendar.events",
  // Only sees/manages files this app itself creates - not the user's whole
  // Drive - used to file away signed contracts (see google-drive.ts).
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
