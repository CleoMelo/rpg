# Portal de RPGs

Site estático em HTML, CSS e JavaScript integrado ao Supabase.

## Recursos

- Criação e seleção de campanhas.
- Senha própria do mestre por campanha.
- Sessão temporária do mestre para operações administrativas.
- Exclusão de campanha somente pela área do mestre.
- Categorias personalizadas armazenadas no banco.
- Personagens armazenados no banco e filtrados por categoria.
- Upload de imagens de personagens para o Supabase Storage.
- Campanhas demonstrativas disponíveis para testes locais.

## Como executar

Abra `index.html` diretamente no navegador ou use uma extensão como Live Server no VS Code.

## Senha do mestre

Cada campanha criada recebe uma senha própria. A senha é armazenada somente como hash no Supabase. As campanhas demonstrativas continuam usando `mestre123`.

Após a autenticação, o navegador mantém um token temporário na sessão da aba. O token é necessário para criar ou excluir categorias e personagens e para excluir a campanha.

## Supabase

A configuração pública do frontend fica em `supabase-config.js`:

```js
window.SUPABASE_CONFIG = {
  url: "https://SEU-PROJETO.supabase.co",
  anonKey: "SUA_CHAVE_PUBLISHABLE"
};
```

Use somente a chave `anon`/`publishable`. Nunca coloque a chave `service_role` no GitHub.

O banco utiliza as tabelas:

- `campanhas`
- `categorias`
- `personagens`
- `sessoes_mestre`

As imagens enviadas ficam no bucket público `imagens-rpg` do Supabase Storage.

O SQL de configuração deve ser executado separadamente no **Supabase Dashboard > SQL Editor** e não é armazenado neste repositório.

## Campanhas demonstrativas

As campanhas demonstrativas continuam definidas em `data.js`. Categorias e personagens criados nessas campanhas são mantidos no navegador. Para removê-las, deixe `DEFAULT_RPGS` como um array vazio.

## Segurança

As operações administrativas das campanhas personalizadas usam funções RPC que validam uma sessão temporária do mestre. As políticas RLS continuam necessárias para controlar as leituras públicas e o upload no Storage. Para um ambiente com múltiplos administradores e recuperação de senha, o próximo passo recomendado é integrar o Supabase Auth.
