# Chore Coin one-line installer for Windows 10 (build 17063+) and Windows 11.
#
# Usage from PowerShell:
#     $env:CHORECOIN_LICENSE = 'CHRC-XXXX-XXXX-XXXX-XXXX'
#     iwr -UseBasicParsing https://raw.githubusercontent.com/danielhemp/chore-coin/main/install.ps1 | iex
#
# What it does:
#   1. Detects your CPU architecture (amd64 / arm64).
#   2. Downloads the matching prebuilt binary from the latest GitHub release
#      and verifies its SHA-256 checksum against the published SHA256SUMS.txt.
#   3. Installs the binary to %LOCALAPPDATA%\ChoreCoin\chorecoin.exe (no admin
#      required — per-user install into your own AppData).
#   4. Creates a data directory at %LOCALAPPDATA%\ChoreCoin\data\.
#   5. Registers a Scheduled Task that runs chorecoin.exe at every logon so
#      Chore Coin starts automatically whenever you sign in. No admin
#      privileges needed — the task is per-user, not system-wide.
#   6. Starts the task and prints the URL to open in your browser to
#      complete first-run setup.
#
# Env overrides:
#   CHORECOIN_LICENSE       Your license key (required — script fails without)
#   CHORECOIN_PORT          Port the service binds (default 8090)
#   CHORECOIN_BIND          Bind address (default 127.0.0.1)
#
# Uninstall:
#   schtasks /Delete /TN ChoreCoin /F
#   Remove-Item -Recurse "$env:LOCALAPPDATA\ChoreCoin"
#   Your family's data lives in %LOCALAPPDATA%\ChoreCoin\data — remove it
#   too if you want a completely clean uninstall.

$ErrorActionPreference = 'Stop'

$Repo = 'danielhemp/chore-coin'
$Port = if ($env:CHORECOIN_PORT) { $env:CHORECOIN_PORT } else { '8090' }
$Bind = if ($env:CHORECOIN_BIND) { $env:CHORECOIN_BIND } else { '127.0.0.1' }

