CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.trocar_senha_mestre(
  p_campanha_id UUID,
  p_token TEXT,
  p_senha_atual TEXT,
  p_nova_senha TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF COALESCE(LENGTH(p_nova_senha), 0) < 6 THEN
    RAISE EXCEPTION 'A nova senha precisa ter pelo menos 6 caracteres.';
  END IF;

  IF p_nova_senha <> TRIM(p_nova_senha) THEN
    RAISE EXCEPTION 'A nova senha não pode começar ou terminar com espaços.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sessoes_mestre s
    JOIN public.campanhas c ON c.id = s.campanha_id
    WHERE s.campanha_id = p_campanha_id
      AND s.token::TEXT = p_token
      AND c.senha_hash = crypt(p_senha_atual, c.senha_hash)
  ) THEN
    RETURN FALSE;
  END IF;

  UPDATE public.campanhas
  SET senha_hash = crypt(p_nova_senha, gen_salt('bf'))
  WHERE id = p_campanha_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trocar_senha_mestre(UUID, TEXT, TEXT, TEXT)
TO anon, authenticated;
