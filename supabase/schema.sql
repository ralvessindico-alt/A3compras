-- ════════════════════════════════════════════════════════════════════════════
-- A3 COMPRAS — SCHEMA COMPLETO
-- Cole este arquivo inteiro no Supabase SQL Editor e clique em "Run".
-- Execução é idempotente onde possível (DROP IF EXISTS / CREATE OR REPLACE).
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── PROFILES (usuários do sistema, ligados ao Supabase Auth) ──────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  role text not null default 'comprador' check (role in ('admin','comprador','sindico')),
  cargo text,
  telefone text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Pré-autorização: admin cadastra e-mail+perfil ANTES da pessoa criar a conta.
create table if not exists convites_usuario (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null default 'comprador' check (role in ('admin','comprador','sindico')),
  cargo text,
  usado boolean not null default false,
  criado_em timestamptz not null default now()
);

-- Trigger: ao criar conta no Supabase Auth, gera o profile automaticamente.
-- Primeiro usuário do sistema = admin automaticamente.
create or replace function handle_new_user()
returns trigger as $$
declare
  v_convite convites_usuario;
  v_total int;
begin
  select * into v_convite from convites_usuario where email = new.email and usado = false limit 1;
  select count(*) into v_total from profiles;

  if v_convite.id is not null then
    insert into profiles (id, nome, email, role, cargo)
    values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)), new.email, v_convite.role, v_convite.cargo);
    update convites_usuario set usado = true where id = v_convite.id;
  elsif v_total = 0 then
    insert into profiles (id, nome, email, role)
    values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)), new.email, 'admin');
  else
    insert into profiles (id, nome, email, role)
    values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)), new.email, 'comprador');
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── CLIENTES ────────────────────────────────────────────────────────────────
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  tipo_pessoa text default 'PJ',
  razao_social text not null,
  nome_fantasia text,
  cnpj text, cpf text, ie text,
  email text, email2 text, telefone text, celular text, whatsapp text, site text,
  contato_nome text, contato_cargo text,
  cep text, logradouro text, numero text, complemento text, bairro text, cidade text, estado text,
  categoria text, cond_pagamento text, obs text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ── FORNECEDORES ────────────────────────────────────────────────────────────
