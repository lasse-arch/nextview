import { test } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";

// A throwaway key - Google is never called: fetch is replaced below.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.GOOGLE_WORKSPACE_KEY = JSON.stringify({ client_email: "arpo@test.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
process.env.GOOGLE_WORKSPACE_ADMIN = "arpo-admin@nextview360.dk";

type Call = { method: string; url: string; body: unknown };
const calls: Call[] = [];
const users: Record<string, { orgUnitPath: string; isAdmin?: boolean; suspended?: boolean }> = {
  "sofie@nextview360.dk": { orgUnitPath: "/Medarbejdere" },
  "lasse@nextview360.dk": { orgUnitPath: "/", isAdmin: true },
  "ekstern@nextview360.dk": { orgUnitPath: "/Andre" },
};
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body instanceof URLSearchParams ? Object.fromEntries(init.body) : null;
  calls.push({ method, url, body });
  const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status });
  if (url.startsWith("https://oauth2.googleapis.com/token")) {
    const [h, c, sig] = String((body as { assertion: string }).assertion).split(".");
    const ok = createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, "base64url"));
    const claims = JSON.parse(Buffer.from(c, "base64url").toString());
    if (!ok || claims.sub !== "arpo-admin@nextview360.dk" || claims.scope !== "https://www.googleapis.com/auth/admin.directory.user") return json(401, { error: "invalid_grant" });
    return json(200, { access_token: "t" });
  }
  const m = url.match(/\/users\/([^/]+)(\/signOut)?$/);
  const email = m ? decodeURIComponent(m[1]) : "";
  if (method === "POST" && !m) return users[(body as { primaryEmail: string }).primaryEmail] ? json(409, {}) : json(200, {});
  if (!users[email]) return json(404, {});
  if (method === "GET") return json(200, { primaryEmail: email, ...users[email] });
  if (method === "PUT") return Object.assign(users[email], body as object), json(200, {});
  return new Response(null, { status: 204 });
}) as typeof fetch;

import * as gw from "./google-workspace";

test("creates an account in the employees' unit, with a password they must change", async () => {
  const { password } = await gw.createWorkspaceUser({ email: "Ny@nextview360.dk", givenName: "Ny", familyName: "Person" });
  assert.equal(password.length, 16);
  const c = calls.find((x) => x.method === "POST" && x.url.endsWith("/users"))!;
  assert.deepEqual({ ...(c.body as object), password: "-" }, { primaryEmail: "ny@nextview360.dk", name: { givenName: "Ny", familyName: "Person" }, password: "-", changePasswordAtNextLogin: true, orgUnitPath: "/Medarbejdere" });
});

test("never another domain, never an existing account", async () => {
  await assert.rejects(gw.createWorkspaceUser({ email: "x@gmail.com", givenName: "X", familyName: "" }), /@nextview360\.dk/);
  await assert.rejects(gw.createWorkspaceUser({ email: "sofie@nextview360.dk", givenName: "S", familyName: "" }), /findes allerede/);
});

test("never touches an admin or an account outside the unit", async () => {
  await assert.rejects(gw.resetWorkspacePassword("lasse@nextview360.dk"), /administrator/);
  await assert.rejects(gw.resetWorkspacePassword("ekstern@nextview360.dk"), /ligger ikke i/);
  await assert.rejects(gw.setWorkspaceSuspended("lasse@nextview360.dk", true), /administrator/);
  assert.equal(await gw.suspendWorkspaceUser("lasse@nextview360.dk"), "skipped");
  assert.equal(users["lasse@nextview360.dk"].suspended, undefined);
  assert.ok(!calls.some((c) => c.method !== "GET" && c.url.includes("lasse")));
});

test("resets, signs out, closes and opens an employee's account", async () => {
  const { password } = await gw.resetWorkspacePassword("sofie@nextview360.dk");
  assert.equal(password.length, 16);
  await gw.signOutWorkspaceUser("sofie@nextview360.dk");
  assert.ok(calls.some((c) => c.method === "POST" && c.url.endsWith("/sofie%40nextview360.dk/signOut")));
  assert.equal(await gw.suspendWorkspaceUser("sofie@nextview360.dk"), "suspended");
  assert.equal(users["sofie@nextview360.dk"].suspended, true);
  assert.deepEqual(await gw.workspaceState("sofie@nextview360.dk"), { state: "suspended" });
  await gw.setWorkspaceSuspended("sofie@nextview360.dk", false);
  assert.equal(users["sofie@nextview360.dk"].suspended, false);
});
