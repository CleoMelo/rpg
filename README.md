# Portal de RPGs

Site estático em HTML, CSS e JavaScript com:

- Página inicial para seleção de campanhas.
- Escolha de acesso como jogador ou mestre.
- Tela de senha para mestre.
- Página de categorias.
- Galeria de personagens filtrada por categoria.
- Cadastro e remoção de personagens no acesso de mestre.
- Imagens por URL direta do Imgur.
- Dados salvos no navegador usando localStorage.

## Como executar

Abra `index.html` diretamente no navegador ou use uma extensão como Live Server no VS Code.

## Senha de demonstração

`mestre123`

## Personalização

Edite `data.js` para alterar campanhas e categorias.

## Observação de segurança

A senha está no JavaScript porque este é um projeto estático. Para uso público real, autenticação, permissões e armazenamento devem ser implementados em um servidor ou serviço como Firebase, Supabase ou outro backend.


## Configurar campanhas no Supabase

O projeto está configurado para a tabela `campanhas`, com os campos:

```text
id
nome
descricao
imagem_url
criado_em
```

As credenciais públicas do frontend ficam em `supabase-config.js`.

```js
window.SUPABASE_CONFIG = {
  url: "https://SEU-PROJETO.supabase.co",
  anonKey: "SUA_CHAVE_PUBLISHABLE"
};
```

Use apenas a chave `anon`/`publishable`. Nunca coloque a chave `service_role` no GitHub.

A página inicial passa a:
- buscar campanhas da tabela `campanhas`;
- criar campanhas no banco;
- excluir campanhas personalizadas do banco;
- usar a URL informada como imagem de fundo do botão.

As três campanhas demonstrativas continuam definidas em `data.js`. Para removê-las, deixe `DEFAULT_RPGS` como um array vazio.

### Segurança

As políticas RLS precisam permitir `SELECT` e `INSERT` para a criação funcionar. A exclusão também exige uma política de `DELETE`. Para um site público real, conecte o acesso de mestre ao Supabase Auth e restrinja `INSERT` e `DELETE` a usuários autenticados autorizados.
