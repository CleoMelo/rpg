# Ativação das contas individuais

Esta configuração cria somente as contas `cleo`, `pedro`, `tigre`, `hana` e `carero`.
O site não possui cadastro público e os papéis podem ser alterados depois por um mestre.

## 1. Executar a migration

No Supabase Dashboard, abra **SQL Editor**, copie todo o conteúdo de
`supabase/migrations/20260914_user_accounts.sql` e execute uma vez.

No Windows PowerShell, copie sempre como UTF-8 para preservar os acentos:

```powershell
Get-Content -Raw -Encoding UTF8 "supabase\migrations\20260914_user_accounts.sql" | Set-Clipboard
```

A migration cria os perfis, os vínculos por campanha, as funções de gerenciamento
e sessões de oito horas compatíveis com as funções atuais do site.

## 2. Bloquear novos cadastros

No Dashboard, abra **Authentication > Sign In / Providers > Email** e desative
**Allow new users to sign up**. Não desative o login por e-mail.

O arquivo `supabase/config.toml` já contém a configuração equivalente para ambientes locais.

## 3. Informar as senhas dos cinco usuários

No PowerShell, dentro do repositório:

```powershell
node "scripts/bootstrap-fixed-users.mjs" --init
notepad "scripts/fixed-users.local.json"
```

Preencha a senha inicial e, se quiser, o nome de exibição. O arquivo local está
no `.gitignore` e não deve ser enviado ao GitHub. Não existe JSON de contas
versionado no repositório.

Os logins são `cleo`, `pedro`, `tigre`, `hana` e `carero`. O script usa endereços
internos invisíveis apenas porque o Supabase Auth exige um identificador nesse
formato; o site nunca pede e-mail ao usuário.

## 4. Criar as contas e aplicar os acessos iniciais

Copie a chave **service_role** em **Project Settings > API Keys**. Ela deve ficar
somente no terminal usado para esta configuração.

```powershell
$env:SUPABASE_URL = "https://iqybtdfujkemvthtwzqu.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "COLE_A_CHAVE_SERVICE_ROLE_APENAS_AQUI"
node "scripts/bootstrap-fixed-users.mjs"
Remove-Item Env:\SUPABASE_SERVICE_ROLE_KEY
Remove-Item Env:\SUPABASE_URL
```

Depois de guardar as senhas em um gerenciador seguro, exclua o arquivo preenchido:

```powershell
Remove-Item -LiteralPath "scripts/fixed-users.local.json"
```

O script pode ser executado novamente. Contas existentes são preservadas e nenhuma
conta fora da lista fixa é criada.

### Redefinir todas as senhas de uma vez

Para restaurar os cinco logins e aplicar a mesma senha temporária sem criar um JSON:

```powershell
$env:RPG_DEFAULT_PASSWORD = "COLOQUE_UMA_SENHA_TEMPORARIA_FORTE"
node "scripts/bootstrap-fixed-users.mjs" --reset-passwords
Remove-Item Env:\RPG_DEFAULT_PASSWORD
```

A chave secreta e a URL do Supabase também precisam estar definidas no mesmo
terminal. A senha não é gravada no repositório. Depois, cada pessoa pode alterá-la
em **Minha conta**.

## Acessos iniciais

| Conta | Campanha | Papel |
|---|---|---|
| tigre | Cavaleiros Divinos: A Ordem dos Reinos | Mestre |
| pedro | Correntes do Destino | Mestre |
| cleo | D&D | Mestre |
| cleo | Fate/Grand RPG | Mestre |
| hana | Nenhuma inicialmente | — |
| carero | Nenhuma inicialmente | — |

IDs confirmados no projeto em 14 de setembro de 2026:

```text
Cavaleiros  c4e4e708-f809-42c7-858d-dbfba31b0895
Fate        1a23d727-3158-4f58-b8cd-0ec2237bafd0
D&D         47e15c62-daaf-4b2b-885e-d54d02b8e424
Correntes   97060edf-1d20-4e59-b82e-443ade4ae138
```

Se uma campanha for substituída no banco, atualize o ID correspondente no início de
`scripts/bootstrap-fixed-users.mjs`. O script interrompe sem atribuir papéis quando o
ID e o nome não correspondem.

## Uso no site

- A página `login.html` aceita somente contas existentes.
- `conta.html` permite alterar login e senha.
- Um mestre acessa `conta.html?rpg=ID_DA_CAMPANHA` para conceder, remover ou trocar
  os papéis das cinco contas.
- Somente uma das cinco contas conectadas pode criar campanha; quem cria recebe o
  papel de mestre automaticamente.
- O banco impede a remoção do último mestre de uma campanha.
- Jogadores continuam acessando o conteúdo público sem conta.
