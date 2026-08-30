# Timeline — Cavaleiros Divinos e a Ordem dos Reinos

A timeline foi integrada ao Supabase já usado pelo projeto `CleoMelo/rpg`.

- `timeline.html`: editor do mestre.
- `index.html`: visualização pública.
- `timeline.json`: cópia inicial/fallback usada somente para a primeira migração e recuperação.
- `supabase-adapter.js`: conecta o frontend às RPCs do Supabase.
- `../supabase/migrations/20260829_timeline_supabase.sql`: cria armazenamento JSONB, histórico e RPCs.

## Fluxo

1. Execute a migração SQL no Supabase.
2. Entre normalmente como mestre na campanha.
3. Abra `timeline.html` com a campanha selecionada.
4. Se ainda não houver timeline no banco, o JSON atual é importado automaticamente.
5. Depois disso, salvar/restaurar usa somente o Supabase.

Não é necessário Cloudflare Worker nem token do GitHub.
