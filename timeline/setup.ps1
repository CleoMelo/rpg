$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable("Path","Machine")
    $user = [Environment]::GetEnvironmentVariable("Path","User")
    $env:Path = "$machine;$user"
}

function Ensure-WingetTool {
    param([string]$Command,[string]$PackageId)
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        Write-Host "Instalando $Command..." -ForegroundColor Cyan
        winget install --id $PackageId -e --accept-package-agreements --accept-source-agreements
        Refresh-Path
    }
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        throw "Nao foi possivel encontrar $Command. Feche e abra o PowerShell e execute novamente."
    }
}

Write-Host ""
Write-Host "=== Timeline Cavaleiros - GitHub Only ===" -ForegroundColor Magenta
Write-Host "Sem Supabase, sem Firebase e sem banco externo."
Write-Host ""

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "O Windows precisa do winget/App Installer atualizado."
}

Ensure-WingetTool "git" "Git.Git"
Ensure-WingetTool "gh" "GitHub.cli"

& gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Abrindo login do GitHub..." -ForegroundColor Cyan
    & gh auth login --web --git-protocol https
    if ($LASTEXITCODE -ne 0) { throw "Falha no login do GitHub." }
}

$owner = (& gh api user --jq ".login").Trim()
if (-not $owner) { throw "Nao consegui identificar seu usuario do GitHub." }

$repoName = Read-Host "Nome do repositorio [timeline-cavaleiros]"
if ([string]::IsNullOrWhiteSpace($repoName)) { $repoName = "timeline-cavaleiros" }

$friend = Read-Host "Usuario GitHub do mestre/amigo (pode deixar vazio e adicionar depois)"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$configPath = Join-Path $root "config.js"
$config = Get-Content $configPath -Raw
$config = $config.Replace("__OWNER__",$owner).Replace("__REPO__",$repoName)
Set-Content $configPath $config -Encoding UTF8

if (-not (Test-Path ".git")) {
    & git init -b main
}
& git config user.name $owner
& git config user.email "$owner@users.noreply.github.com"

& gh repo view "$owner/$repoName" *> $null
$repoExists = ($LASTEXITCODE -eq 0)

if (-not $repoExists) {
    & gh repo create $repoName --public --source "." --remote origin
    if ($LASTEXITCODE -ne 0) { throw "Falha ao criar repositorio." }
} elseif (-not ((& git remote) -contains "origin")) {
    & git remote add origin "https://github.com/$owner/$repoName.git"
}

& git add .
$changes = & git status --porcelain
if ($changes) {
    & git commit -m "Cria timeline Cavaleiros Divinos"
}
& git branch -M main
& git push -u origin main
if ($LASTEXITCODE -ne 0) { throw "Falha ao enviar arquivos para o GitHub." }

Write-Host "Ativando GitHub Pages..." -ForegroundColor Cyan
$body = @{
    build_type = "legacy"
    source = @{ branch = "main"; path = "/" }
} | ConvertTo-Json -Depth 4 -Compress

& gh api "repos/$owner/$repoName/pages" *> $null
if ($LASTEXITCODE -eq 0) {
    $body | & gh api --method PUT "repos/$owner/$repoName/pages" --input - *> $null
} else {
    $body | & gh api --method POST "repos/$owner/$repoName/pages" --input - *> $null
}

if (-not [string]::IsNullOrWhiteSpace($friend)) {
    Write-Host "Convidando $friend como colaborador..." -ForegroundColor Cyan
    try {
        & gh api --method PUT "repos/$owner/$repoName/collaborators/$friend" -f permission=push *> $null
        Write-Host "Convite enviado. Ele precisa aceitar no GitHub." -ForegroundColor Green
    } catch {
        Write-Host "Nao consegui enviar o convite automaticamente. Voce pode adiciona-lo em Settings > Collaborators." -ForegroundColor Yellow
    }
}

$site = "https://$owner.github.io/$repoName/"
$admin = "${site}admin.html"

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host "PRONTO" -ForegroundColor Green
Write-Host "Site publico: $site" -ForegroundColor Cyan
Write-Host "Editor:       $admin" -ForegroundColor Cyan
Write-Host "Repositorio:  https://github.com/$owner/$repoName" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Green
Write-Host ""
Write-Host "O mestre precisa aceitar o convite de colaborador." -ForegroundColor Yellow
Write-Host "Depois, ele cria um Personal Access Token (classic) na propria conta GitHub"
Write-Host "com o escopo 'public_repo', e cola esse token UMA VEZ na pagina admin.html."
Write-Host ""
Write-Host "IMPORTANTE: nao coloque o token em nenhum arquivo do repositorio."
Write-Host "A pagina admin guarda o token apenas no navegador do PC dele."
Write-Host ""
Write-Host "Cada salvamento do editor altera timeline.json por um commit."
Write-Host "O site publico busca a versao mais recente diretamente do GitHub."
