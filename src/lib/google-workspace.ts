import "server-only";
import { randomInt } from "node:crypto";
import { getVercelOidcTokenSync } from "@vercel/oidc";

/*
 * Google Workspace accounts made from Arpo (HR → "Giv adgang til Arpo", Brugere): created, given a new password,
 * signed out, closed and opened again - so nobody has to go into Google Admin.
 *
 * No key anywhere: Vercel proves to Google that the call comes from our Vercel project (OIDC federation - Vercel
 * signs a short-lived token per request), Google's Workload Identity Pool trusts only our team, project and
 * production, and lets it act as the service account `arpo-workspace`, which holds a custom admin role in Google that
 * may only manage users (not a super admin). Google never lets such a role change a super admin, so Lasse's account
 * can't be touched. Setup: docs/google-workspace.md. Vercel env (ids, not secrets):
 *  - GCP_PROJECT_NUMBER, GCP_WORKLOAD_POOL_ID, GCP_WORKLOAD_PROVIDER_ID, GCP_SERVICE_ACCOUNT_EMAIL
 *  - GOOGLE_WORKSPACE_OU (optional): an organisational unit to keep Arpo inside - new accounts go there, and only
 *    accounts in it are managed. Without it, new accounts go in the top unit and any non-admin can be managed.
 * Only the scope admin.directory.user is asked for. On top of Google's own limits, Arpo only touches accounts on our
 * domain that aren't admins in Google.
 */

export const WORKSPACE_DOMAIN = "nextview360.dk";
const SCOPE = "https://www.googleapis.com/auth/admin.directory.user";
const API = "https://admin.googleapis.com/admin/directory/v1/users";

function federation() {
  const project = process.env.GCP_PROJECT_NUMBER?.trim();
  const pool = process.env.GCP_WORKLOAD_POOL_ID?.trim();
  const provider = process.env.GCP_WORKLOAD_PROVIDER_ID?.trim();
  const account = process.env.GCP_SERVICE_ACCOUNT_EMAIL?.trim();
  if (!project || !pool || !provider || !account) return null;
  if (!/^\d+$/.test(project) || !/^[a-z0-9-]+$/.test(pool) || !/^[a-z0-9-]+$/.test(provider) || !/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(account)) return null;
  return { audience: `//iam.googleapis.com/projects/${project}/locations/global/workloadIdentityPools/${pool}/providers/${provider}`, account };
}

/** Is Arpo set up to manage Google accounts? */
export const workspaceReady = () => federation() != null;

/** The unit Arpo is kept inside, or null (the whole domain, admins aside). */
export const workspaceUnit = (): string | null => {
  const ou = process.env.GOOGLE_WORKSPACE_OU?.trim();
  if (!ou || ou === "/") return null;
  return ou.startsWith("/") ? ou : `/${ou}`;
};

async function post<T>(url: string, init: { body: string | URLSearchParams; auth?: string; json?: boolean }): Promise<{ ok: boolean; status: number; data: T | null }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": init.json ? "application/json" : "application/x-www-form-urlencoded", ...(init.auth ? { Authorization: `Bearer ${init.auth}` } : {}) },
    body: init.body,
    signal: AbortSignal.timeout(15_000),
  });
  return { ok: res.ok, status: res.status, data: (await res.json().catch(() => null)) as T | null };
}

let cached: { token: string; until: number } | null = null;

/**
 * An access token for the service account: Vercel's OIDC token → Google STS (a federated token) → the service
 * account's own token, with only the users scope, for 10 minutes. Kept in memory only, never logged.
 */
async function token(): Promise<string> {
  const f = federation();
  if (!f) throw new Error("Google Workspace er ikke sat op i Arpo endnu.");
  if (cached && cached.until > Date.now()) return cached.token;
  let oidc: string;
  try {
    oidc = getVercelOidcTokenSync();
  } catch {
    throw new Error("Vercel gav ikke Arpo et OIDC-token - er OIDC slået til under projektets Settings → Security?");
  }
  const sts = await post<{ access_token?: string; error?: string }>("https://sts.googleapis.com/v1/token", {
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      audience: f.audience,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      subject_token: oidc,
    }),
  });
  // Only Google's error code - never a token.
  if (!sts.ok || !sts.data?.access_token) throw new Error(`Google afviste Vercels login (${sts.data?.error ?? sts.status}) - tjek Workload Identity-poolen.`);
  const sa = await post<{ accessToken?: string; error?: { status?: string } }>(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(f.account)}:generateAccessToken`, {
    auth: sts.data.access_token,
    json: true,
    body: JSON.stringify({ scope: [SCOPE], lifetime: "600s" }),
  });
  if (!sa.ok || !sa.data?.accessToken) throw new Error(`Google lod ikke Arpo bruge servicekontoen (${sa.data?.error?.status ?? sa.status}) - tjek rollen Workload Identity User.`);
  cached = { token: sa.data.accessToken, until: Date.now() + 540_000 };
  return sa.data.accessToken;
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
