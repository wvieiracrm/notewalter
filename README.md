# Note Walter — Whiteboard para Aulas

Whiteboard interativo criado por **Walter Vieira** como base para ministrar aulas sobre CRM, automação de vendas e Inteligência Artificial no YouTube.

Este projeto é um fork do [Excalidraw](https://github.com/excalidraw/excalidraw), personalizado para uso didático.

## Sobre o Projeto

- **Canal YouTube**: Aulas de CRM, Automação de Vendas e IA
- **Base**: Fork do Excalidraw (whiteboard open source)
- **Deploy**: Vercel (auto-deploy a cada push no `master`)
- **Repositório**: [github.com/wvieiracrm/notewalter](https://github.com/wvieiracrm/notewalter)

## Desenvolvimento Local

```bash
# Instalar dependências
yarn install

# Iniciar servidor de desenvolvimento (porta 3001)
yarn start

# Verificar tipagem TypeScript
yarn test:typecheck

# Rodar todos os testes
yarn test:update

# Corrigir formatação e lint
yarn fix
```

## Estrutura do Monorepo

- **`packages/excalidraw/`** — Biblioteca React principal (`@excalidraw/excalidraw`)
- **`excalidraw-app/`** — Aplicação web completa (ponto de entrada)
- **`packages/`** — Pacotes core: `@excalidraw/common`, `@excalidraw/element`, `@excalidraw/math`, `@excalidraw/utils`

## Deploy

O projeto está conectado à Vercel. Qualquer push para o branch `master` dispara um deploy automático.

O upstream do Excalidraw está disponível em:
```bash
git remote add upstream https://github.com/excalidraw/excalidraw.git
git fetch upstream
git merge upstream/master
```

## Licença

MIT — veja [LICENSE](LICENSE) para detalhes.
