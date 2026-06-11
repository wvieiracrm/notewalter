import crypto from "node:crypto";

import { SignJWT } from "jose";

// Tipos mínimos do handler da Vercel (Node runtime). Não dependemos do pacote
// `@vercel/node` em package.json — ele puxa node-gyp/nopt, que exige Node >=20.5
// e quebra o `yarn install` do build. A Vercel injeta o próprio builder em runtime.
interface VercelRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}
interface VercelResponse {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
  setHeader(name: string, value: string): void;
}

const COOKIE_NAME = "nw_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 dias (em segundos)
const TOTP_STEP = 30; // segundos por janela
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1; // tolerância de ±1 janela (relógios fora de sincronia)

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

const sha256 = (value: string): Uint8Array =>
  new Uint8Array(crypto.createHash("sha256").update(value, "utf8").digest());

const equalBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && crypto.timingSafeEqual(a, b);

/** Decodifica um segredo base32 (RFC 4648, sem padding) em bytes. */
const base32Decode = (input: string): Uint8Array => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) {
      continue;
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
};

/** HOTP (RFC 4226) para um contador. */
const hotp = (secret: Uint8Array, counter: number): string => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (bin % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, "0");
};

/** Valida um TOTP (RFC 6238) — compatível com Google Authenticator. */
const verifyTotp = (token: string, base32Secret: string): boolean => {
  if (token.length !== TOTP_DIGITS) {
    return false;
  }
  const secret = base32Decode(base32Secret);
  const counter = Math.floor(Date.now() / 1000 / TOTP_STEP);
  const target = new TextEncoder().encode(token);
  for (let w = -TOTP_WINDOW; w <= TOTP_WINDOW; w++) {
    if (equalBytes(new TextEncoder().encode(hotp(secret, counter + w)), target)) {
      return true;
    }
  }
  return false;
};

/** Confere `code` contra a lista de hashes de backup, em tempo ~constante. */
const matchesBackupCode = (code: string): boolean => {
  const raw = process.env.BACKUP_CODES;
  if (!raw) {
    return false;
  }
  const codeHash = sha256(code);
  let matched = false;
  for (const stored of raw.split(",")) {
    const trimmed = stored.trim();
    if (trimmed.length !== 64) {
      continue;
    }
    if (equalBytes(new Uint8Array(Buffer.from(trimmed, "hex")), codeHash)) {
      matched = true; // não dá break: mantém o tempo ~constante
    }
  }
  return matched;
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  try {
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

    const body: Record<string, unknown> =
      typeof req.body === "string"
        ? safeParse(req.body)
        : (req.body as Record<string, unknown>) ?? {};
    const code = String(body.code ?? "").replace(/\s+/g, "");
    if (!/^\d{6,10}$/.test(code)) {
      return res.status(400).json({ error: "invalid_code_format" });
    }

    const validTotp = verifyTotp(code, totpSecret);
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
  } catch (err) {
    // Nunca deixa a função crashar silenciosamente (FUNCTION_INVOCATION_FAILED).
    console.error("auth handler error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
}

function safeParse(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
