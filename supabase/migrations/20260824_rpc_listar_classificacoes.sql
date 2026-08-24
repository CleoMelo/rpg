-- Leitura segura das classificações das categorias.
-- Evita que o frontend precise de SELECT direto em public.categorias.
CREATE OR REPLACE FUNCTION public.listar_classificacoes_categorias(
  p_campanha_id TEXT
)
RETURNS TABLE(id TEXT, tipo TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id::TEXT, c.tipo::TEXT
  FROM public.categorias AS c
  WHERE c.campanha_id = p_campanha_id
  ORDER BY c.ordem, c.nome, c.id;
$$;

GRANT EXECUTE ON FUNCTION public.listar_classificacoes_categorias(TEXT)
TO anon, authenticated;
