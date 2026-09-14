-- Contas individuais e papeis por campanha.
-- Execute antes de scripts/bootstrap-fixed-users.mjs.

begin;

create schema if not exists extensions;
create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

-- Alguns projetos antigos receberam as funções de autenticação sem manter as
-- migrations que criavam estas tabelas. A migration precisa funcionar também
-- nesses bancos.
create table if not exists public.sessoes_mestre (
  token text primary key default extensions.gen_random_uuid()::text,
  campanha_id text not null references public.campanhas(id) on delete cascade,
  usuario_id uuid references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default (now() + interval '8 hours')
);

create table if not exists private.sessoes_editor (
  token_hash text primary key,
  campanha_id text not null references public.campanhas(id) on delete cascade,
  usuario_id uuid references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null
);

alter table private.sessoes_editor enable row level security;
revoke all on table private.sessoes_editor from public, anon, authenticated;

create table if not exists public.perfis_usuario (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  apelido text not null unique,
  nome_exibicao text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint perfis_usuario_apelido_check check (apelido ~ '^[a-z0-9_-]{2,32}$'),
  constraint perfis_usuario_nome_check check (char_length(trim(nome_exibicao)) between 2 and 80)
);

create table if not exists public.membros_campanha (
  campanha_id text not null references public.campanhas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  papel text not null check (papel in ('master', 'editor')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (campanha_id, usuario_id)
);

create index if not exists membros_campanha_usuario_idx
  on public.membros_campanha (usuario_id, ativo, campanha_id);

alter table public.perfis_usuario enable row level security;
alter table public.membros_campanha enable row level security;
revoke all on table public.perfis_usuario from public, anon, authenticated;
revoke all on table public.membros_campanha from public, anon, authenticated;
grant select on table public.perfis_usuario to authenticated;
grant select on table public.membros_campanha to authenticated;

drop policy if exists "usuario le o proprio perfil" on public.perfis_usuario;
create policy "usuario le o proprio perfil" on public.perfis_usuario
  for select to authenticated
  using (usuario_id = (select auth.uid()));

drop policy if exists "usuario le os proprios acessos" on public.membros_campanha;
create policy "usuario le os proprios acessos" on public.membros_campanha
  for select to authenticated
  using (usuario_id = (select auth.uid()));

create or replace function private.usuario_tem_papel_campanha(
  p_campanha_id text,
  p_papeis text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membros_campanha as membro
    join public.perfis_usuario as perfil on perfil.usuario_id = membro.usuario_id
    where membro.campanha_id = p_campanha_id
      and membro.usuario_id = (select auth.uid())
      and membro.ativo
      and perfil.ativo
      and membro.papel = any (p_papeis)
  );
$$;

revoke all on function private.usuario_tem_papel_campanha(text, text[]) from public;

-- As sessoes curtas preservam compatibilidade com as RPCs existentes.
alter table public.sessoes_mestre
  add column if not exists usuario_id uuid references auth.users(id) on delete cascade;
alter table public.sessoes_mestre add column if not exists expira_em timestamptz;
update public.sessoes_mestre set expira_em = now() + interval '8 hours' where expira_em is null;
alter table public.sessoes_mestre alter column expira_em set default (now() + interval '8 hours');
alter table public.sessoes_mestre alter column expira_em set not null;
alter table public.sessoes_mestre enable row level security;
revoke all on table public.sessoes_mestre from public, anon, authenticated;
create index if not exists sessoes_mestre_usuario_idx
  on public.sessoes_mestre (usuario_id, campanha_id, expira_em desc);

alter table private.sessoes_editor
  add column if not exists usuario_id uuid references auth.users(id) on delete cascade;
create index if not exists sessoes_editor_usuario_idx
  on private.sessoes_editor (usuario_id, campanha_id, expira_em desc);

create or replace function private.sessao_mestre_valida(p_campanha_id text, p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_campanha_id is not null
    and p_token is not null
    and trim(p_token) <> ''
    and exists (
      select 1 from public.sessoes_mestre as sessao
      where sessao.campanha_id = p_campanha_id
        and sessao.token::text = p_token
        and sessao.expira_em > now()
    );
$$;

revoke all on function private.sessao_mestre_valida(text, text) from public;

create or replace function public.token_mestre_valido(p_campanha_id text, p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.sessao_mestre_valida(p_campanha_id, p_token); $$;

revoke all on function public.token_mestre_valido(text, text) from public;
grant execute on function public.token_mestre_valido(text, text) to anon, authenticated, service_role;

create or replace function private.sessao_editor_valida(p_campanha_id text, p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_campanha_id is not null
    and p_token is not null
    and trim(p_token) <> ''
    and exists (
      select 1 from private.sessoes_editor as sessao
      where sessao.campanha_id = p_campanha_id
        and sessao.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
        and sessao.expira_em > now()
    );
$$;

revoke all on function private.sessao_editor_valida(text, text) from public;

create or replace function public.meu_perfil_conta()
returns table (usuario_id uuid, apelido text, nome_exibicao text, ativo boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select perfil.usuario_id, perfil.apelido, perfil.nome_exibicao, perfil.ativo
  from public.perfis_usuario as perfil
  where perfil.usuario_id = (select auth.uid());
$$;

revoke all on function public.meu_perfil_conta() from public;
grant execute on function public.meu_perfil_conta() to authenticated;

create or replace function public.atualizar_meu_perfil_conta(p_nome_exibicao text)
returns public.perfis_usuario
language plpgsql
security definer
set search_path = ''
as $$
declare v_perfil public.perfis_usuario%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_nome_exibicao, ''))) not between 2 and 80 then
    raise exception 'O nome precisa ter entre 2 e 80 caracteres.' using errcode = '22023';
  end if;
  update public.perfis_usuario as perfil
     set nome_exibicao = trim(p_nome_exibicao), atualizado_em = now()
   where perfil.usuario_id = (select auth.uid()) and perfil.ativo
  returning perfil.* into v_perfil;
  if v_perfil.usuario_id is null then
    raise exception 'Conta não autorizada.' using errcode = '42501';
  end if;
  return v_perfil;
end;
$$;

revoke all on function public.atualizar_meu_perfil_conta(text) from public;
grant execute on function public.atualizar_meu_perfil_conta(text) to authenticated;

create or replace function public.meu_acesso_campanha(p_campanha_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select membro.papel
  from public.membros_campanha as membro
  join public.perfis_usuario as perfil on perfil.usuario_id = membro.usuario_id
  where membro.campanha_id = p_campanha_id
    and membro.usuario_id = (select auth.uid())
    and membro.ativo and perfil.ativo
  limit 1;
$$;

revoke all on function public.meu_acesso_campanha(text) from public;
grant execute on function public.meu_acesso_campanha(text) to authenticated;

create or replace function public.minhas_campanhas_conta()
returns table (campanha_id text, nome text, descricao text, imagem_url text, papel text)
language sql
stable
security definer
set search_path = ''
as $$
  select campanha.id, campanha.nome, campanha.descricao, campanha.imagem_url, membro.papel
  from public.membros_campanha as membro
  join public.perfis_usuario as perfil on perfil.usuario_id = membro.usuario_id
  join public.campanhas as campanha on campanha.id = membro.campanha_id
  where membro.usuario_id = (select auth.uid())
    and membro.ativo and perfil.ativo
  order by campanha.nome;
$$;

revoke all on function public.minhas_campanhas_conta() from public;
grant execute on function public.minhas_campanhas_conta() to authenticated;

create or replace function public.criar_campanha_conta(
  p_nome text,
  p_descricao text,
  p_imagem_url text
)
returns table (
  id text,
  nome text,
  descricao text,
  imagem_url text,
  criado_em timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_id text;
  v_nome text;
  v_descricao text;
  v_imagem_url text;
  v_criado_em timestamptz;
  v_senha_interna text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if v_usuario_id is null or not exists (
    select 1 from public.perfis_usuario
    where usuario_id = v_usuario_id and ativo
  ) then
    raise exception 'Somente uma conta autorizada pode criar campanhas.' using errcode = '42501';
  end if;

  select nova.id, nova.nome, nova.descricao, nova.imagem_url, nova.criado_em
    into v_id, v_nome, v_descricao, v_imagem_url, v_criado_em
  from public.criar_campanha(
    p_nome,
    p_descricao,
    p_imagem_url,
    v_senha_interna
  ) as nova;

  update public.campanhas
     set senha_editor_hash = extensions.crypt(
       encode(extensions.gen_random_bytes(32), 'hex'),
       extensions.gen_salt('bf', 12)
     )
   where public.campanhas.id = v_id;

  insert into public.membros_campanha (campanha_id, usuario_id, papel, ativo)
  values (v_id, v_usuario_id, 'master', true);

  return query select v_id, v_nome, v_descricao, v_imagem_url, v_criado_em;
end;
$$;

revoke all on function public.criar_campanha_conta(text, text, text) from public;
grant execute on function public.criar_campanha_conta(text, text, text) to authenticated;

create or replace function public.abrir_sessao_conta(p_campanha_id text)
returns table (papel text, token text, expira_em timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_papel text;
  v_token text := extensions.gen_random_uuid()::text;
  v_expira_em timestamptz := now() + interval '8 hours';
  v_token_mestre_uuid boolean;
begin
  if v_usuario_id is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  select membro.papel into v_papel
  from public.membros_campanha as membro
  join public.perfis_usuario as perfil on perfil.usuario_id = membro.usuario_id
  where membro.campanha_id = p_campanha_id
    and membro.usuario_id = v_usuario_id
    and membro.ativo and perfil.ativo;
  if v_papel is null then
    raise exception 'Sua conta não possui acesso a esta campanha.' using errcode = '42501';
  end if;

  delete from public.sessoes_mestre
  where expira_em <= now() or (campanha_id = p_campanha_id and usuario_id = v_usuario_id);
  delete from private.sessoes_editor
  where expira_em <= now() or (campanha_id = p_campanha_id and usuario_id = v_usuario_id);

  if v_papel = 'master' then
    select coluna.udt_name = 'uuid' into v_token_mestre_uuid
    from information_schema.columns as coluna
    where coluna.table_schema = 'public'
      and coluna.table_name = 'sessoes_mestre'
      and coluna.column_name = 'token';

    if coalesce(v_token_mestre_uuid, false) then
      insert into public.sessoes_mestre (token, campanha_id, usuario_id, expira_em)
      values (v_token::uuid, p_campanha_id, v_usuario_id, v_expira_em);
    else
      insert into public.sessoes_mestre (token, campanha_id, usuario_id, expira_em)
      values (v_token, p_campanha_id, v_usuario_id, v_expira_em);
    end if;
  else
    insert into private.sessoes_editor (token_hash, campanha_id, usuario_id, expira_em)
    values (encode(extensions.digest(v_token, 'sha256'), 'hex'), p_campanha_id, v_usuario_id, v_expira_em);
  end if;
  return query select v_papel, v_token, v_expira_em;
end;
$$;

revoke all on function public.abrir_sessao_conta(text) from public;
grant execute on function public.abrir_sessao_conta(text) to authenticated;

create or replace function public.revogar_minhas_sessoes_conta(p_campanha_id text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_usuario_id uuid := (select auth.uid());
begin
  if v_usuario_id is null then return false; end if;
  delete from public.sessoes_mestre
  where usuario_id = v_usuario_id and (p_campanha_id is null or campanha_id = p_campanha_id);
  delete from private.sessoes_editor
  where usuario_id = v_usuario_id and (p_campanha_id is null or campanha_id = p_campanha_id);
  return true;
end;
$$;

revoke all on function public.revogar_minhas_sessoes_conta(text) from public;
grant execute on function public.revogar_minhas_sessoes_conta(text) to authenticated;

create or replace function public.listar_acessos_campanha(p_campanha_id text)
returns table (usuario_id uuid, apelido text, nome_exibicao text, papel text, acesso_ativo boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.usuario_tem_papel_campanha(p_campanha_id, array['master']) then
    raise exception 'Acesso exclusivo do mestre.' using errcode = '42501';
  end if;
  return query
  select perfil.usuario_id, perfil.apelido, perfil.nome_exibicao,
         membro.papel, coalesce(membro.ativo, false)
  from public.perfis_usuario as perfil
  left join public.membros_campanha as membro
    on membro.usuario_id = perfil.usuario_id and membro.campanha_id = p_campanha_id
  where perfil.ativo
  order by perfil.nome_exibicao;
end;
$$;

revoke all on function public.listar_acessos_campanha(text) from public;
grant execute on function public.listar_acessos_campanha(text) to authenticated;

create or replace function public.definir_acesso_campanha(
  p_campanha_id text,
  p_usuario_id uuid,
  p_papel text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_papel_atual text;
  v_mestres_ativos integer;
begin
  if not private.usuario_tem_papel_campanha(p_campanha_id, array['master']) then
    raise exception 'Acesso exclusivo do mestre.' using errcode = '42501';
  end if;
  if p_papel is not null and p_papel not in ('master', 'editor') then
    raise exception 'Papel inválido.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.perfis_usuario
    where usuario_id = p_usuario_id and ativo
  ) then
    raise exception 'Usuário não autorizado.' using errcode = '22023';
  end if;

  select membro.papel into v_papel_atual
  from public.membros_campanha as membro
  where membro.campanha_id = p_campanha_id
    and membro.usuario_id = p_usuario_id and membro.ativo;

  if v_papel_atual = 'master' and p_papel is distinct from 'master' then
    select count(*) into v_mestres_ativos
    from public.membros_campanha as membro
    join public.perfis_usuario as perfil on perfil.usuario_id = membro.usuario_id
    where membro.campanha_id = p_campanha_id
      and membro.papel = 'master' and membro.ativo and perfil.ativo;
    if v_mestres_ativos <= 1 then
      raise exception 'A campanha precisa manter pelo menos um mestre.' using errcode = '23514';
    end if;
  end if;

  if p_papel is null then
    delete from public.membros_campanha
    where campanha_id = p_campanha_id and usuario_id = p_usuario_id;
  else
    insert into public.membros_campanha as membro
      (campanha_id, usuario_id, papel, ativo, atualizado_em)
    values (p_campanha_id, p_usuario_id, p_papel, true, now())
    on conflict (campanha_id, usuario_id) do update
      set papel = excluded.papel, ativo = true, atualizado_em = now();
  end if;

  delete from public.sessoes_mestre
  where campanha_id = p_campanha_id and usuario_id = p_usuario_id;
  delete from private.sessoes_editor
  where campanha_id = p_campanha_id and usuario_id = p_usuario_id;
  return true;
end;
$$;

revoke all on function public.definir_acesso_campanha(text, uuid, text) from public;
grant execute on function public.definir_acesso_campanha(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;
