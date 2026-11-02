# Gera segredos locais; não sobrescreve uma configuração existente.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (Test-Path .env) { throw '.env já existe. Edite-o explicitamente para preservar suas credenciais.' }
function New-Password {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    [Convert]::ToBase64String($bytes)
}
$lines = @(
    "MYSQL_PASSWORD=$(New-Password)"
    "MYSQL_ROOT_PASSWORD=$(New-Password)"
    "APP_PORT=8080"
)
[IO.File]::WriteAllLines((Join-Path (Get-Location) '.env'), $lines, (New-Object Text.UTF8Encoding $false))
Write-Host '.env criado com senhas aleatórias. Não compartilhe este arquivo.'
