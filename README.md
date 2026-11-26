# Império ERP

Gestão de obras e empreendimentos: obras e andamento (com holograma), estoque, compras, contratos e medições,
contas a pagar e a receber, vendas e unidades, folha, diário de obra, documentos e um painel de inteligência (BI).

Servidor **Node.js + PostgreSQL** (único pacote de produção: `pg`) e interface em HTML/JS/CSS puro. Multiusuário, com perfis de acesso.

## Como rodar

Requisitos: **Node 22.13 ou mais novo** e um **PostgreSQL 14+** (`DATABASE_URL`).

```bash
npm install
DATABASE_URL=postgres://usuario:senha@localhost:5432/imperio npm start    # http://127.0.0.1:3000
```

Para só experimentar, sem instalar Postgres: `npm install` (traz o PGlite, um Postgres embutido, só em desenvolvimento) e `npm start` **sem** `DATABASE_URL` —
o banco fica na pasta `data/pgdata`. Em produção use sempre um PostgreSQL de verdade.

No primeiro acesso o sistema pede para criar o **administrador**. Os demais usuários e os **perfis de acesso** são criados na tela
*Administração* (o perfil Administrador é fixo; os outros você monta escolhendo o que cada um pode ver e fazer).

O sistema começa **vazio**. Para conhecer com dados fictícios: `npm run seed:demo` (cria um administrador se não houver) ou o botão
*Administração → Backup → Dados de exemplo*. Só funciona em sistema vazio.

### Hospedar (Coolify, Docker, VPS)

O repositório tem `Dockerfile` e healthcheck em `/api/saude`. No **Coolify**: aponte para o repositório (build pack *Dockerfile*), porta **3000**,
crie um serviço **PostgreSQL** no Coolify (ou use um que já tenha), adicione um **armazenamento persistente montado em `/data`** (anexos e backups em arquivo) e defina as variáveis abaixo.

| Variável | Obrigatória? | Para quê |
|---|---|---|
| `DATABASE_URL` | **sim** | Conexão do PostgreSQL, ex.: `postgres://usuario:senha@host:5432/imperio` (no Coolify: a *Postgres URL (internal)* do serviço de banco). As tabelas são criadas sozinhas na primeira subida. |
| `PUBLIC_URL` | **sim** | Endereço público, ex.: `https://imperio.seudominio.com`. Com ela o sistema escuta em `0.0.0.0`, liga o cookie seguro, aceita essa origem e lê o IP real do cliente atrás do proxy. |
| `ADMIN_EMAIL` + `ADMIN_SENHA` | recomendada no 1º deploy | Cria o administrador sozinho se ainda não houver usuário (senha temporária: pede troca no 1º login). Sem elas, **o primeiro visitante cria o administrador** pela tela. Senha: mínimo 10, letras e números. Depois do 1º login podem ser removidas. |
| `ADMIN_NOME` | não | Nome do administrador inicial (padrão "Administrador"). |

Não precisa de mais nada. Os padrões do código já assumem: porta `3000`, dados em `/data`, fuso `America/Sao_Paulo`, sessão de 12 h.
Ajustes opcionais: `PG_POOL` (conexões, padrão 10), `PGSSL=1` (banco que exige TLS), `PORT`, `HOST`, `DATA_DIR`, `TZ_EMPRESA`, `SESSION_HOURS`, `COOKIE_SECURE`, `TRUST_PROXY`, `LOG_QUIET`.

Faça o backup do **PostgreSQL** pelo próprio Coolify (backup agendado do serviço de banco) e do volume `/data`. Além disso o sistema grava sozinho uma cópia
compactada (`.json.gz`) a cada 6 h em `/data/backups` e permite baixar/restaurar um backup completo em *Administração → Backup*.
Rode **uma única réplica** do app: os caches de painel ficam na memória do processo (mais de uma réplica pode mostrar números atrasados). As gravações já são
serializadas também no banco (trava consultiva), então estoque e saldos não furam.

## Testes

```bash
npm test            # 81 testes de regra de negócio, segurança, concorrência e API (node --test; usa o Postgres embutido em memória)
TEST_DATABASE_URL=postgres://... npm test   # os mesmos testes num PostgreSQL de verdade (cada arquivo num schema próprio, apagado no fim)
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
