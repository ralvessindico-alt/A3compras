# A3 Compras — Gestão de Cotações

Sistema de cotação e comparação de fornecedores para condomínios.
Stack: React + Vite + Supabase (PostgreSQL + Auth + RLS) + Vercel.

---

## 1. Criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) → **New Project**
2. Nome: `a3compras` (ou outro de sua preferência)
3. Defina uma senha de banco forte e guarde — não precisa para o app, mas é bom ter
4. Região: escolha `South America (São Paulo)` para menor latência
5. Aguarde o projeto provisionar (~2 minutos)

## 2. Rodar o schema SQL

1. No painel do Supabase, vá em **SQL Editor** (ícone de terminal na barra lateral)
2. Clique em **New Query**
3. Abra o arquivo `supabase/schema.sql` deste projeto, copie **todo o conteúdo**
4. Cole no editor e clique em **Run**
5. Confirme que apareceu "Success. No rows returned" sem erros

## 3. Desativar confirmação de e-mail (recomendado para uso interno)

Como é uma ferramenta interna da equipe, recomendamos desativar a exigência de
confirmar e-mail para simplificar o primeiro acesso:

1. **Authentication** → **Providers** → **Email**
2. Desmarque **"Confirm email"**
3. Salve

*(Se preferir manter a confirmação por segurança, tudo bem — só vai precisar
confirmar o e-mail de cada novo usuário antes do primeiro login.)*

## 4. Pegar as credenciais do projeto

1. **Project Settings** (ícone de engrenagem) → **API**
2. Copie:
   - **Project URL** → vai em `VITE_SUPABASE_URL`
   - **anon public** key → vai em `VITE_SUPABASE_ANON_KEY`

## 5. Configurar o projeto localmente

```bash
# Dentro da pasta do projeto
cp .env.example .env
```

Edite o `.env` e cole as credenciais copiadas no passo 4.

```bash
npm install
npm run dev
```

Abra `http://localhost:5173` — a tela de login deve aparecer.

## 6. Criar o primeiro usuário (Admin automático)

1. Clique em **Criar Conta**
2. Preencha nome, e-mail e senha
3. O **primeiro usuário criado no sistema se torna Administrador automaticamente**
   (regra aplicada no banco, não no front-end — não dá para burlar)

A partir daqui, esse Admin pode convidar os próximos usuários pela aba **Usuários**
do sistema (define o e-mail e o perfil antes da pessoa criar a conta).

## 7. Testar localmente

Cadastre fornecedores, clientes, crie uma cotação, gere um convite de fornecedor,
teste o Portal do Fornecedor. Confirme que tudo persiste corretamente recarregando
a página (F5) — isso confirma que está realmente salvando no Supabase, não em
memória local.

## 8. Subir para o GitHub (via GitHub Desktop)

1. Abra o **GitHub Desktop**
2. **File → Add Local Repository** → selecione a pasta deste projeto
3. Se pedir para inicializar um repositório Git, confirme
4. Escreva uma mensagem de commit (ex: "Versão inicial A3 Compras") e clique em
   **Commit to main**
5. Clique em **Publish repository**
   - Nome: `A3compras`
   - Desmarque "Keep this code private" se quiser público, ou deixe marcado
6. Clique em **Publish Repository**

> **Importante:** o arquivo `.env` está no `.gitignore` e não será enviado ao
> GitHub — suas credenciais do Supabase ficam seguras. O Vercel vai pedir essas
> mesmas credenciais separadamente no passo 9.

## 9. Deploy no Vercel

1. Acesse [vercel.com](https://vercel.com) → **Add New → Project**
2. Conecte sua conta do GitHub se ainda não estiver conectada
3. Selecione o repositório `A3compras`
4. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL` → cole o Project URL do Supabase
   - `VITE_SUPABASE_ANON_KEY` → cole a anon key do Supabase
5. Clique em **Deploy**
6. Aguarde ~1 minuto — o Vercel te dará uma URL pública (ex: `a3compras.vercel.app`)

A partir desse ponto, toda vez que você der **push** de uma alteração pelo
GitHub Desktop, o Vercel faz o redeploy automaticamente.

## 10. Convidar a equipe

Compartilhe a URL do Vercel com a equipe. Cada pessoa:
- Se já foi convidada pelo Admin (aba **Usuários**): cria a conta com o mesmo
  e-mail do convite e já entra com o perfil correto
- Se não foi convidada: pode criar conta, mas entra como Comprador por padrão
  até o Admin ajustar o perfil

---

## Estrutura do projeto

```
A3compras/
├── supabase/
│   └── schema.sql          ← cole no SQL Editor do Supabase
├── src/
│   ├── lib/
│   │   ├── supabase.js     ← cliente Supabase
│   │   └── api.js          ← todas as chamadas ao banco (CRUD)
│   ├── App.jsx             ← aplicação completa (single-file, como nos outros projetos A3)
│   └── main.jsx            ← ponto de entrada React
├── .env.example
├── package.json
└── vite.config.js
```

## Decisões de arquitetura (para referência futura)

- **Itens, propostas e condições comerciais da cotação ficam em colunas JSONB**
  dentro da própria linha de `cotacoes` — são sempre lidos/escritos como uma
  unidade só, não precisam ser tabelas relacionais separadas.
- **`cotacoes.fornecedores` guarda um snapshot completo dos fornecedores**
  vinculados (não apenas IDs) — preserva o histórico real da cotação mesmo que
  o cadastro do fornecedor seja editado depois.
- **Numeração de pedido (`PC001_2026`) é gerada pelo banco**, via função SQL
  `proximo_numero_pedido()` — elimina colisão entre compradores diferentes
  criando cotações ao mesmo tempo em dispositivos diferentes.
- **Aprovação/rejeição de cotação pelo Síndico passa por uma RPC restrita**
  (`aprovar_cotacao`), não por UPDATE direto — garante que o síndico só pode
  alterar o status, nunca os outros campos da cotação.
- **Primeiro usuário cadastrado vira Admin automaticamente** via trigger no
  banco — não existe tela de "setup" no front-end para isso.

## Próximos passos sugeridos

- [ ] Configurar PWA (manifest.json + service worker) para instalar no celular
- [ ] Configurar domínio próprio no Vercel (em vez de `.vercel.app`)
- [ ] Avaliar Supabase Storage para anexar fotos de orçamentos recebidos
- [ ] Relatório de gastos por cliente/condomínio e por período
