[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (!(Test-Path .env)) { throw 'Execute primeiro scripts/configure.ps1.' }
# Arquivo temporário protegido pelo .gitignore; não imprime valores nem usa senhas em argumentos.
$secretDir = Join-Path (Get-Location) 'secrets'
New-Item -ItemType Directory -Force $secretDir | Out-Null
$secretFile = Join-Path $secretDir 'mysql.env'
try {
    $lines = @(Get-Content .env | Where-Object { $_ -match '^MYSQL_(ROOT_)?PASSWORD=' })
    if ($lines.Count -ne 2) { throw 'Defina ambas as senhas no .env.' }
    [IO.File]::WriteAllLines($secretFile, $lines, (New-Object Text.UTF8Encoding $false))
    kubectl apply -f k8s/namespace.yaml
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar namespace.' }
    # Cria uma vez: rotação exige alterar também a senha no MySQL persistente.
    kubectl -n mensagens create secret generic app-secrets --from-env-file=$secretFile
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar Secret. Se já existe, consulte a seção de rotação no README.' }
} finally {
    if (Test-Path -LiteralPath $secretFile) { Remove-Item -LiteralPath $secretFile }
}