function Say($msg)  { Write-Host "" ; Write-Host $msg -ForegroundColor White }
function Ok($msg)   { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Info($msg) { Write-Host "  $msg" -ForegroundColor DarkGray }
function Die($msg)  { Write-Host "  ✗ $msg" -ForegroundColor Red ; exit 1 }

Say "Chore Coin installer"

# ---- license gate ---------------------------------------------------------
# Chore Coin is a paid product. Every install requires a valid license key
# up front so nobody accidentally sets up a server they can't actually run.
$License = $env:CHORECOIN_LICENSE
if (-not $License) {
    if ($Host.UI.SupportsVirtualTerminal -or (Test-Path variable:Host)) {
        $License = Read-Host "License key (from your purchase email)"
    }
}
$License = ($License -replace '\s', '').ToUpper()
if (-not $License) {
    Die @"
no license key provided.
  Get one from https://chore-coin.app then run PowerShell and paste:
      `$env:CHORECOIN_LICENSE = 'CHRC-XXXX-XXXX-XXXX-XXXX'
      iwr -UseBasicParsing https://raw.githubusercontent.com/$Repo/main/install.ps1 | iex
  Full install guide: https://chore-coin.app/install-guide.html
"@
}
# Format check — full signature verification lands with Lemon Squeezy.
if ($License -notmatch '^CHRC(-[A-Z0-9]{4}){4}$') {
    Die @"
license key doesn't match the expected CHRC-XXXX-XXXX-XXXX-XXXX format.
  Copy the key straight from your welcome email — no spaces, no line breaks.
  If you're still stuck, see: https://chore-coin.app/install-guide.html#trouble
"@
}
Ok "license key accepted"

# ---- detect architecture --------------------------------------------------
switch ($env:PROCESSOR_ARCHITECTURE) {
    'AMD64' { $Arch = 'amd64' }
    'ARM64' { $Arch = 'arm64' }
    'X86'   { Die "32-bit Windows is not supported. You need 64-bit Windows 10 or 11." }
    default { Die "unsupported CPU architecture: $($env:PROCESSOR_ARCHITECTURE)" }
}
$Asset = "chorecoin-windows-$Arch.exe"
Say "Platform: windows/$Arch → $Asset"

# ---- fetch latest release info -------------------------------------------
Say "Finding the latest release..."
try {
    $latestJson = Invoke-RestMethod -UseBasicParsing "https://api.github.com/repos/$Repo/releases/latest"
} catch {
    Die "failed to reach GitHub API — check your internet connection"
}

$Tag = $latestJson.tag_name
$binaryAsset    = $latestJson.assets | Where-Object { $_.name -eq $Asset } | Select-Object -First 1
$checksumsAsset = $latestJson.assets | Where-Object { $_.name -eq 'SHA256SUMS.txt' } | Select-Object -First 1

if (-not $Tag)          { Die "couldn't parse latest release tag — is any release published? See https://github.com/$Repo/releases" }
if (-not $binaryAsset)  { Die "no $Asset binary in release $Tag — Windows build not published yet" }
Ok "Release $Tag"

# ---- download + verify ----------------------------------------------------
$tmpDir = Join-Path $env:TEMP "chorecoin-install-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
$binaryTmp = Join-Path $tmpDir $Asset

Say "Downloading..."
Invoke-WebRequest -UseBasicParsing -Uri $binaryAsset.browser_download_url -OutFile $binaryTmp

if ($checksumsAsset) {
    Say "Verifying SHA-256 checksum..."
    $checksumsTmp = Join-Path $tmpDir 'SHA256SUMS.txt'
    Invoke-WebRequest -UseBasicParsing -Uri $checksumsAsset.browser_download_url -OutFile $checksumsTmp
    $expected = (Get-Content $checksumsTmp | Where-Object { $_ -match "\s$([regex]::Escape($Asset))$" } | Select-Object -First 1) -split '\s+' | Select-Object -First 1
    if (-not $expected) {
        Info "no checksum entry for $Asset — skipping verify"
    } else {
        $actual = (Get-FileHash -Algorithm SHA256 -Path $binaryTmp).Hash.ToLower()
        if ($actual -ne $expected.ToLower()) {
            Die "checksum mismatch! expected $expected got $actual"
        }
        Ok "checksum verified"
    }
} else {
    Info "no SHA256SUMS.txt in release — skipping verify"
}

# ---- install binary --------------------------------------------------------
$InstallDir = Join-Path $env:LOCALAPPDATA 'ChoreCoin'
$DataDir    = Join-Path $InstallDir 'data'
$BinPath    = Join-Path $InstallDir 'chorecoin.exe'
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $DataDir    | Out-Null

# Stop the existing scheduled task if we're upgrading over the top of a
# running instance — otherwise the .exe file is locked and Copy-Item fails.
$existingTask = Get-ScheduledTask -TaskName 'ChoreCoin' -ErrorAction SilentlyContinue
if ($existingTask) {
    try { Stop-ScheduledTask -TaskName 'ChoreCoin' -ErrorAction SilentlyContinue } catch { }
    # Give the process a moment to release the file handle
    Start-Sleep -Milliseconds 500
}

Copy-Item -Force $binaryTmp $BinPath
Ok "installed $BinPath"
Ok "data directory $DataDir"

# ---- stage license for setup wizard ---------------------------------------
$LicensePath = Join-Path $DataDir '.license-pending'
Set-Content -Path $LicensePath -Value $License -NoNewline
Ok "license key staged for setup wizard"

# ---- register scheduled task at logon -------------------------------------
Say "Registering Chore Coin as a startup task..."

$taskAction  = New-ScheduledTaskAction -Execute $BinPath -Argument "serve --http=${Bind}:${Port} --dir=`"$DataDir`""
$taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
$taskPrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

if ($existingTask) {
    Unregister-ScheduledTask -TaskName 'ChoreCoin' -Confirm:$false
}
Register-ScheduledTask -TaskName 'ChoreCoin' `
    -Action $taskAction `
    -Trigger $taskTrigger `
    -Settings $taskSettings `
    -Principal $taskPrincipal `
    -Description "Chore Coin — the family chore + reward tracker. Runs in the background at every logon." | Out-Null
Ok "scheduled task registered (runs at every logon)"

Start-ScheduledTask -TaskName 'ChoreCoin'
Ok "scheduled task started"

# ---- wait for health + print URL ------------------------------------------
Say "Waiting for the service to come up..."
$Url = "http://${Bind}:${Port}"
if ($Bind -eq '0.0.0.0') { $Url = "http://127.0.0.1:${Port}" }
$ready = $false
for ($i = 1; $i -le 20; $i++) {
    try {
        Invoke-WebRequest -UseBasicParsing -Uri "$Url/api/health" -TimeoutSec 2 | Out-Null
        $ready = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}

Write-Host ""
if ($ready) {
    Write-Host "Chore Coin is running." -ForegroundColor White
    Write-Host ""
    Write-Host "  Open in your browser:  $Url" -ForegroundColor White
    Write-Host ""
    Write-Host "  Version:               $Tag" -ForegroundColor DarkGray
    Write-Host "  Binary:                $BinPath" -ForegroundColor DarkGray
    Write-Host "  Data:                  $DataDir" -ForegroundColor DarkGray
    Write-Host "  Service:               Task Scheduler → ChoreCoin" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  First time here? The setup wizard will guide you through" -ForegroundColor DarkGray
    Write-Host "  creating your admin account and first parent. All in the" -ForegroundColor DarkGray
    Write-Host "  browser — no PowerShell." -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Step-by-step guide:  https://chore-coin.app/install-guide.html" -ForegroundColor DarkGray

    # Cleanup temp files
    Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue

    # Try to open the browser automatically
    try { Start-Process $Url } catch { }
} else {
    Write-Host "  Service didn't respond within 20s." -ForegroundColor Red
    Write-Host "  Check the task: Task Scheduler (taskschd.msc) → ChoreCoin" -ForegroundColor DarkGray
    Write-Host "  Troubleshooting: https://chore-coin.app/install-guide.html#trouble" -ForegroundColor DarkGray
    exit 1
}
