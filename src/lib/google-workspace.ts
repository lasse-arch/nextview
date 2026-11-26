import "server-only";
import { createSign, randomInt } from "node:crypto";

/*
 * Google Workspace accounts made from Arpo (HR → "Giv adgang til Arpo"): a new employee's @nextview360.dk account is
 * created, and suspended the day after their last day of work - so nobody has to go into Google Admin.
 *
 * Set up once (see docs/google-workspace.md), only in Vercel env - never in code:
 *  - GOOGLE_WORKSPACE_KEY: the service account's JSON key (as is, or base64). The service account itself holds a
 *    custom admin role in Google that may only manage users (not a super admin) - no user to act as, no domain-wide
 *    delegation. Google never lets such a role change a super admin, so the key can't touch Lasse.
 *  - GOOGLE_WORKSPACE_OU (optional): an organisational unit to keep Arpo inside - new accounts go there, and only
 *    accounts in it are managed. Without it, new accounts go in the top unit and any non-admin can be managed.
 *  - GOOGLE_WORKSPACE_ADMIN (optional, not used by us): a user to act as through domain-wide delegation instead.
 * Only the scope admin.directory.user is asked for. On top of Google's own limits, Arpo only touches accounts on our
 * domain that aren't admins in Google.
 */

export const WORKSPACE_DOMAIN = "nextview360.dk";
const SCOPE = "https://www.googleapis.com/auth/admin.directory.user";
const API = "https://admin.googleapis.com/admin/directory/v1/users";

type Key = { client_email: string; private_key: string };

function key(): Key | null {
  const raw = process.env.GOOGLE_WORKSPACE_KEY?.trim();
  if (!raw) return null;
  try {
    const json = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")) as Partial<Key>;
    return json.client_email && json.private_key ? { client_email: json.client_email, private_key: json.private_key } : null;
  } catch {
    return null;
  }
}

/** Is Arpo set up to make Google accounts? */
export const workspaceReady = () => key() != null;

/** The unit Arpo is kept inside, or null (the whole domain, admins aside). */
export const workspaceUnit = (): string | null => {
  const ou = process.env.GOOGLE_WORKSPACE_OU?.trim();
  if (!ou || ou === "/") return null;
  return ou.startsWith("/") ? ou : `/${ou}`;
};

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** An access token for the service account (its own admin role) - fetched per call, never kept. */
async function token(): Promise<string> {
  const k = key();
  if (!k) throw new Error("Google Workspace er ikke sat op i Arpo endnu.");
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: k.client_email, ...(process.env.GOOGLE_WORKSPACE_ADMIN ? { sub: process.env.GOOGLE_WORKSPACE_ADMIN } : {}), scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 600 }));
  const sig = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(k.private_key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as { access_token?: string; error?: string } | null;
  // Only Google's error code - never the key or the token.
  if (!res.ok || !body?.access_token) throw new Error(`Google afviste Arpos nøgle (${body?.error ?? res.status}) - tjek opsætningen.`);
  return body.access_token;
}

async function call<T>(method: string, path: string, body?: object): Promise<{ status: number; data: T | null }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as T | null };
}

/** A first password: 16 characters, no look-alikes. Google makes them choose their own at the first login. */
function firstPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 16 }, () => chars[randomInt(chars.length)]).join("");
}

export const onOurDomain = (email: string) => email.toLowerCase().endsWith(`@${WORKSPACE_DOMAIN}`);

/**
 * Creates the account (in GOOGLE_WORKSPACE_OU when set). Returns the first password - it goes only to the employee's own
 * e-mail, and is never stored or logged.
 */
export async function createWorkspaceUser(u: { email: string; givenName: string; familyName: string }): Promise<{ password: string }> {
  const email = u.email.toLowerCase();
  if (!onOurDomain(email)) throw new Error(`Google-kontoen skal være en @${WORKSPACE_DOMAIN}-adresse.`);
  const password = firstPassword();
  const r = await call<{ error?: { message?: string } }>("POST", "", {
    primaryEmail: email,
    name: { givenName: u.givenName.slice(0, 60) || email.split("@")[0], familyName: u.familyName.slice(0, 60) || "-" },
    password,
    changePasswordAtNextLogin: true,
    orgUnitPath: workspaceUnit() ?? "/",
  });
  if (r.status === 409) throw new Error(`${email} findes allerede i Google. Vælg en anden adresse, eller fjern fluebenet og giv adgang til den, der findes.`);
  if (r.status === 403) throw new Error("Google sagde nej: Arpos servicekonto må ikke oprette brugere - tjek, at den har rollen Arpo brugeradmin i Google Admin.");
  if (r.status < 200 || r.status >= 300) throw new Error(`Google kunne ikke oprette kontoen (${r.status}${r.data?.error?.message ? `: ${r.data.error.message}` : ""}).`);
  return { password };
}

