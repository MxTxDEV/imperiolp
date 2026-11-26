# CLAUDE.md — Império ERP

## Regra principal: consultar o Cérebro do Brabo

Antes de atender **qualquer** pedido neste repositório, consulte o Segundo Cérebro
(`italoplaylist-maker/cerebro-do-brabo`).

1. Se o cérebro não estiver na sessão, anexe-o (`add_repo` italoplaylist-maker/cerebro-do-brabo)
   e clone-o ao lado deste repositório.
2. Siga o `CLAUDE.md` do cérebro: busque o projeto **Império ERP**, as decisões
   (`03 - Decisoes`, `00 - Inbox`), bugs e aprendizados relacionados ao pedido.
3. Respeite as decisões registradas. Se algo não estiver documentado, diga isso em vez de supor.
4. Ao terminar, registre no cérebro o que valer a pena preservar.

## Projeto

- Servidor **Node 22 + SQLite** (`node:sqlite`, sem dependências) e interface em HTML/CSS/JS puro, multiusuário com perfis de acesso.
- Rodar: `npm start` (http://127.0.0.1:3000). Testar: `npm test` (78 testes) e `npm run test:e2e`.
- Servidor em `server/` (rotas em `routes.js`, regras em `server/services/*`, cadastros declarados em `entities.js`, migrações em `server/migrations/`).
  Interface em `public/` (`core.js` núcleo, `pages.js`/`pages2.js`/`admin.js` telas, `bi.js` painel, `fin.js` financeiro, `holo.js` holograma).
- Regras que não se quebram: totais sempre derivados (nunca coluna), dinheiro em centavos, estorno em vez de apagar, status da obra derivado dos passos,
  permissão conferida no servidor. Veja o `README.md`.
- Dados de exemplo só por `npm run seed:demo` ou pelo botão do administrador; o sistema nasce vazio.
- Comunicação com o usuário em português, respostas curtas.
