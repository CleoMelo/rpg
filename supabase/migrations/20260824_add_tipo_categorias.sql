-- Classificação semântica das categorias.

ALTER TABLE public.categorias
ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'personagem';

ALTER TABLE public.categorias
DROP CONSTRAINT IF EXISTS categorias_tipo_check;

ALTER TABLE public.categorias
ADD CONSTRAINT categorias_tipo_check
CHECK (tipo IN ('personagem', 'local', 'animal', 'item', 'faccao', 'evento', 'outro'));

CREATE INDEX IF NOT EXISTS categorias_campanha_tipo_idx
ON public.categorias (campanha_id, tipo);

CREATE OR REPLACE FUNCTION public.classificar_categoria(
  p_campanha_id TEXT,
  p_categoria_id TEXT,
  p_token TEXT,
  p_tipo TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_categoria public.categorias%ROWTYPE;
  v_validated public.categorias%ROWTYPE;
BEGIN
  IF p_tipo NOT IN ('personagem', 'local', 'animal', 'item', 'faccao', 'evento', 'outro') THEN
    RAISE EXCEPTION 'Tipo de categoria inválido.';
  END IF;

  SELECT *
    INTO v_categoria
  FROM public.categorias
  WHERE id = p_categoria_id
    AND campanha_id = p_campanha_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  SELECT *
    INTO v_validated
  FROM public.editar_categoria(
    p_campanha_id,
    p_categoria_id,
    p_token,
    v_categoria.nome,
    v_categoria.descricao,
    v_categoria.icone,
    v_categoria.visivel
  );

  IF v_validated.id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.categorias
  SET tipo = p_tipo
  WHERE id = p_categoria_id
    AND campanha_id = p_campanha_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.classificar_categoria(TEXT, TEXT, TEXT, TEXT)
TO anon, authenticated;
