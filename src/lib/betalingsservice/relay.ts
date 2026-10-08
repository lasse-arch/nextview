/**
 * SFTP through a relay server with a fixed IP (e.g. a Hetzner CX22).
 *
 * Mastercard only lets an SFTP connection in from a whitelisted IP address,
 * and Arpo on Vercel has none. So a small server with a fixed IP does the
 * SFTP exchange on Arpo's behalf. It never accepts connections itself: every
 * few minutes it asks Arpo (over HTTPS, with its own token) whether there's
 * anything to do, and only then connects to My File Transfer - when a file
 * is waiting to be sent, when someone pressed "Send/hent nu", and once each
 * morning for receipts and result files (Mastercard asks clients not to
 * poll the mailbox continuously). Everything it fetches is handed straight
 * to Arpo, which stores, imports and decides what may be deleted - exactly
 * as for a direct connection (see sftp.ts). The relay holds no data.
 *
 * The SSH key is made ON the server at setup and never leaves it; the server
 * reports its public half, which is uploaded to the mailbox once.
 */
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getBsSettings } from "./service";
import { queuedSftpUploads } from "./sftp";

export function hashRelayToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Makes a new relay token (replacing any earlier one) - only its hash is kept. */
export async function createRelayToken(): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await getBsSettings();
  await prisma.bsSettings.update({ where: { id: "default" }, data: { relayTokenHash: hashRelayToken(token) } });
  return token;
}

export async function verifyRelayToken(authorization: string | null): Promise<boolean> {
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return false;
  const s = await getBsSettings();
  return Boolean(s.relayTokenHash) && s.relayTokenHash === hashRelayToken(token);
}

function copenhagenDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(d);
}

function copenhagenHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Copenhagen", hour: "2-digit", hour12: false }).format(d));
}

/** The morning check for receipts and result files - once a day from 08:00. */
export function morningExchangeDue(lastRunAt: Date | null, now = new Date()): boolean {
  if (copenhagenHour(now) < 8) return false;
  return !lastRunAt || copenhagenDate(lastRunAt) !== copenhagenDate(now);
}

/** The relay's regular check-in: what (if anything) it should do now. */
export async function relayPoll(info: { publicKey: string | null; ip: string | null }) {
  const s = await getBsSettings();
  const uploads = await queuedSftpUploads();
  await prisma.bsSettings.update({
    where: { id: "default" },
    data: {
      relayLastSeenAt: new Date(),
      ...(info.publicKey ? { relayPublicKey: info.publicKey.trim() } : {}),
      ...(info.ip ? { relayIp: info.ip } : {}),
    },
  });
  const connect =
    Boolean(s.sftpUser) && (uploads.length > 0 || Boolean(s.relayExchangeRequestedAt) || morningExchangeDue(s.sftpLastRunAt));
  return {
    connect,
    sftpUser: s.sftpUser,
    sftpHost: s.sftpHost,
    sftpPort: s.sftpPort,
    uploads: connect ? uploads.map((d) => ({ id: d.id, fileName: d.fileName, content: Buffer.from(d.content).toString("base64") })) : [],
  };
}

/** The relay finished an exchange (or failed to connect). */
export async function relayExchangeDone(ok: boolean, error: string | null): Promise<void> {
  await prisma.bsSettings.update({
    where: { id: "default" },
    data: { sftpLastRunAt: new Date(), sftpLastError: ok ? null : error || "Ukendt fejl", relayExchangeRequestedAt: null },
  });
}

