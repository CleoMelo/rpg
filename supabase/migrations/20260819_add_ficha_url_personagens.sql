-- Adiciona o link da ficha do personagem ao banco e disponibiliza
-- uma RPC segura para o mestre salvar/atualizar esse link.

ALTER TABLE public.personagens
ADD COLUMN IF NOT EXISTS ficha_url TEXT;

CREATE OR REPLACE FUNCTION public.salvar_ficha_personagem(
  p_campanha_id TEXT,
  p_personagem_id TEXT,
  p_token TEXT,
  p_ficha_url TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_personagem public.personagens%ROWTYPE;
BEGIN
  SELECT *
    INTO v_personagem
  FROM public.personagens
  WHERE id = p_personagem_id
    AND campanha_id = p_campanha_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  PERFORM public.editar_personagem_imagekit(
    p_campanha_id,
    p_personagem_id,
    p_token,
    v_personagem.nome,
    v_personagem.categoria_id,
    v_personagem.subcategoria_id,
    v_personagem.descricao,
    v_personagem.imagem_url,
    v_personagem.visivel
  );

  UPDATE public.personagens
  SET ficha_url = NULLIF(TRIM(p_ficha_url), '')
  WHERE id = p_personagem_id
    AND campanha_id = p_campanha_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.salvar_ficha_personagem(TEXT, TEXT, TEXT, TEXT)
TO anon, authenticated;
