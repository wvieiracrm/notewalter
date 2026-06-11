import crypto from "node:crypto";

import { SignJWT } from "jose";
import { authenticator } from "otplib";

import type { VercelRequest, VercelResponse } from "@vercel/node";

const COOKIE_NAME = "nw_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 dias (em segundos)

// Tolerância de ±1 janela (30s) para compensar relógios fora de sincronia.
authenticator.options = { window: 1 };

// Rate-limit simples em memória (por instância) para atenuar brute-force.
const ATTEMPT_WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

const isRateLimited = (ip: string): boolean => {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
};

const sha256 = (value: string): string =>
  crypto.createHash("sha256").update(value, "utf8").digest("hex");

/** Compara `code` (já em sha256) com a lista de hashes de backup, em tempo constante. */
const matchesBackupCode = (code: string): boolean => {
  const raw = process.env.BACKUP_CODES;
  if (!raw) {
    return false;
  }
  const codeHash = new Uint8Array(Buffer.from(sha256(code), "hex"));
  let matched = false;
  for (const stored of raw.split(",")) {
    const trimmed = stored.trim();
    if (trimmed.length !== 64) {
      continue;
    }
    const storedBuf = new Uint8Array(Buffer.from(trimmed, "hex"));
    if (
      storedBuf.length === codeHash.length &&
      crypto.timingSafeEqual(storedBuf, codeHash)
    ) {
      matched = true; // não dá break: mantém o tempo ~constante
    }
  }
  return matched;
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const totpSecret = process.env.TOTP_SECRET;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!totpSecret || !sessionSecret) {
    return res.status(500).json({ error: "server_misconfigured" });
  }

  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)
      ?.split(",")[0]
      ?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "too_many_attempts" });
  }

  const body =
    typeof req.body === "string" ? safeParse(req.body) : req.body ?? {};
  const code = String(body.code ?? "").replace(/\s+/g, "");
  if (!/^\d{6,10}$/.test(code)) {
    return res.status(400).json({ error: "invalid_code_format" });
  }

  const validTotp =
    code.length === 6 && authenticator.verify({ token: code, secret: totpSecret });
  const validBackup = !validTotp && matchesBackupCode(code);

  if (!validTotp && !validBackup) {
    return res.status(401).json({ error: "invalid_code" });
  }

  const token = await new SignJWT({ via: validTotp ? "totp" : "backup" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(new TextEncoder().encode(sessionSecret));

  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`,
  );
  return res.status(200).json({ ok: true });
}

function safeParse(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
