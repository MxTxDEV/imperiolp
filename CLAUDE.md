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

- Sistema estático (HTML/CSS/JS puro, sem build), dados no `localStorage` do navegador.
- Entrada: `index.html`. Código: `js/app.js` (telas), `js/bi.js` (Painel geral BI), `js/data.js` (dados de exemplo).
- Comunicação com o usuário em português, respostas curtas.
