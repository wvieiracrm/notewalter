/**
 * Setup do MFA (TOTP) do Note Walter — rodar UMA vez, localmente.
 *
 *   node scripts/totp-setup.mjs
 *
 * Gera:
 *   - TOTP_SECRET  : segredo base32 para o Google Authenticator (cadastrar no painel da Vercel)
 *   - QR Code      : escaneie no app Google Authenticator
 *   - SESSION_SECRET: chave aleatória para assinar o cookie de sessão (JWT)
 *   - BACKUP_CODES : hashes SHA-256 (vão para a Vercel) + códigos em claro (guardar offline)
 *
 * NUNCA comite os valores gerados. Eles ficam só nas variáveis de ambiente da Vercel
 * e nos seus registros pessoais.
 */
import crypto from "node:crypto";

import qrcode from "qrcode-terminal";

const ISSUER = "Note Walter";
const ACCOUNT = "lousa.tudocrm.com.br";
const BACKUP_CODE_COUNT = 8;

const sha256 = (value) =>
  crypto.createHash("sha256").update(value, "utf8").digest("hex");

/** Codifica bytes em base32 (RFC 4648, sem padding) — formato do Google Authenticator. */
const base32Encode = (bytes) => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += alphabet[(value << (5 - bits)) & 31];
  }
  return out;
};

// 1) Segredo TOTP (compartilhado com o Google Authenticator) — 20 bytes (SHA1/6/30).
const totpSecret = base32Encode(crypto.randomBytes(20));
const otpauthUri =
  `otpauth://totp/${encodeURIComponent(`${ISSUER}:${ACCOUNT}`)}` +
  `?secret=${totpSecret}&issuer=${encodeURIComponent(ISSUER)}` +
  `&algorithm=SHA1&digits=6&period=30`;

// 2) Segredo de sessão (assinatura do JWT do cookie)
const sessionSecret = crypto.randomBytes(48).toString("base64url");

// 3) Códigos de backup (uso de emergência)
const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
  // 10 dígitos, agrupados em 2x5 para facilitar a digitação
  crypto.randomInt(0, 1e10).toString().padStart(10, "0"),
);
const backupHashes = backupCodes.map(sha256);

const line = "=".repeat(72);

console.log(`\n${line}`);
console.log("  NOTE WALTER — SETUP DO MFA (TOTP)");
console.log(`${line}\n`);

console.log("1) Escaneie este QR Code no app Google Authenticator:\n");
qrcode.generate(otpauthUri, { small: true });

console.log("\n   (Se preferir digitar manualmente, use a chave abaixo no app.)\n");

console.log(`${line}`);
console.log("  VARIÁVEIS DE AMBIENTE — cadastre no painel da Vercel (Production)");
console.log(`${line}\n`);

console.log(`TOTP_SECRET=${totpSecret}`);
console.log(`SESSION_SECRET=${sessionSecret}`);
console.log(`BACKUP_CODES=${backupHashes.join(",")}`);

console.log(`\n${line}`);
console.log("  CÓDIGOS DE BACKUP — guarde em local seguro e OFFLINE");
console.log("  (não vão para a Vercel; servem se você perder o celular)");
console.log(`${line}\n`);

backupCodes.forEach((code, i) => {
  const pretty = `${code.slice(0, 5)} ${code.slice(5)}`;
  console.log(`  ${String(i + 1).padStart(2, " ")}. ${pretty}`);
});

console.log(`\n${line}`);
console.log("  Próximos passos:");
console.log("  - Cadastre TOTP_SECRET, SESSION_SECRET e BACKUP_CODES na Vercel.");
console.log("  - NÃO comite estes valores. Feche o terminal após anotar.");
console.log(`${line}\n`);

console.log(`otpauth URI (debug): ${otpauthUri}\n`);
