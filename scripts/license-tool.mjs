#!/usr/bin/env node
/**
 * Fluxentiq License Tool — issue signed license keys (seller-side only).
 *
 * Generates an Ed25519 keypair and issues `FLUX-PRO-…` / `FLUX-ENT-…` license
 * keys that the product verifies offline. Keep the PRIVATE key secret
 * (gitignored); only the PUBLIC key ships with the software.
 *
 * Usage:
 *   node scripts/license-tool.mjs keypair
 *   node scripts/license-tool.mjs issue \
 *     --tier pro|enterprise \
 *     --email owner@acme.com \
 *     --org "Acme Corp" \
 *     --users 500 \
 *     [--expires 2030-01-01]            # omit for perpetual
 *     [--private-key path/to/private.pem]
 *
 * The private key can also be supplied via the LICENSE_PRIVATE_KEY env var
 * (PEM string) or a file at data/license-private.pem.
 */

import { generateKeyPairSync, createPrivateKey, sign } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

/* ── helpers ─────────────────────────────────────────────────────────────── */

function b64url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function loadPrivateKey(path) {
  if (process.env.LICENSE_PRIVATE_KEY) {
    return createPrivateKey(process.env.LICENSE_PRIVATE_KEY);
  }
  const resolved =
    path ||
    (existsSync("data/license-private.pem") ? "data/license-private.pem" : null);
  if (!resolved) {
    console.error(
      "No private key provided. Pass --private-key <path>, set LICENSE_PRIVATE_KEY, or place it at data/license-private.pem.",
    );
    process.exit(1);
  }
  return createPrivateKey(readFileSync(resolved, "utf8"));
}

function readFlag(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) {
    return fallback;
  }
  return args[index + 1];
}

/* ── commands ────────────────────────────────────────────────────────────── */

function cmdKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pubPem = publicKey.export({ type: "spki", format: "pem" });
  const privPem = privateKey.export({ type: "pkcs8", format: "pem" });

  writeFileSync("data/license-private.pem", privPem, { mode: 0o600 });
  console.log("Private key written to data/license-private.pem (KEEP SECRET).");
  console.log("\nPublic key — embed in lib/license.ts (or set LICENSE_PUBLIC_KEY):\n");
  console.log(pubPem.trim());
}

function cmdIssue(args) {
  const privateKey = loadPrivateKey(readFlag(args, "--private-key"));
  const tierRaw = readFlag(args, "--tier", "pro").toLowerCase();
  const tier = tierRaw === "enterprise" || tierRaw === "ent" ? "ENTERPRISE" : "PRO";
  const ownerEmail = readFlag(args, "--email", "");
  const organizationName = readFlag(args, "--org", "");
  const maxUsers = Number(readFlag(args, "--users", "0"));
  const expires = readFlag(args, "--expires", null);

  if (!ownerEmail || !organizationName) {
    console.error("--email and --org are required.");
    process.exit(1);
  }

  const payload = {
    tier,
    ownerEmail,
    organizationName,
    maxUsers: Number.isFinite(maxUsers) ? maxUsers : 0,
    issuedAt: new Date().toISOString(),
    expiresAt: expires || null, // null = perpetual
    allowedFeatures: ["*"],
  };

  const payloadJson = canonicalJson(payload);
  const signature = sign(null, Buffer.from(payloadJson, "utf8"), privateKey);

  const prefix = tier === "ENTERPRISE" ? "FLUX-ENT-" : "FLUX-PRO-";
  const key = `${prefix}${b64url(payloadJson)}.${b64url(signature)}`;

  console.log("\nLicense key:\n");
  console.log(key);
  console.log(
    `\n${tier} · ${organizationName} · ${ownerEmail} · ${payload.maxUsers} users · ${
      expires ? `expires ${expires}` : "perpetual"
    }`,
  );
}

/* ── entrypoint ──────────────────────────────────────────────────────────── */

const [, , command, ...rest] = process.argv;

if (command === "keypair") {
  cmdKeypair();
} else if (command === "issue") {
  cmdIssue(rest);
} else {
  console.log(
    "Usage: node scripts/license-tool.mjs <keypair|issue> [options]\n\n" +
      "  keypair  generate an Ed25519 keypair (private → data/license-private.pem)\n" +
      "  issue    sign a license key\n" +
      "           --tier pro|enterprise  --email <owner>\n" +
      "           --org <name>           --users <n>\n" +
      "           [--expires YYYY-MM-DD] [--private-key <path>]",
  );
  process.exit(1);
}
