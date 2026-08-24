-- Classificações simples de categorias: apenas nome + ícone.
-- A única classificação padrão é Personagens.
-- Não concede acesso direto de escrita à tabela para anon/authenticated.

create table if not exists public.classificacoes_categorias (
  id text primary key default gen_random_uuid()::text,
  campanha_id text not null references public.campanhas(id) on delete cascade,
  nome text not null,
  icone text not null default '📁',
  padrao boolean not null default false,
  criado_em timestamptz not null default now(),
  constraint classificacoes_categorias_nome_unico unique (campanha_id, nome)
);

alter table public.categorias
  add column if not exists classificacao_id text references public.classificacoes_categorias(id) on delete set null;

create index if not exists idx_classificacoes_categorias_campanha
  on public.classificacoes_categorias(campanha_id);

create index if not exists idx_categorias_classificacao
  on public.categorias(classificacao_id);

alter table public.classificacoes_categorias enable row level security;

revoke all on public.classificacoes_categorias from anon, authenticated;

create or replace function public.garantir_classificacao_personagens(p_campanha_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
begin
  insert into public.classificacoes_categorias (campanha_id, nome, icone, padrao)
  values (p_campanha_id, 'Personagens', '👤', true)
  on conflict (campanha_id, nome) do update
    set padrao = true, icone = '👤'
  returning id into v_id;
  return v_id;
end;
$$;

-- Cria Personagens automaticamente para campanhas novas.
create or replace function public.criar_classificacao_padrao_campanha()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.garantir_classificacao_personagens(new.id::text);
  return new;
end;
$$;

drop trigger if exists trg_classificacao_padrao_campanha on public.campanhas;
create trigger trg_classificacao_padrao_campanha
after insert on public.campanhas
for each row execute function public.criar_classificacao_padrao_campanha();

-- Garante a classificação padrão nas campanhas já existentes.
do $$
declare
  r record;
begin
  for r in select id from public.campanhas loop
    perform public.garantir_classificacao_personagens(r.id::text);
  end loop;
end $$;

-- Categorias antigas que já eram Personagens passam para a classificação padrão.
update public.categorias c
set classificacao_id = cc.id
from public.classificacoes_categorias cc
where cc.campanha_id = c.campanha_id
  and cc.padrao = true
  and lower(coalesce(c.tipo, '')) = 'personagem';

create or replace function public.listar_classificacoes_categorias(p_campanha_id text)
returns table (
  id text,
  nome text,
  icone text,
  padrao boolean
)
language sql
security definer
set search_path = public
as $$
  select c.id, c.nome, c.icone, c.padrao
  from public.classificacoes_categorias c
  where c.campanha_id = p_campanha_id
  order by c.padrao desc, c.nome asc;
$$;

create or replace function public.listar_atribuicoes_classificacoes_categorias(p_campanha_id text)
returns table (
  categoria_id text,
  classificacao_id text
)
language sql
security definer
set search_path = public
as $$
  select c.id, c.classificacao_id
  from public.categorias c
  where c.campanha_id = p_campanha_id;
$$;

create or replace function public.criar_classificacao_categoria(
  p_campanha_id text,
  p_token text,
  p_nome text,
  p_icone text
)
returns public.classificacoes_categorias
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.classificacoes_categorias;
begin
  if not public.token_mestre_valido(p_campanha_id, p_token) then
    raise exception 'Acesso do mestre inválido.' using errcode = '42501';
  end if;

  if nullif(trim(p_nome), '') is null then
    raise exception 'O nome da classificação é obrigatório.' using errcode = '22023';
  end if;

  insert into public.classificacoes_categorias (campanha_id, nome, icone, padrao)
  values (p_campanha_id, trim(p_nome), coalesce(nullif(trim(p_icone), ''), '📁'), false)
  returning * into v_row;

  return v_row;
exception
  when unique_violation then
    raise exception 'Já existe uma classificação com esse nome nesta campanha.' using errcode = '23505';
end;
$$;

create or replace function public.editar_classificacao_categoria(
  p_campanha_id text,
  p_token text,
  p_classificacao_id text,
  p_nome text,
  p_icone text
)
returns public.classificacoes_categorias
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.classificacoes_categorias;
begin
  if not public.token_mestre_valido(p_campanha_id, p_token) then
    raise exception 'Acesso do mestre inválido.' using errcode = '42501';
  end if;

  update public.classificacoes_categorias
  set nome = trim(p_nome),
      icone = coalesce(nullif(trim(p_icone), ''), '📁')
  where id = p_classificacao_id
    and campanha_id = p_campanha_id
    and padrao = false
  returning * into v_row;

  if not found then
    raise exception 'Classificação não encontrada ou protegida.' using errcode = '42501';
  end if;

  return v_row;
end;
$$;

create or replace function public.excluir_classificacao_categoria(
  p_campanha_id text,
  p_token text,
  p_classificacao_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_default text;
begin
  if not public.token_mestre_valido(p_campanha_id, p_token) then
    raise exception 'Acesso do mestre inválido.' using errcode = '42501';
  end if;

  select id into v_default
  from public.classificacoes_categorias
  where campanha_id = p_campanha_id and padrao = true
  limit 1;

  if v_default is null then
    v_default := public.garantir_classificacao_personagens(p_campanha_id);
  end if;

  update public.categorias
  set classificacao_id = v_default
  where campanha_id = p_campanha_id
    and classificacao_id = p_classificacao_id;

  delete from public.classificacoes_categorias
  where id = p_classificacao_id
    and campanha_id = p_campanha_id
    and padrao = false;

  return found;
end;
$$;

create or replace function public.classificar_categoria_por_classificacao(
  p_campanha_id text,
  p_categoria_id text,
  p_token text,
  p_classificacao_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.token_mestre_valido(p_campanha_id, p_token) then
    raise exception 'Acesso do mestre inválido.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.classificacoes_categorias
    where id = p_classificacao_id and campanha_id = p_campanha_id
  ) then
    raise exception 'Classificação inválida para esta campanha.' using errcode = '22023';
  end if;

  update public.categorias
  set classificacao_id = p_classificacao_id
  where id = p_categoria_id and campanha_id = p_campanha_id;

  if not found then
    raise exception 'Categoria não encontrada.' using errcode = '22023';
  end if;

  return true;
end;
$$;

-- Garante que Personagens não possa ser removida nem alterada por essas RPCs.
revoke all on function public.listar_classificacoes_categorias(text) from public;
revoke all on function public.listar_atribuicoes_classificacoes_categorias(text) from public;
revoke all on function public.criar_classificacao_categoria(text,text,text,text) from public;
revoke all on function public.editar_classificacao_categoria(text,text,text,text,text) from public;
revoke all on function public.excluir_classificacao_categoria(text,text,text) from public;
revoke all on function public.classificar_categoria_por_classificacao(text,text,text,text) from public;

grant execute on function public.listar_classificacoes_categorias(text) to anon, authenticated;
grant execute on function public.listar_atribuicoes_classificacoes_categorias(text) to anon, authenticated;
grant execute on function public.criar_classificacao_categoria(text,text,text,text) to anon, authenticated;
grant execute on function public.editar_classificacao_categoria(text,text,text,text,text) to anon, authenticated;
grant execute on function public.excluir_classificacao_categoria(text,text,text) to anon, authenticated;
grant execute on function public.classificar_categoria_por_classificacao(text,text,text,text) to anon, authenticated;
