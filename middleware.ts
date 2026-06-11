import { next } from "@vercel/edge";
import { jwtVerify, SignJWT } from "jose";

const COOKIE_NAME = "nw_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 dias (segundos)
// Renova o cookie (sliding) quando faltar menos de 29 dias para expirar.
const RENEW_THRESHOLD = 60 * 60 * 24 * 29;

// Roda em todas as rotas, exceto as rotas de API (que cuidam do próprio acesso).
export const config = {
  matcher: ["/((?!api/).*)"],
};

const encoder = new TextEncoder();

const sign = (sessionSecret: string) =>
  new SignJWT({ via: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(encoder.encode(sessionSecret));

const sessionCookie = (token: string) =>
  `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`;

export default async function middleware(request: Request): Promise<Response> {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    return new Response(gateHtml("Servidor sem configuração de acesso."), {
      status: 500,
      headers: htmlHeaders(),
    });
  }

  const token = readCookie(request, COOKIE_NAME);
  if (token) {
    try {
      const { payload } = await jwtVerify(
        token,
        encoder.encode(sessionSecret),
      );
      const remaining = (payload.exp ?? 0) - Math.floor(Date.now() / 1000);
      // Sessão válida: segue para o app. Renova se estiver perto de expirar.
      if (remaining < RENEW_THRESHOLD) {
        const fresh = await sign(sessionSecret);
        return next({ headers: { "set-cookie": sessionCookie(fresh) } });
      }
      return next();
    } catch {
      // token inválido/expirado → cai para o gate
    }
  }

  return new Response(gateHtml(), {
    status: 401,
    headers: htmlHeaders(),
  });
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) {
    return null;
  }
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return rest.join("=");
    }
  }
  return null;
}

function htmlHeaders(): HeadersInit {
  return {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-robots-tag": "noindex, nofollow",
  };
}

function gateHtml(message = ""): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Note Walter — Acesso restrito</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: radial-gradient(1200px 600px at 50% -10%, #1f2937, #0b1220 60%); color: #e5e7eb;
  }
  .card {
    width: 100%; max-width: 360px; margin: 24px; padding: 32px 28px;
    background: #111827; border: 1px solid #1f2937; border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,.45); text-align: center;
  }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.sub { margin: 0 0 22px; font-size: 13px; color: #9ca3af; }
  input {
    width: 100%; padding: 14px 16px; font-size: 22px; letter-spacing: 8px; text-align: center;
    background: #0b1220; color: #e5e7eb; border: 1px solid #374151; border-radius: 10px; outline: none;
  }
  input:focus { border-color: #6366f1; }
  button {
    width: 100%; margin-top: 14px; padding: 13px 16px; font-size: 15px; font-weight: 600;
    color: #fff; background: #6366f1; border: 0; border-radius: 10px; cursor: pointer;
  }
  button:disabled { opacity: .6; cursor: default; }
  .msg { min-height: 18px; margin-top: 12px; font-size: 13px; color: #f87171; }
  .hint { margin-top: 18px; font-size: 12px; color: #6b7280; }
</style>
</head>
<body>
  <div class="card">
    <h1>Note Walter</h1>
    <p class="sub">Acesso restrito — informe o código do seu autenticador.</p>
    <form id="f" autocomplete="off">
      <input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10"
             pattern="[0-9]*" placeholder="000000" aria-label="Código de acesso" autofocus />
      <button id="btn" type="submit">Entrar</button>
      <div class="msg" id="msg">${escapeHtml(message)}</div>
    </form>
    <div class="hint">Use o código de 6 dígitos do Google Authenticator.</div>
  </div>
<script>
  var form = document.getElementById('f');
  var input = document.getElementById('code');
  var btn = document.getElementById('btn');
  var msg = document.getElementById('msg');
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var code = (input.value || '').replace(/\\s+/g, '');
    if (!/^[0-9]{6,10}$/.test(code)) { msg.textContent = 'Código inválido.'; return; }
    btn.disabled = true; msg.textContent = '';
    try {
      var r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: code })
      });
      if (r.ok) { window.location.replace('/'); return; }
      if (r.status === 429) { msg.textContent = 'Muitas tentativas. Aguarde um minuto.'; }
      else { msg.textContent = 'Código incorreto. Tente novamente.'; }
    } catch (err) {
      msg.textContent = 'Falha de conexão. Tente novamente.';
    }
    btn.disabled = false; input.value = ''; input.focus();
  });
</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
