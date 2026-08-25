create extension if not exists pgcrypto;

create or replace function public.trocar_senha_mestre(
  p_campanha_id uuid,
  p_token text,
  p_senha_atual text,
  p_nova_senha text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if coalesce(length(p_nova_senha), 0) < 6 then
    raise exception 'A nova senha precisa ter pelo menos 6 caracteres.';
  end if;

  if p_nova_senha <> trim(p_nova_senha) then
    raise exception 'A nova senha não pode começar ou terminar com espaços.';
  end if;

  if not exists (
    select 1
    from public.sessoes_mestre s
    join public.campanhas c on c.id = s.campanha_id
    where s.campanha_id = p_campanha_id
      and s.token::text = p_token
      and c.senha_hash = crypt(p_senha_atual, c.senha_hash)
  ) then
    return false;
  end if;

  update public.campanhas
     set senha_hash = crypt(p_nova_senha, gen_salt('bf'))
   where id = p_campanha_id;

  return true;
end;
$$;

grant execute on function public.trocar_senha_mestre(uuid, text, text, text) to anon, authenticated;
