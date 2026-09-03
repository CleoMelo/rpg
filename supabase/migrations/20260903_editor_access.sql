-- Acesso de editor por campanha.
-- O editor pode alterar somente personagens que continuam públicos e salvar a timeline.
-- Conteúdo oculto e operações administrativas continuam exclusivos do mestre.

begin;

alter table public.campanhas
  add column if not exists senha_editor_hash text;

create table if not exists private.sessoes_editor (
  token_hash text primary key,
  campanha_id text not null references public.campanhas(id) on delete cascade,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null
);

create index if not exists sessoes_editor_campanha_idx
  on private.sessoes_editor (campanha_id, expira_em desc);

alter table private.sessoes_editor enable row level security;
revoke all on table private.sessoes_editor from public, anon, authenticated;

create or replace function private.sessao_editor_valida(
  p_campanha_id text,
  p_token text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_campanha_id is not null
    and p_token is not null
    and trim(p_token) <> ''
    and exists (
      select 1
      from private.sessoes_editor as sessao
      where sessao.campanha_id = p_campanha_id
        and sessao.token_hash = encode(
          extensions.digest(p_token, 'sha256'),
          'hex'
        )
        and sessao.expira_em > now()
    );
$$;

revoke all on function private.sessao_editor_valida(text, text) from public;

create or replace function public.token_editor_valido(
  p_campanha_id text,
  p_token text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.sessao_editor_valida(p_campanha_id, p_token);
$$;

revoke all on function public.token_editor_valido(text, text) from public;
grant execute on function public.token_editor_valido(text, text) to anon, authenticated, service_role;

create or replace function public.autenticar_editor(
  p_campanha_id text,
  p_senha text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if p_campanha_id is null
     or p_senha is null
     or not exists (
       select 1
       from public.campanhas as campanha
       where campanha.id = p_campanha_id
         and campanha.senha_editor_hash is not null
         and campanha.senha_editor_hash = extensions.crypt(
           p_senha,
           campanha.senha_editor_hash
         )
     )
  then
    return null;
  end if;

  delete from private.sessoes_editor
  where expira_em <= now();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into private.sessoes_editor (
    token_hash,
    campanha_id,
    expira_em
  ) values (
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    p_campanha_id,
    now() + interval '8 hours'
  );

  return v_token;
end;
$$;

revoke all on function public.autenticar_editor(text, text) from public;
grant execute on function public.autenticar_editor(text, text) to anon, authenticated;

create or replace function public.definir_senha_editor(
  p_campanha_id text,
  p_token text,
  p_nova_senha text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.token_mestre_valido(p_campanha_id, p_token) then
    raise exception 'Sessão do mestre inválida ou expirada.' using errcode = '42501';
  end if;

  if p_nova_senha is null
     or char_length(p_nova_senha) < 6
     or octet_length(p_nova_senha) > 72
     or p_nova_senha <> trim(p_nova_senha)
  then
    raise exception 'A senha do editor deve ter entre 6 caracteres e 72 bytes e não pode começar ou terminar com espaços.' using errcode = '22023';
  end if;

  update public.campanhas
     set senha_editor_hash = extensions.crypt(
       p_nova_senha,
       extensions.gen_salt('bf', 12)
     )
   where id = p_campanha_id;

  if not found then
    return false;
  end if;

  delete from private.sessoes_editor
  where campanha_id = p_campanha_id;

  return true;
end;
$$;

revoke all on function public.definir_senha_editor(text, text, text) from public;
grant execute on function public.definir_senha_editor(text, text, text) to anon, authenticated;

create or replace function public.criar_campanha_com_editor(
  p_nome text,
  p_descricao text,
  p_imagem_url text,
  p_senha_mestre text,
  p_senha_editor text
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
  v_id text;
  v_nome text;
  v_descricao text;
  v_imagem_url text;
  v_criado_em timestamptz;
begin
  if p_senha_editor is null
     or char_length(p_senha_editor) < 6
     or octet_length(p_senha_editor) > 72
     or p_senha_editor <> trim(p_senha_editor)
  then
    raise exception 'A senha do editor deve ter entre 6 caracteres e 72 bytes e não pode começar ou terminar com espaços.' using errcode = '22023';
  end if;

  select nova.id, nova.nome, nova.descricao, nova.imagem_url, nova.criado_em
    into v_id, v_nome, v_descricao, v_imagem_url, v_criado_em
  from public.criar_campanha(
    p_nome,
    p_descricao,
    p_imagem_url,
    p_senha_mestre
  ) as nova;

  update public.campanhas
     set senha_editor_hash = extensions.crypt(
       p_senha_editor,
       extensions.gen_salt('bf', 12)
     )
   where public.campanhas.id = v_id;

  return query
  select v_id, v_nome, v_descricao, v_imagem_url, v_criado_em;
end;
$$;

revoke all on function public.criar_campanha_com_editor(text, text, text, text, text) from public;
grant execute on function public.criar_campanha_com_editor(text, text, text, text, text) to anon, authenticated;

create or replace function public.editar_personagem_editor(
  p_campanha_id text,
  p_personagem_id text,
  p_token text,
  p_nome text,
  p_categoria_id text,
  p_subcategoria_id text,
  p_descricao text,
  p_imagem_url text
)
returns public.personagens
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_personagem public.personagens%rowtype;
begin
  if not private.sessao_editor_valida(p_campanha_id, p_token) then
    raise exception 'Sessão de editor inválida ou expirada.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.personagens as personagem
    join public.categorias as categoria
      on categoria.id = personagem.categoria_id
     and categoria.campanha_id = personagem.campanha_id
    left join public.subcategorias as tier
      on tier.id = personagem.subcategoria_id
     and tier.campanha_id = personagem.campanha_id
    where personagem.id = p_personagem_id
      and personagem.campanha_id = p_campanha_id
      and personagem.visivel
      and categoria.visivel
      and (personagem.subcategoria_id is null or tier.visivel)
  ) then
    raise exception 'Personagem indisponível para este acesso.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.categorias as categoria
    where categoria.id = p_categoria_id
      and categoria.campanha_id = p_campanha_id
      and categoria.visivel
  ) then
    raise exception 'Categoria indisponível para este acesso.' using errcode = '42501';
  end if;

  if p_subcategoria_id is not null and not exists (
    select 1
    from public.subcategorias as tier
    where tier.id = p_subcategoria_id
      and tier.categoria_id = p_categoria_id
      and tier.campanha_id = p_campanha_id
      and tier.visivel
  ) then
    raise exception 'Tier indisponível para este acesso.' using errcode = '42501';
  end if;

  update public.personagens as personagem
     set nome = trim(p_nome),
         categoria_id = p_categoria_id,
         subcategoria_id = p_subcategoria_id,
         descricao = trim(coalesce(p_descricao, '')),
         imagem_url = trim(p_imagem_url),
         visivel = true
   where personagem.id = p_personagem_id
     and personagem.campanha_id = p_campanha_id
  returning personagem.* into v_personagem;

  if not found then
    raise exception 'Personagem não encontrado.' using errcode = 'P0002';
  end if;

  return v_personagem;
end;
$$;

revoke all on function public.editar_personagem_editor(text, text, text, text, text, text, text, text) from public;
grant execute on function public.editar_personagem_editor(text, text, text, text, text, text, text, text) to anon, authenticated;

create or replace function public.salvar_timeline_editor(
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
  if not private.sessao_editor_valida(p_campanha_id, p_token) then
    raise exception 'Sessão de editor inválida para esta campanha.' using errcode = '42501';
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

revoke all on function public.salvar_timeline_editor(text, text, jsonb, text) from public;
grant execute on function public.salvar_timeline_editor(text, text, jsonb, text) to anon, authenticated;

commit;