type GUser = { primaryEmail?: string; orgUnitPath?: string; isAdmin?: boolean; isDelegatedAdmin?: boolean; suspended?: boolean };

/**
 * The account, if Arpo may touch it: on our domain, not an admin and (when GOOGLE_WORKSPACE_OU is set) in that unit (Google's role says the
 * same - this is the second lock). `null` = it doesn't exist in Google.
 */
async function managed(email: string): Promise<GUser | null> {
  if (!onOurDomain(email)) throw new Error(`Kun @${WORKSPACE_DOMAIN}-konti styres fra Arpo.`);
  const u = await call<GUser>("GET", `/${encodeURIComponent(email)}`);
  if (u.status === 404) return null;
  if (!u.data || u.status !== 200) throw new Error(`Google: kunne ikke slå ${email} op (${u.status}).`);
  const unit = workspaceUnit();
  if (u.data.isAdmin || u.data.isDelegatedAdmin) throw new Error(`${email} er administrator i Google - den styres ikke fra Arpo.`);
  if (unit && !(u.data.orgUnitPath === unit || u.data.orgUnitPath?.startsWith(`${unit}/`))) throw new Error(`${email} ligger ikke i ${unit} i Google - flyt den dertil i Google Admin én gang, så kan Arpo styre den.`);
  return u.data;
}

/** The account's state for the Brugere page: missing, open, closed - or why Arpo can't manage it. */
export async function workspaceState(email: string): Promise<{ state: "missing" | "active" | "suspended" } | { state: "outside"; why: string }> {
  try {
    const u = await managed(email);
    return { state: !u ? "missing" : u.suspended ? "suspended" : "active" };
  } catch (err) {
    return { state: "outside", why: err instanceof Error ? err.message : String(err) };
  }
}

/** A new first password (they choose their own at the next login). Returned once - it goes only to their own e-mail. */
export async function resetWorkspacePassword(email: string): Promise<{ password: string }> {
  if (!(await managed(email))) throw new Error(`${email} findes ikke i Google.`);
  const password = firstPassword();
  const r = await call("PUT", `/${encodeURIComponent(email)}`, { password, changePasswordAtNextLogin: true });
  if (r.status !== 200) throw new Error(`Google kunne ikke nulstille adgangskoden (${r.status}).`);
  return { password };
}

/** Signs the account out of Google everywhere (a lost phone or laptop). */
export async function signOutWorkspaceUser(email: string): Promise<void> {
  if (!(await managed(email))) throw new Error(`${email} findes ikke i Google.`);
  const r = await call("POST", `/${encodeURIComponent(email)}/signOut`);
  if (r.status < 200 || r.status >= 300) throw new Error(`Google kunne ikke logge ${email} ud (${r.status}).`);
}

/** Closes (suspends) or opens the account again. Mails and files stay. */
export async function setWorkspaceSuspended(email: string, suspended: boolean): Promise<void> {
  const u = await managed(email);
  if (!u) throw new Error(`${email} findes ikke i Google.`);
  if (Boolean(u.suspended) === suspended) return;
  const r = await call("PUT", `/${encodeURIComponent(email)}`, { suspended });
  if (r.status !== 200) throw new Error(`Google: kunne ikke ${suspended ? "lukke" : "åbne"} ${email} (${r.status}).`);
}

/** For the daily run: close the account of someone whose employment ended - quietly skipped where Arpo may not. */
export async function suspendWorkspaceUser(email: string): Promise<"suspended" | "skipped"> {
  if (!workspaceReady() || !onOurDomain(email)) return "skipped";
  const state = await workspaceState(email);
  if (state.state !== "active" && state.state !== "suspended") return "skipped";
  await setWorkspaceSuspended(email, true);
  return "suspended";
}
