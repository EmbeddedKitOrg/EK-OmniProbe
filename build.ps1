[CmdletBinding()]
param(
    [switch]$NoInstall,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$TauriArgs
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Test-Command {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    return $null -ne (Get-Command -Name $Name -ErrorAction SilentlyContinue)
}

function Get-PackageManager {
    if (Test-Command -Name "pnpm") {
        return "pnpm"
    }

    if (Test-Command -Name "npm") {
        return "npm"
    }

    throw "Neither pnpm nor npm was found. Please install one of them first."
}

function Invoke-PackageManager {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PackageManager,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & $PackageManager @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: $PackageManager $($Arguments -join ' ')"
    }
}

function Get-CleanArgs {
    param(
        [string[]]$Arguments
    )

    if ($null -eq $Arguments) {
        return @()
    }

    return @(
        $Arguments | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    )
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location -LiteralPath $scriptDir

try {
    if (-not (Test-Command -Name "node")) {
        throw "Node.js 18+ was not found. Please install Node.js first."
    }

    $packageManager = Get-PackageManager

    Write-Host "Working directory: $scriptDir" -ForegroundColor Cyan
    Write-Host "Package manager: $packageManager" -ForegroundColor Cyan

    $nodeModulesPath = Join-Path -Path $scriptDir -ChildPath "node_modules"
    $needInstall = (-not $NoInstall) -and (-not (Test-Path -LiteralPath $nodeModulesPath))
    if ($needInstall) {
        Write-Host "node_modules not found. Installing frontend dependencies..." -ForegroundColor Yellow
        Invoke-PackageManager -PackageManager $packageManager -Arguments @("install")
    }

    Write-Host "Starting Tauri build..." -ForegroundColor Green
    $cleanTauriArgs = Get-CleanArgs -Arguments $TauriArgs

    if ($packageManager -eq "pnpm") {
        Invoke-PackageManager -PackageManager $packageManager -Arguments (@("tauri", "build") + $cleanTauriArgs)
    }
    else {
        Invoke-PackageManager -PackageManager $packageManager -Arguments (@("run", "tauri", "--", "build") + $cleanTauriArgs)
    }
}
finally {
    Pop-Location
}
