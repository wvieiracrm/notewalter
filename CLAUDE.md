# CLAUDE.md

## Projeto

**Note Walter** é um fork do Excalidraw, mantido por Walter Vieira, usado como whiteboard interativo para ministrar aulas de CRM, automação de vendas e IA no YouTube.

- **Repositório**: `github.com/wvieiracrm/notewalter`
- **Deploy**: Vercel (auto-deploy em push para `master`)
- **Upstream**: `github.com/excalidraw/excalidraw`

## Project Structure

Note Walter é um **monorepo** (fork do Excalidraw) com separação entre biblioteca core e aplicação:

- **`packages/excalidraw/`** - Main React component library published to npm as `@excalidraw/excalidraw`
- **`excalidraw-app/`** - Full-featured web application (ponto de entrada da app)
- **`packages/`** - Core packages: `@excalidraw/common`, `@excalidraw/element`, `@excalidraw/math`, `@excalidraw/utils`
- **`examples/`** - Integration examples (NextJS, browser script)

## Development Workflow

1. **Package Development**: Work in `packages/*` for editor features
2. **App Development**: Work in `excalidraw-app/` for app-specific features
3. **Testing**: Always run `yarn test:update` before committing
4. **Type Safety**: Use `yarn test:typecheck` to verify TypeScript

## Development Commands

```bash
yarn test:typecheck  # TypeScript type checking
yarn test:update     # Run all tests (with snapshot updates)
yarn fix             # Auto-fix formatting and linting issues
```

## Architecture Notes

### Package System

- Uses Yarn workspaces for monorepo management
- Internal packages use path aliases (see `vitest.config.mts`)
- Build system uses esbuild for packages, Vite for the app
- TypeScript throughout with strict configuration

## Controle de acesso (MFA / TOTP)

A lousa em `https://lousa.tudocrm.com.br/` é privada, protegida por um gate de MFA
no Edge da Vercel (sem login/senha — apenas código TOTP do Google Authenticator).

- **`middleware.ts`** (Edge): valida o cookie de sessão (`nw_session`, JWT via `jose`)
  e renova por mais 30 dias a cada acesso (sliding). Sem cookie válido, devolve o HTML
  do gate com campo de código.
- **`api/auth.ts`** (função Node): valida o código TOTP (`otplib`) ou um código de
  backup e seta o cookie `HttpOnly`/`Secure` por 30 dias.
- **`scripts/totp-setup.mjs`**: rodar UMA vez localmente para gerar segredo + QR Code
  do Google Authenticator e os códigos de backup. `node scripts/totp-setup.mjs`.
- O **PWA fica desativado** (`selfDestroying` em `vite.config.mts`) para o Service
  Worker não furar o gate via cache offline.

> **Funções serverless na Vercel:** a pasta `api/` tem um `package.json` com
> `{"type":"module"}`. É obrigatório: a Vercel compila `api/*.ts` usando o
> `tsconfig.json` da raiz (`module: ESNext`), gerando `.js` com `import` (ESM);
> sem `type:module` o runtime executa como CommonJS e dá
> `FUNCTION_INVOCATION_FAILED` ("Cannot use import statement outside a module").
> O `engines.node` da raiz está fixado em `22.x` (Node 18 está fora do runtime
> de funções). Para saber qual commit está no ar: `GET /version.json` (mas é
> interceptado pelo gate; use o painel da Vercel se estiver autenticado).

### Variáveis de ambiente (definir no painel da Vercel — Production, nunca commitar)

| Variável | Conteúdo |
|---|---|
| `TOTP_SECRET` | segredo base32 do Google Authenticator (gerado pelo script) |
| `SESSION_SECRET` | chave aleatória forte (≥ 32 bytes) que assina o JWT do cookie |
| `BACKUP_CODES` | hashes SHA-256 dos códigos de backup, separados por vírgula |
