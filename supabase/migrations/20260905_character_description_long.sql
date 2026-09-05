-- Amplia a descrição dos personagens para textos detalhados.
-- Mantém um limite alto para evitar payloads acidentalmente excessivos.

begin;

alter table public.personagens
  drop constraint if exists personagens_descricao_check;

alter table public.personagens
  add constraint personagens_descricao_check
  check (char_length(descricao) <= 5000);

-- Mantém a RPC legada coerente com o novo limite da tabela.
create or replace function public.criar_personagem(
  p_campanha_id text,
  p_categoria_id text,
  p_token text,
  p_nome text,
  p_descricao text,
  p_imagem_url text
)
returns table(
  id text,
  campanha_id text,
  categoria_id text,
  nome text,
  descricao text,
  imagem_url text,
  criado_em timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_personagem public.personagens%rowtype;
begin
  if not private.sessao_mestre_valida(p_campanha_id, p_token) then
    raise exception 'Sessão do mestre inválida ou expirada.'
      using errcode = '42501';
  end if;

  if p_nome is null
     or char_length(trim(p_nome)) not between 1 and 80 then
    raise exception 'O nome deve ter entre 1 e 80 caracteres.'
      using errcode = '22023';
  end if;

  if char_length(coalesce(p_descricao, '')) > 5000 then
    raise exception 'A descrição deve ter no máximo 5.000 caracteres.'
      using errcode = '22023';
  end if;

  if p_imagem_url is null
     or p_imagem_url !~* '^https://i[.]imgur[.]com/.+[.](jpg|jpeg|png|gif|webp|avif)([?].*)?$' then
    raise exception 'Use um link direto de imagem do Imgur.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.categorias as categoria
    where categoria.id = p_categoria_id
      and categoria.campanha_id = p_campanha_id
  ) then
    raise exception 'A categoria não pertence à campanha.'
      using errcode = '23503';
  end if;

  insert into public.personagens as personagem (
    campanha_id,
    categoria_id,
    nome,
    descricao,
    imagem_url
  ) values (
    p_campanha_id,
    p_categoria_id,
    trim(p_nome),
    coalesce(trim(p_descricao), ''),
    trim(p_imagem_url)
  )
  returning personagem.* into v_personagem;

  return query
  select
    v_personagem.id,
    v_personagem.campanha_id,
    v_personagem.categoria_id,
    v_personagem.nome,
    v_personagem.descricao,
    v_personagem.imagem_url,
    v_personagem.criado_em;
end;
$$;

commit;
