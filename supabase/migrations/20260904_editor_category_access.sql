-- Permite que o editor altere apenas campos públicos de categorias já visíveis.
-- Não permite criar, excluir, ocultar, reordenar ou reclassificar categorias.

begin;

create or replace function public.editar_categoria_editor(
  p_campanha_id text,
  p_categoria_id text,
  p_token text,
  p_nome text,
  p_descricao text,
  p_icone text
)
returns public.categorias
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categoria public.categorias%rowtype;
begin
  if not private.sessao_editor_valida(p_campanha_id, p_token) then
    raise exception 'Sessão de editor inválida ou expirada.' using errcode = '42501';
  end if;

  if p_nome is null or char_length(trim(p_nome)) not between 1 and 50 then
    raise exception 'O nome da categoria deve ter entre 1 e 50 caracteres.' using errcode = '22023';
  end if;

  if char_length(coalesce(p_descricao, '')) > 180 then
    raise exception 'A descrição da categoria deve ter no máximo 180 caracteres.' using errcode = '22023';
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

  update public.categorias as categoria
     set nome = trim(p_nome),
         descricao = trim(coalesce(p_descricao, '')),
         icone = coalesce(nullif(trim(p_icone), ''), '📁'),
         visivel = true
   where categoria.id = p_categoria_id
     and categoria.campanha_id = p_campanha_id
     and categoria.visivel
  returning categoria.* into v_categoria;

  if not found then
    raise exception 'Categoria não encontrada.' using errcode = 'P0002';
  end if;

  return v_categoria;
end;
$$;

revoke all on function public.editar_categoria_editor(text, text, text, text, text, text) from public;
grant execute on function public.editar_categoria_editor(text, text, text, text, text, text) to anon, authenticated;

commit;
