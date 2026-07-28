-- Execute este arquivo no Supabase Dashboard > SQL Editor.
-- Ele pode ser executado novamente sem apagar campanhas existentes.

create extension if not exists pgcrypto with schema extensions;

alter table public.campanhas
  alter column id set default gen_random_uuid()::text;

alter table public.campanhas
  add column if not exists senha_mestre_hash text;

-- Campanhas já existentes mantêm a senha de demonstração.
update public.campanhas
set senha_mestre_hash = extensions.crypt('mestre123', extensions.gen_salt('bf', 12))
where senha_mestre_hash is null;

alter table public.campanhas
  alter column senha_mestre_hash set not null;

create or replace function public.criar_campanha(
  p_nome text,
  p_descricao text,
  p_imagem_url text,
  p_senha text
)
returns table (
  id text,
  nome text,
  descricao text,
  imagem_url text,
  criado_em timestamp with time zone
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_nome is null or char_length(trim(p_nome)) not between 1 and 70 then
    raise exception 'O nome deve ter entre 1 e 70 caracteres.' using errcode = '22023';
  end if;

  if char_length(coalesce(p_descricao, '')) > 220 then
    raise exception 'A descrição deve ter no máximo 220 caracteres.' using errcode = '22023';
  end if;

  if p_imagem_url is null or trim(p_imagem_url) = '' then
    raise exception 'Informe a URL da imagem.' using errcode = '22023';
  end if;

  if p_senha is null or char_length(p_senha) < 6 or octet_length(p_senha) > 72 then
    raise exception 'A senha deve ter no mínimo 6 caracteres e no máximo 72 bytes.' using errcode = '22023';
  end if;

  return query
  insert into public.campanhas as campanha (
    nome,
    descricao,
    imagem_url,
    senha_mestre_hash
  )
  values (
    trim(p_nome),
    coalesce(nullif(trim(p_descricao), ''), 'Campanha personalizada.'),
    trim(p_imagem_url),
    extensions.crypt(p_senha, extensions.gen_salt('bf', 12))
  )
  returning
    campanha.id,
    campanha.nome,
    campanha.descricao,
    campanha.imagem_url,
    campanha.criado_em;
end;
$$;

create or replace function public.verificar_senha_mestre(
  p_campanha_id text,
  p_senha text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.campanhas as campanha
    where campanha.id = p_campanha_id
      and campanha.senha_mestre_hash = extensions.crypt(
        p_senha,
        campanha.senha_mestre_hash
      )
  );
$$;

revoke all on function public.criar_campanha(text, text, text, text) from public;
revoke all on function public.verificar_senha_mestre(text, text) from public;

grant execute on function public.criar_campanha(text, text, text, text) to anon, authenticated;
grant execute on function public.verificar_senha_mestre(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
