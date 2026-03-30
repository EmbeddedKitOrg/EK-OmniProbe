[CmdletBinding()]
param(
    [switch]$NoInstall,
    [string]$ExpectedVersion
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

function Assert-VersionMatch {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Label,
        [Parameter(Mandatory = $true)]
        [string]$Actual,
        [Parameter(Mandatory = $true)]
        [string]$Expected
    )

    if ($Actual -ne $Expected) {
        throw "$Label version mismatch. Expected: $Expected, Actual: $Actual"
    }
}

function Assert-PatternMatch {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Label,
        [Parameter(Mandatory = $true)]
        [string]$Content,
        [Parameter(Mandatory = $true)]
        [string]$Pattern
    )

    if ($Content -notmatch $Pattern) {
        throw "$Label did not match expected pattern: $Pattern"
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location -LiteralPath $scriptDir

try {
    if (-not (Test-Command -Name "node")) {
        throw "Node.js 18+ was not found. Please install Node.js first."
    }

    if (-not (Test-Command -Name "cargo")) {
        throw "Cargo was not found. Please install Rust first."
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

    Write-Host "Checking TypeScript..." -ForegroundColor Green
    if ($packageManager -eq "pnpm") {
        Invoke-PackageManager -PackageManager $packageManager -Arguments @("exec", "tsc", "--noEmit")
    }
    else {
        Invoke-PackageManager -PackageManager $packageManager -Arguments @("exec", "tsc", "--noEmit")
    }

    if ($packageManager -eq "pnpm") {
        Write-Host "Checking pnpm frozen lockfile consistency..." -ForegroundColor Green
        Invoke-PackageManager -PackageManager $packageManager -Arguments @("install", "--frozen-lockfile", "--ignore-scripts")
    }

    Write-Host "Checking package.json syntax..." -ForegroundColor Green
    $packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json

    Write-Host "Checking tauri.conf.json syntax..." -ForegroundColor Green
    $tauriConfig = Get-Content "src-tauri/tauri.conf.json" -Raw | ConvertFrom-Json

    Write-Host "Checking Cargo manifest..." -ForegroundColor Green
    cargo metadata --manifest-path "src-tauri/Cargo.toml" --no-deps | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Cargo metadata check failed."
    }

    $cargoToml = Get-Content "src-tauri/Cargo.toml" -Raw
    $cargoVersionMatch = [regex]::Match($cargoToml, '(?m)^version\s*=\s*"([^"]+)"')
    if (-not $cargoVersionMatch.Success) {
        throw "Could not read version from src-tauri/Cargo.toml"
    }
    $cargoVersion = $cargoVersionMatch.Groups[1].Value

    if (-not [string]::IsNullOrWhiteSpace($ExpectedVersion)) {
        $resolvedVersion = $ExpectedVersion.Trim()

        Write-Host "Checking version consistency: $resolvedVersion" -ForegroundColor Green
        Assert-VersionMatch -Label "package.json" -Actual $packageJson.version -Expected $resolvedVersion
        Assert-VersionMatch -Label "src-tauri/Cargo.toml" -Actual $cargoVersion -Expected $resolvedVersion
        Assert-VersionMatch -Label "src-tauri/tauri.conf.json" -Actual $tauriConfig.version -Expected $resolvedVersion

        $readmeContent = Get-Content "README.md" -Raw
        $changelogContent = Get-Content "CHANGELOG.md" -Raw
        $escapedVersion = [regex]::Escape($resolvedVersion)

        Assert-PatternMatch -Label "README version badge" -Content $readmeContent -Pattern "version-$escapedVersion-blue"
        Assert-PatternMatch -Label "README latest version section" -Content $readmeContent -Pattern "最新版本 v$escapedVersion"
        Assert-PatternMatch -Label "CHANGELOG entry" -Content $changelogContent -Pattern "## \[$escapedVersion\]"
    }

    Write-Host ""
    Write-Host "Release validation passed." -ForegroundColor Green
    if (-not [string]::IsNullOrWhiteSpace($ExpectedVersion)) {
        Write-Host "Version: $ExpectedVersion" -ForegroundColor Green
    }
}
finally {
    Pop-Location
}