create table if not exists fornecedores (
  id uuid primary key default gen_random_uuid(),
  tipo_pessoa text default 'PJ',
  razao_social text not null,
  nome_fantasia text,
  cnpj text, cpf text, ie text, im text,
  is_mei boolean default false,
  email text, email2 text, telefone text, celular text, whatsapp text, site text,
  contato_nome text, contato_cargo text,
  cep text, logradouro text, numero text, complemento text, bairro text, cidade text, estado text,
  categoria text, segmentos text[] default '{}', produtos_servicos text,
  cond_pagamento text, limite_credito numeric, prazo_entrega_dias int,
  banco text, agencia text, conta text, tipo_conta text, pix text,
  obs text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ── PLANO DE CONTAS (hierárquico, 3 níveis) ────────────────────────────────
create table if not exists plano_contas (
  id uuid primary key default gen_random_uuid(),
  codigo text,
  descricao text not null,
  nivel int not null check (nivel in (1,2,3)),
  parent_id uuid references plano_contas(id) on delete cascade
);

-- ── CONTADOR DE PEDIDOS (numeração sequencial sem colisão) ─────────────────
create table if not exists contadores_pedido (
  ano int primary key,
  ultimo int not null default 0
);

create or replace function proximo_numero_pedido()
returns text as $$
declare
  v_ano int := extract(year from now());
  v_num int;
begin
  insert into contadores_pedido (ano, ultimo) values (v_ano, 1)
    on conflict (ano) do update set ultimo = contadores_pedido.ultimo + 1
    returning ultimo into v_num;
  return 'PC' || lpad(v_num::text, 3, '0') || '_' || v_ano;
end;
$$ language plpgsql security definer;

-- ── COTAÇÕES ────────────────────────────────────────────────────────────────
create table if not exists cotacoes (
  id uuid primary key default gen_random_uuid(),
  numero_pedido text unique not null default proximo_numero_pedido(),
  titulo text not null,
  descricao_aquisicao text,
  justificativa text,
  centros_custo text default 'Ordinária' check (centros_custo in ('Ordinária','Extraordinária')),
  plano_contas uuid references plano_contas(id),
  classificacao text,
  urgente boolean default false,
  necessario boolean default true,
  status text not null default 'aberta' check (status in ('aberta','cotando','fechada','aprovada','rejeitada')),
  responsavel text,
  aprovador text,
  cliente_id uuid references clientes(id),
  criado_por uuid references profiles(id),
  data_criacao date default current_date,
  data_aprovacao timestamptz,
  -- Denormalizado de propósito: itens/propostas/condições só fazem sentido
  -- lidos junto com a cotação inteira, não precisam ser tabela própria.
  itens jsonb not null default '[]',
  fornecedores jsonb not null default '[]',
  propostas jsonb not null default '[]',
  condicoes_fornecedor jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;

drop trigger if exists trg_cotacoes_updated on cotacoes;
create trigger trg_cotacoes_updated before update on cotacoes
  for each row execute function set_updated_at();

-- RPC: aprovar/rejeitar cotação — só síndico/admin, só altera status + data.
create or replace function aprovar_cotacao(p_id uuid, p_status text)
returns void as $$
declare v_role text;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role not in ('admin','sindico') then
    raise exception 'Sem permissão para aprovar/rejeitar cotações';
  end if;
  if p_status not in ('aprovada','rejeitada') then
    raise exception 'Status inválido';
  end if;
  update cotacoes set status = p_status, data_aprovacao = now() where id = p_id;
end;
$$ language plpgsql security definer;

-- ── CONVITES DE FORNECEDOR (auto-cadastro) ─────────────────────────────────
create table if not exists convites_fornecedor (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  label text,
  status text not null default 'active' check (status in ('active','used','revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists pendentes_fornecedor (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null references convites_fornecedor(code),
  dados jsonb not null,
  submitted_at timestamptz not null default now()
);

-- RPC pública (sem login) para o fornecedor validar o código.
create or replace function validar_convite_fornecedor(p_code text)
returns jsonb as $$
declare v_inv convites_fornecedor;
begin
  select * into v_inv from convites_fornecedor where code = p_code;
  if v_inv.id is null then return jsonb_build_object('ok', false, 'erro', 'Código inválido'); end if;
  if v_inv.status != 'active' then return jsonb_build_object('ok', false, 'erro', 'Código já utilizado ou revogado'); end if;
  if v_inv.expires_at < now() then return jsonb_build_object('ok', false, 'erro', 'Código expirado'); end if;
  return jsonb_build_object('ok', true);
end;
$$ language plpgsql security definer;

-- RPC pública (sem login) para o fornecedor enviar o cadastro.
create or replace function enviar_cadastro_fornecedor(p_code text, p_dados jsonb)
returns jsonb as $$
declare v_check jsonb;
begin
  v_check := validar_convite_fornecedor(p_code);
  if not (v_check->>'ok')::boolean then return v_check; end if;
  insert into pendentes_fornecedor (invite_code, dados) values (p_code, p_dados);
  update convites_fornecedor set status = 'used', used_at = now() where code = p_code;
  return jsonb_build_object('ok', true);
end;
$$ language plpgsql security definer;

-- ════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════════════
alter table profiles enable row level security;
alter table convites_usuario enable row level security;
alter table clientes enable row level security;
alter table fornecedores enable row level security;
alter table plano_contas enable row level security;
alter table cotacoes enable row level security;
alter table convites_fornecedor enable row level security;
alter table pendentes_fornecedor enable row level security;

-- Helper: role do usuário logado
create or replace function meu_role() returns text as $$
  select role from profiles where id = auth.uid();
$$ language sql security definer stable;

-- PROFILES
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated using (true);
drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles for update to authenticated
  using (auth.uid() = id or meu_role() = 'admin');
drop policy if exists profiles_delete_admin on profiles;
create policy profiles_delete_admin on profiles for delete to authenticated using (meu_role() = 'admin');

-- CONVITES_USUARIO (admin only)
drop policy if exists convites_usuario_all on convites_usuario;
create policy convites_usuario_all on convites_usuario for all to authenticated
  using (meu_role() = 'admin') with check (meu_role() = 'admin');

-- CLIENTES
drop policy if exists clientes_select on clientes;
create policy clientes_select on clientes for select to authenticated using (true);
drop policy if exists clientes_write on clientes;
create policy clientes_write on clientes for all to authenticated
  using (meu_role() in ('admin','comprador')) with check (meu_role() in ('admin','comprador'));

-- FORNECEDORES
drop policy if exists fornecedores_select on fornecedores;
create policy fornecedores_select on fornecedores for select to authenticated using (true);
drop policy if exists fornecedores_write on fornecedores;
create policy fornecedores_write on fornecedores for all to authenticated
  using (meu_role() in ('admin','comprador')) with check (meu_role() in ('admin','comprador'));

-- PLANO_CONTAS
drop policy if exists plano_select on plano_contas;
create policy plano_select on plano_contas for select to authenticated using (true);
drop policy if exists plano_write on plano_contas;
create policy plano_write on plano_contas for all to authenticated
  using (meu_role() = 'admin') with check (meu_role() = 'admin');

-- COTAÇÕES — todos veem tudo; admin/comprador editam livremente;
-- síndico só altera status via RPC aprovar_cotacao (não via UPDATE direto).
drop policy if exists cotacoes_select on cotacoes;
create policy cotacoes_select on cotacoes for select to authenticated using (true);
drop policy if exists cotacoes_write on cotacoes;
create policy cotacoes_write on cotacoes for all to authenticated
  using (meu_role() in ('admin','comprador')) with check (meu_role() in ('admin','comprador'));

-- CONVITES_FORNECEDOR / PENDENTES — gerenciados por admin/comprador.
-- Acesso público (fornecedor) é feito só via RPC security definer acima.
drop policy if exists convites_forn_write on convites_fornecedor;
create policy convites_forn_write on convites_fornecedor for all to authenticated
  using (meu_role() in ('admin','comprador')) with check (meu_role() in ('admin','comprador'));
drop policy if exists pendentes_forn_write on pendentes_fornecedor;
create policy pendentes_forn_write on pendentes_fornecedor for all to authenticated
  using (meu_role() in ('admin','comprador')) with check (meu_role() in ('admin','comprador'));

-- ════════════════════════════════════════════════════════════════════════════
-- FIM DO SCHEMA
-- ════════════════════════════════════════════════════════════════════════════

-- Garante que o Portal do Fornecedor (sem login) consiga chamar essas duas
-- funções. O Supabase normalmente já concede isso por padrão, mas explicitamos
-- para evitar erro de permissão "permission denied for function".
grant execute on function validar_convite_fornecedor(text) to anon, authenticated;
grant execute on function enviar_cadastro_fornecedor(text, jsonb) to anon, authenticated;
