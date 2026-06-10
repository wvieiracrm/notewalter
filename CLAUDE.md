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
