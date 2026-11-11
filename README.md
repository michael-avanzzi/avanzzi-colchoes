# Avanzzi Agendamentos

Agenda compartilhada de atendimentos da Avanzzi Colchões: Kanban, calendário, histórico auditável e painel de comparecimento e conversão. Substitui o controle feito hoje no Trello.

## Stack

- **Frontend:** React 19 + Vite + TypeScript, instalável como PWA (`vite-plugin-pwa`)
- **Backend:** Supabase (Postgres, Auth, Realtime), região São Paulo (`sa-east-1`)
- **Hospedagem prevista:** Cloudflare Pages (site estático)

## Rodando localmente

1. Copie `.env.example` para `.env.local` e preencha a URL e a chave **publicável** do projeto Supabase.
2. Instale e rode:

   ```bash
   npm install
   npm run dev
   ```

3. Verificações: `npm run build` (inclui checagem de tipos) e `npm run lint`.

## Banco de dados

As migrações ficam em `supabase/migrations`, em ordem de nome:

| Arquivo | Conteúdo |
|---|---|
| `20261110_01_fundacao.sql` | Tipos, perfis, categorias, agendamentos, histórico imutável, RLS e Realtime |
| `20261110_02_rpcs_agendamentos.sql` | Funções de escrita (`rpc_*`) com validação de papel, dono, conflito e versão |
| `20261110_03_auditoria_usuarios.sql` | Histórico imutável de alterações de usuários (`perfil_eventos`); versão desatualizada passa a responder HTTP 409 |
| `20261111_04_indicadores.sql` | `rpc_indicadores`: toda a regra de cálculo do Painel |
| `20261111_05_registro_erros.sql` | Registro de erros do app (`erros_app`) e remoção do acesso de visitantes às funções |

## Testes

- **Front (Vitest):** `npm test` cobre as regras de etapa do Kanban, as permissões exibidas e as datas.
- **Banco:** cole `supabase/testes/regras_agendamento.sql` no SQL Editor e rode. São 32 verificações: criação, conflito, edição simultânea, histórico, reagendamento, cancelamento, comparecimento, venda, troca de vendedor, imutabilidade e bloqueio de escrita direta. O script cria dados fictícios e **desfaz tudo** no final com um erro proposital. O resultado esperado é um erro que começa com `TESTES OK`.

### Regras de segurança

- O app **nunca escreve direto nas tabelas**: só lê (via RLS) e altera por funções `rpc_*`.
- Todo `INSERT`/`UPDATE` em `agendamentos` gera um evento em `agendamento_eventos` na mesma transação, com quem fez a alteração, quando, o valor anterior, o novo valor e o motivo.
- `agendamento_eventos` bloqueia `UPDATE` e `DELETE` por trigger.
- **Reagendar** marca o registro atual como `reagendado` e cria um novo, ligado pelos campos `reagendado_de_id` e `reagendado_para_id`.
- **Edição simultânea:** cada alteração envia a `versao` lida. Se outra pessoa alterou o registro antes, o banco recusa com o erro `PT409` (HTTP 409).

### Primeiro administrador

Todo usuário criado no Supabase Auth nasce com um perfil **inativo**. Para liberar o primeiro administrador, crie o usuário pelo painel do Supabase (Authentication → Add user) e rode no SQL Editor:

```sql
update public.perfis set papel = 'admin', ativo = true where email = 'email-do-admin';
```

### Edge Function `admin-usuarios`

A tela **Usuários** cria contas e gera senhas temporárias pela função `supabase/functions/admin-usuarios`. Ela roda no servidor com a chave secreta, que o Supabase injeta sozinho e que nunca vai para o navegador. Só administradores ativos conseguem usá-la.

**Implantação pelo painel:** Edge Functions → **Deploy a new function** → **Via Editor**:

1. Nome: `admin-usuarios` (exatamente assim).
2. Cole o conteúdo de `supabase/functions/admin-usuarios/index.ts` no lugar do código de exemplo.
3. Deixe **Verify JWT** ligado e clique em **Deploy function**.

**Pela CLI:** `supabase functions deploy admin-usuarios --project-ref <ref>`

## Dados de teste

Use apenas dados fictícios em desenvolvimento e marque o nome do cliente com `(fictício)`. Antes do uso real, rode `supabase/limpar_dados_teste.sql` no SQL Editor: ele remove esses agendamentos e o histórico deles.

## Documentação

- [docs/decisoes-pendentes.md](docs/decisoes-pendentes.md): regras de negócio que ainda dependem de validação da gestão
- [docs/implantacao.md](docs/implantacao.md): publicação no Cloudflare Pages, checklist do Supabase, backup e recuperação
- [docs/homologacao.md](docs/homologacao.md): roteiro de testes com a equipe antes do uso real
