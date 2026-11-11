# Implantação, backup e recuperação

> **Nada aqui é feito automaticamente.** Publicar em produção, contratar plano pago ou mudar configurações do Supabase depende de autorização explícita.

## 1. Arquitetura em produção

```
Navegador / PWA  ──HTTPS──▶  Cloudflare Worker avanzzi-colchoes (arquivos estáticos: dist/)
       │
       └──HTTPS + WebSocket──▶  Supabase (Postgres + Auth + Realtime + Edge Function)
```

- O site não guarda segredos: só a URL e a chave **publicável** do Supabase vão para o navegador.
- A segurança fica no banco: regras de acesso por linha (RLS), funções `rpc_*` e histórico imutável.

## 2. Antes de publicar: checklist do Supabase

No painel do projeto **Avanzzi Agendamentos**:

1. **SQL Editor:** aplique todas as migrações de `supabase/migrations/`, em ordem.
2. **SQL Editor:** rode `supabase/verificar_seguranca.sql`. Todas as linhas devem vir com `ok`.
3. **SQL Editor:** rode os testes `supabase/testes/regras_agendamento.sql` e `supabase/testes/indicadores.sql`. Os dois devem terminar com o erro proposital `TESTES OK`.
4. **Authentication → Sign In / Providers → Email:**
   - **Desligue “Allow new users to sign up”.** As contas são criadas só pelo administrador, na tela Usuários. Com o cadastro aberto, qualquer pessoa com a chave publicável conseguiria criar uma conta, que ficaria sem acesso, mas ocuparia o cadastro.
   - Senha mínima: 8 caracteres.
5. **Authentication → URL Configuration:** em **Site URL**, informe o endereço de produção (ex.: `https://agendamentos.pages.dev` ou o domínio próprio).
6. **Edge Functions:** confirme que `admin-usuarios` está implantada com a versão atual do repositório.
7. **Dados de teste:** rode `supabase/limpar_dados_teste.sql`. Ele remove os agendamentos com “(fictício)” no nome. Remova também, na tela Usuários, o acesso dos usuários de teste.

## 3. Publicação no Cloudflare (Workers, somente arquivos estáticos)

O site está no Cloudflare como **Worker `avanzzi-colchoes`**, conectado ao repositório `michael-avanzzi/avanzzi-colchoes`. **Cada push na `main` publica sozinho.**

| Configuração (Worker → Settings → Builds) | Valor |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` (lê o `wrangler.jsonc` do repositório) |
| Variables and secrets (de build) | `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (as mesmas do `.env.local`) |

- O `wrangler.jsonc` publica a pasta `dist/` e faz as rotas do app (`/calendario`, `/painel` etc.) abrirem o `index.html`.
- O `public/_headers` aplica os cabeçalhos de segurança (CSP, proteção contra iframe, HSTS). **Se o projeto Supabase mudar, atualize o endereço em `connect-src`.**
- Quem estiver com o app aberto vê o aviso “Nova versão disponível” depois de cada publicação.
- (Opcional) Em **Domains & Routes**, dá para apontar um subdomínio da Avanzzi, por exemplo `agenda.avanzzicolchoes.com.br`.

## 4. Backup

**No plano gratuito do Supabase não há backup automático.** Antes de usar com clientes reais, escolha uma opção:

| Opção | Custo | Como funciona |
|---|---|---|
| **A. Plano Pro (recomendado)** | ~US$ 25/mês por organização, mais o processamento | Backup diário automático, guardado por 7 dias, e restauração pelo painel |
| B. Backup manual semanal | Grátis | Alguém roda o comando abaixo toda semana e guarda o arquivo em local seguro (ex.: Google Drive da empresa) |

Comando do backup manual (Supabase CLI instalada; a senha do banco fica em **Project Settings → Database**):

```bash
supabase db dump --db-url "postgresql://postgres:[SENHA]@db.zfnnppvehwriijhqrsck.supabase.co:5432/postgres" -f backup-estrutura.sql
supabase db dump --db-url "postgresql://postgres:[SENHA]@db.zfnnppvehwriijhqrsck.supabase.co:5432/postgres" --data-only -f backup-dados.sql
```

- Os arquivos contêm dados pessoais de clientes (LGPD): guarde com acesso restrito e **nunca no repositório**.
- O plano gratuito também **pausa o projeto após 7 dias sem uso**. Com a loja usando o app todo dia isso não acontece; se acontecer, basta reativar no painel, sem perda de dados.

## 5. Recuperação

| Situação | O que fazer |
|---|---|
| Site fora do ar ou versão com defeito | Cloudflare → Worker `avanzzi-colchoes` → **Deployments** → versão anterior → **Rollback** |
| Banco com dados apagados ou corrompidos | Plano Pro: **Database → Backups → Restore**. Backup manual: criar um projeto novo, rodar `backup-estrutura.sql` e depois `backup-dados.sql` no SQL Editor, e trocar a URL e a chave nas variáveis do Cloudflare |
| Usuário esqueceu a senha | Tela **Usuários** → ícone de chave → gerar senha temporária |
| Administrador perdeu o acesso | SQL Editor: `update public.perfis set papel = 'admin', ativo = true where email = '...';` |
| Investigar um erro relatado | SQL Editor: `select * from public.erros_app order by ocorrido_em desc limit 50;` (sem dados de clientes) |

## 6. Registro de erros

Erros inesperados do app (tela quebrada, falha não tratada) são gravados em `public.erros_app`, com a mensagem técnica, a tela, o navegador e a versão. Só o administrador consegue ler. Para limpar registros antigos:

```sql
delete from public.erros_app where ocorrido_em < now() - interval '90 days';
```
