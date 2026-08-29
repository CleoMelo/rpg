-- Timeline no Supabase para o projeto CleoMelo/rpg
-- Execute no Supabase Dashboard > SQL Editor.
-- Pode ser executado novamente: usa IF NOT EXISTS / CREATE OR REPLACE.
--
-- public.campanhas.id é TEXT neste projeto.
-- A timeline reutiliza public.token_mestre_valido(text, text).

begin;

create table if not exists public.timeline_data (
  campanha_id text primary key references public.campanhas(id) on delete cascade,
  data jsonb not null,
  versao bigint not null default 1,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.timeline_history (
  id bigint generated always as identity primary key,
  campanha_id text not null references public.campanhas(id) on delete cascade,
  data jsonb not null,
  versao bigint not null,
  mensagem text not null default 'Backup da timeline',
  criado_em timestamptz not null default now()
);

create index if not exists timeline_history_campanha_criado_idx
  on public.timeline_history (campanha_id, criado_em desc, id desc);

alter table public.timeline_data enable row level security;
alter table public.timeline_history enable row level security;

revoke all on table public.timeline_data from anon, authenticated;
revoke all on table public.timeline_history from anon, authenticated;

create or replace function public.carregar_timeline(
  p_campanha_id text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select t.data
  from public.timeline_data t
  where t.campanha_id = p_campanha_id;
$$;

revoke all on function public.carregar_timeline(text) from public;
grant execute on function public.carregar_timeline(text) to anon, authenticated;

create or replace function public.salvar_timeline(
  p_campanha_id text,
  p_token text,
  p_data jsonb,
  p_mensagem text default 'Edição pela timeline'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_data_atual jsonb;
  v_versao_atual bigint;
  v_nova_versao bigint;
begin
  if not public.token_mestre_valido(p_campanha_id, p_token) then
    raise exception 'Sessão de mestre inválida para esta campanha.' using errcode = '42501';
  end if;

  if p_data is null
     or jsonb_typeof(p_data) <> 'object'
     or jsonb_typeof(p_data -> 'resources') <> 'array' then
    raise exception 'A timeline enviada não possui a estrutura JSON esperada.' using errcode = '22023';
  end if;

  select t.data, t.versao
    into v_data_atual, v_versao_atual
  from public.timeline_data t
  where t.campanha_id = p_campanha_id
  for update;

  if found then
    insert into public.timeline_history (campanha_id, data, versao, mensagem, criado_em)
    values (
      p_campanha_id,
      v_data_atual,
      v_versao_atual,
      coalesce(nullif(trim(p_mensagem), ''), 'Backup automático antes de salvar'),
      now()
    );

    v_nova_versao := v_versao_atual + 1;

    update public.timeline_data
       set data = p_data,
           versao = v_nova_versao,
           atualizado_em = now()
     where campanha_id = p_campanha_id;
  else
    v_nova_versao := 1;

    insert into public.timeline_data (campanha_id, data, versao, atualizado_em)
    values (p_campanha_id, p_data, v_nova_versao, now());
  end if;

  delete from public.timeline_history h
  where h.campanha_id = p_campanha_id
    and h.id in (
      select old.id
      from public.timeline_history old
      where old.campanha_id = p_campanha_id
      order by old.criado_em desc, old.id desc
      offset 100
    );

  return v_nova_versao;
end;
$$;

revoke all on function public.salvar_timeline(text, text, jsonb, text) from public;
grant execute on function public.salvar_timeline(text, text, jsonb, text) to anon, authenticated;

create or replace function public.listar_backups_timeline(
  p_campanha_id text,
  p_token text
)
returns table (
  backup_id bigint,
  data_hora timestamptz,
  mensagem text,
  versao bigint,
  atual boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.token_mestre_valido(p_campanha_id, p_token) then
    raise exception 'Sessão de mestre inválida para esta campanha.' using errcode = '42501';
  end if;

  return query
  select
    null::bigint as backup_id,
    t.atualizado_em as data_hora,
    'Versão atual'::text as mensagem,
    t.versao,
    true as atual
  from public.timeline_data t
  where t.campanha_id = p_campanha_id

  union all

  select
    h.id as backup_id,
    h.criado_em as data_hora,
    h.mensagem,
    h.versao,
    false as atual
  from public.timeline_history h
  where h.campanha_id = p_campanha_id
  order by data_hora desc, backup_id desc nulls first
  limit 101;
end;
$$;

revoke all on function public.listar_backups_timeline(text, text) from public;
grant execute on function public.listar_backups_timeline(text, text) to anon, authenticated;

create or replace function public.restaurar_backup_timeline(
  p_campanha_id text,
  p_token text,
  p_backup_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_backup_data jsonb;
  v_backup_versao bigint;
  v_data_atual jsonb;
  v_versao_atual bigint;
begin
  if not public.token_mestre_valido(p_campanha_id, p_token) then
    raise exception 'Sessão de mestre inválida para esta campanha.' using errcode = '42501';
  end if;

  select h.data, h.versao
    into v_backup_data, v_backup_versao
  from public.timeline_history h
  where h.id = p_backup_id
    and h.campanha_id = p_campanha_id;

  if not found then
    return false;
  end if;

  select t.data, t.versao
    into v_data_atual, v_versao_atual
  from public.timeline_data t
  where t.campanha_id = p_campanha_id
  for update;

  if not found then
    return false;
  end if;

  insert into public.timeline_history (campanha_id, data, versao, mensagem, criado_em)
  values (
    p_campanha_id,
    v_data_atual,
    v_versao_atual,
    format('Backup automático antes de restaurar v%s', v_backup_versao),
    now()
  );

  update public.timeline_data
     set data = v_backup_data,
         versao = v_versao_atual + 1,
         atualizado_em = now()
   where campanha_id = p_campanha_id;

  delete from public.timeline_history h
  where h.campanha_id = p_campanha_id
    and h.id in (
      select old.id
      from public.timeline_history old
      where old.campanha_id = p_campanha_id
      order by old.criado_em desc, old.id desc
      offset 100
    );

  return true;
end;
$$;

revoke all on function public.restaurar_backup_timeline(text, text, bigint) from public;
grant execute on function public.restaurar_backup_timeline(text, text, bigint) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