/** The relay program itself - plain Node, run by a systemd timer. */
export const RELAY_SCRIPT = String.raw`// Arpo <-> Mastercard My File Transfer relay. Managed by Arpo - see
// src/lib/betalingsservice/relay.ts in the Arpo repo.
const fs = require("fs");
const crypto = require("crypto");
const SftpClient = require("ssh2-sftp-client");

const ARPO = process.env.ARPO_URL;
const TOKEN = process.env.RELAY_TOKEN;
const KEY_PATH = process.env.KEY_PATH || "/opt/arpo-relay/id_rsa";
const HOST_KEY_SHA256 = "RHWE6QOfc5yc4VMmZVzWtEk3adFKEkVVen/nN+NZ2Ng";

async function call(path, body) {
  const res = await fetch(ARPO + "/api/betalingsservice/relay/" + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(path + ": " + res.status + " " + (await res.text()));
  return res.json();
}

async function main() {
  const publicKey = fs.readFileSync(KEY_PATH + ".pub", "utf8").trim();
  const plan = await call("poll", { publicKey });
  if (!plan.connect) return;

  const sftp = new SftpClient("arpo-relay");
  try {
    await sftp.connect({
      host: process.env.SFTP_HOST || plan.sftpHost || "185.96.138.21",
      port: Number(process.env.SFTP_PORT || plan.sftpPort || 10022),
      username: plan.sftpUser,
      privateKey: fs.readFileSync(KEY_PATH, "utf8"),
      passphrase: process.env.KEY_PASSPHRASE,
      readyTimeout: 30000,
      retries: 1,
      hostVerifier: (key) =>
        process.env.SKIP_HOST_CHECK === "1" ||
        crypto.createHash("sha256").update(key).digest("base64").replace(/=+$/, "") === HOST_KEY_SHA256,
    });
    for (const u of plan.uploads) {
      let error = null;
      try {
        await sftp.put(Buffer.from(u.content, "base64"), "/" + u.fileName);
      } catch (err) {
        error = String((err && err.message) || err);
      }
      await call("sent", { id: u.id, error });
    }
    const files = (await sftp.list("/")).filter((f) => f.type === "-" && !/^(BS0601-|sshPublicKey)/i.test(f.name));
    for (const f of files) {
      const content = await sftp.get("/" + f.name);
      const result = await call("file", { fileName: f.name, content: Buffer.from(content).toString("base64") });
      if (result.delete) await sftp.delete("/" + f.name).catch((err) => console.error("delete", f.name, err));
    }
    await call("done", { ok: true });
  } catch (err) {
    console.error(err);
    await call("done", { ok: false, error: String((err && err.message) || err) }).catch(() => {});
  } finally {
    await sftp.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line ? pad + line : line))
    .join("\n");
}

/**
 * The cloud-init "Cloud config" to paste when creating the server (Ubuntu
 * 24.04): installs Node 22 and the relay, makes the RSA 2048 key with a
 * random passphrase (Mastercard's requirement), and runs the relay every 5
 * minutes. Contains the relay token - shown once, right after it's made.
 */
export function relayCloudConfig(arpoUrl: string, token: string): string {
  const service = `[Unit]
Description=Arpo Betalingsservice SFTP relay
After=network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/arpo-relay.env
WorkingDirectory=/opt/arpo-relay
ExecStart=/usr/bin/node /opt/arpo-relay/relay.js
TimeoutStartSec=240
`;
  const timer = `[Unit]
Description=Run the Arpo relay every 5 minutes

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
`;
  return `#cloud-config
write_files:
  - path: /opt/arpo-relay/relay.js
    permissions: "0644"
    content: |
${indent(RELAY_SCRIPT, 6)}
  - path: /etc/arpo-relay.env
    permissions: "0600"
    content: |
      ARPO_URL=${arpoUrl}
      RELAY_TOKEN=${token}
  - path: /etc/systemd/system/arpo-relay.service
    content: |
${indent(service, 6)}
  - path: /etc/systemd/system/arpo-relay.timer
    content: |
${indent(timer, 6)}
runcmd:
  - curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  - apt-get install -y nodejs
  - cd /opt/arpo-relay && npm init -y >/dev/null && npm install ssh2-sftp-client@12.1.1
  - PASS=$(openssl rand -hex 24) && ssh-keygen -q -t rsa -b 2048 -m PEM -N "$PASS" -C nextview360-betalingsservice -f /opt/arpo-relay/id_rsa && echo "KEY_PASSPHRASE=$PASS" >> /etc/arpo-relay.env
  - chmod 600 /opt/arpo-relay/id_rsa
  - systemctl daemon-reload
  - systemctl enable --now arpo-relay.timer
`;
}
