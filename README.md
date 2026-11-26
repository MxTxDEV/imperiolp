# Império ERP

Gestão de obras e empreendimentos: obras e andamento (com holograma), estoque, compras, contratos e medições,
contas a pagar e a receber, vendas e unidades, folha, diário de obra, documentos e um painel de inteligência (BI).

Servidor **Node.js + SQLite** (sem dependências externas) e interface em HTML/JS/CSS puro. Multiusuário, com perfis de acesso.

## Como rodar

Requisitos: **Node 22.13 ou mais novo** (usa o SQLite embutido, `node:sqlite`).

```bash
npm start                  # http://127.0.0.1:3000
```

No primeiro acesso o sistema pede para criar o **administrador**. Os demais usuários e os **perfis de acesso** são criados na tela
*Administração* (o perfil Administrador é fixo; os outros você monta escolhendo o que cada um pode ver e fazer).

O sistema começa **vazio**. Para conhecer com dados fictícios: `npm run seed:demo` (cria um administrador se não houver) ou o botão
*Administração → Backup → Dados de exemplo*. Só funciona em sistema vazio.

### Configuração (variáveis de ambiente)

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` / `HOST` | `3000` / `127.0.0.1` | Onde escuta. Por padrão **só a própria máquina** acessa. |
| `DATA_DIR` | `./data` | Banco (`imperio.db`), anexos (`uploads/`), backups (`backups/`) e logs (`logs/app.log`). |
| `TZ_EMPRESA` | `America/Sao_Paulo` | Fuso usado para "hoje" (evita a data errada depois das 21h). |
| `SESSION_HOURS` | `12` | Duração da sessão. |
| `COOKIE_SECURE` | desligado | Ligue (`1`) quando houver HTTPS. |

**Hospedar depois:** coloque um proxy com HTTPS na frente (Caddy, Nginx), ligue `COOKIE_SECURE=1`, mude `HOST` e faça backup do `DATA_DIR`.
Não exponha a porta direto na internet.

## Testes

```bash
npm test            # 78 testes de regra de negócio, segurança e API (node --test, sem dependências)
npm run test:e2e    # ponta a ponta no navegador (precisa do Playwright instalado)
```

## Regras que o sistema garante (e os testes conferem)

- **Totais nunca são digitados**: pago e saldo de uma conta, custo e avanço de uma obra, estoque e custo médio de um material, valores de um contrato.
  Tudo é calculado a partir dos registros (decisão herdada do Segundo Cérebro).
- **Custo da obra** = material consumido (saídas ao custo médio da época) + contas a pagar cuja categoria está marcada "entra no custo da obra".
  Compra de material para estoque **não** é custo da obra; vira custo quando o material é consumido.
- **Nada importante é apagado**: baixa, movimentação e recebimento são *estornados* (cria o lançamento oposto, com motivo). Cadastros com histórico são *arquivados*.
  Excluir só é permitido sem nenhum vínculo, e o sistema mostra o que está ligado.
- **Status da obra é derivado dos passos** (Planejamento → Em andamento → Concluída); só "Pausada" é marcada à mão.
- **Edição concorrente**: dois usuários editando o mesmo registro não se sobrescrevem; quem salva depois recebe aviso.
- **Tudo que muda dado fica na auditoria** (quem, quando, antes e depois).
- Dinheiro em **centavos inteiros** no banco; validação de CPF/CNPJ, e-mail e telefone no servidor.

## Segurança

Senhas com scrypt; sessão em cookie `HttpOnly` + `SameSite=Strict`; bloqueio após 5 tentativas; proteção contra CSRF (cabeçalho próprio + checagem de origem);
permissões conferidas **no servidor em toda rota**; cabeçalhos de segurança e CSP restrita; anexos validados por tipo e assinatura do arquivo (HTML/SVG recusados).

## Estrutura

```
server/            API, regras e banco (index.js, routes.js, crud.js, entities.js, services/*)
server/migrations/ esquema do banco (novas alterações = novo arquivo numerado)
public/            interface (index.html, js/*, css/*)
tests/             testes automatizados
data/              dados em execução (não vai para o Git)
```

## Backup

O sistema guarda uma cópia automática a cada 6 horas (as 14 últimas) em `data/backups/`. Em *Administração → Backup* é possível baixar um arquivo
JSON completo e restaurá-lo (o estado atual é guardado antes). Guarde cópias fora da máquina.
