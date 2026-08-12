@echo off
REM Chore Coin - Windows double-click launcher.
REM
REM This is a Windows batch file. Double-click it to run the Chore Coin
REM installer. A command window will pop up and walk you through the setup.
REM
REM What it does:
REM   1. Shows a welcome message and asks for your license key.
REM   2. Downloads and runs install.ps1 (the real Windows installer).
REM   3. install.ps1 fetches the Chore Coin binary, verifies it, installs
REM      it to your AppData folder, and registers it to run at every logon.
REM
REM You will likely see a "Windows protected your PC" SmartScreen warning
REM the first time. That's Windows being cautious about any file downloaded
REM from the internet. To bypass:
REM   1. Click "More info"
REM   2. Click "Run anyway"
REM After you allow it once, you can double-click normally forever.
REM
REM For the full guide: https://chore-coin.app/install-guide.html

setlocal
title Chore Coin Installer

REM Change to the folder this launcher lives in so companion files are found.
cd /d "%~dp0" 2>nul

cls
echo.
echo   ================================================================
echo    Chore Coin - Windows Installer
echo   ================================================================
echo.
echo   This will download and install Chore Coin on this computer.
echo   It takes about 30 seconds.
echo.
echo   When done, Chore Coin will start automatically every time you
echo   log in to Windows. Everything after this is in your web browser.
echo.
echo   More detail: https://chore-coin.app/install-guide.html
echo.
echo   Press any key to begin, or close this window to cancel.
pause >nul

echo.
echo   ----------------------------------------------------------------
echo    Step 1 of 2 - License key
echo   ----------------------------------------------------------------
echo.

REM If a companion license.txt sits next to this launcher, read it.
set "LICENSE="
if exist "%~dp0license.txt" (
    set /p LICENSE=<"%~dp0license.txt"
    echo   Found license key in companion license.txt file:
    echo     %LICENSE%
    echo.
)

if not defined LICENSE (
    echo   Copy your license key from your Chore Coin purchase email.
    echo   It looks like: CHRC-XXXX-XXXX-XXXX-XXXX
    echo.
    set /p LICENSE="  License key: "
    echo.
)

REM Strip whitespace and uppercase using PowerShell (batch string handling is awful)
for /f "usebackq delims=" %%L in (`powershell -NoProfile -Command "$k='%LICENSE%'.Trim().ToUpper() -replace '\s',''; Write-Output $k"`) do set "LICENSE=%%L"

if "%LICENSE%"=="" (
    echo   No license key provided - cancelling.
    echo.
    echo   Press any key to close this window.
    pause >nul
    exit /b 1
)

echo   ----------------------------------------------------------------
echo    Step 2 of 2 - Installing Chore Coin
echo   ----------------------------------------------------------------
echo.
echo   Downloading and running the installer...
echo.

REM Hand off to install.ps1. We fetch it fresh from the repo so users always
REM get the latest install logic. -ExecutionPolicy Bypass is scoped to this
REM one process and does not change any system settings.
set "CHORECOIN_LICENSE=%LICENSE%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:CHORECOIN_LICENSE='%LICENSE%'; iwr -UseBasicParsing https://raw.githubusercontent.com/danielhemp/chore-coin/main/install.ps1 | iex"
set "STATUS=%ERRORLEVEL%"

echo.
if "%STATUS%"=="0" (
    echo   All done. You can close this window.
    echo.
    echo   Follow the Step-by-step guide link above to finish setup
    echo   in your browser ^(create your admin + first parent account^).
) else (
    echo   Something didn't finish cleanly. See the error above,
    echo   or check the troubleshooting section of the install guide:
    echo   https://chore-coin.app/install-guide.html#trouble
)
echo.
echo   Press any key to close this window.
pause >nul
endlocal
