@echo off
REM ============================================================================
REM EduFlow - Script d'installation express (Self-Hosted / Docker) - Windows
REM ============================================================================
REM Usage :  scripts\setup-self-hosted.bat
REM
REM Automatise :
REM   1. La verification de Docker + docker compose ;
REM   2. La creation du fichier .env.docker (a partir de .env.docker.example) ;
REM   3. Le remplacement des secrets critiques (openssl ou fallback %RANDOM%) ;
REM   4. Le build + demarrage de la stack (docker compose up -d --build).
REM ============================================================================
setlocal EnableDelayedExpansion
set "ROOT=%~dp0.."
cd /d "%ROOT%"
set "ROOT=%CD%"
set "ENV_FILE=%ROOT%\.env.docker"
set "EXAMPLE_FILE=%ROOT%\.env.docker.example"

echo [eduflow:setup] Installation express EduFlow (Self-Hosted / Docker)
echo.

REM ---------------------------------------------------------------------------
REM 1. Verification de Docker
REM ---------------------------------------------------------------------------
where docker >nul 2>&1
if errorlevel 1 (
  echo [eduflow:setup] ERREUR : Docker n'est pas installe. Installez depuis https://docker.com
  exit /b 1
)
docker info >nul 2>&1
if errorlevel 1 (
  echo [eduflow:setup] ERREUR : Docker ne repond pas ^(service demarre ?^)
  exit /b 1
)
docker compose version >nul 2>&1
if errorlevel 1 (
  echo [eduflow:setup] ERREUR : docker compose introuvable ^(Docker 24.0+ requis^)
  exit /b 1
)
echo [eduflow:setup] Docker pret
echo.

REM ---------------------------------------------------------------------------
REM 2. Fichier .env.docker
REM ---------------------------------------------------------------------------
if exist "%ENV_FILE%" (
  echo [eduflow:setup] Un fichier .env.docker existe deja - il ne sera PAS ecrase.
) else (
  if not exist "%EXAMPLE_FILE%" (
    echo [eduflow:setup] ERREUR : Modele .env.docker.example introuvable.
    exit /b 1
  )
  copy /Y "%EXAMPLE_FILE%" "%ENV_FILE%" >nul
  echo [eduflow:setup] Modele copie - .env.docker cree.
)

REM Generation / remplacement des secrets critiques (subroutines pour eviter
REM les ambiguities de parenthèses dans les blocs if/for).
call :maybe_replace_secret "POSTGRES_PASSWORD=CHANGEZ_MOI_MOT_DE_PASSE_FORT" "POSTGRES_PASSWORD"
call :maybe_replace_secret "AUTH_SECRET=CHANGEZ_MOI_AUTH_SECRET_64_HEX" "AUTH_SECRET"

echo.
echo [eduflow:setup] IMPORTANT : editez maintenant .env.docker pour renseigner :
echo   - LICENSE_PUBLIC_KEY   ^(cle Ed25519 de votre plateforme^)
echo   - NEXT_PUBLIC_APP_URL  ^(URL publique http://^<ip^>:3000^)
echo Appuyez sur une touche pour continuer...
pause >nul

REM ---------------------------------------------------------------------------
REM 3. Build + demarrage de la stack
REM ---------------------------------------------------------------------------
echo [eduflow:setup] Construction et demarrage (docker compose up -d --build) ...
docker compose --env-file "%ENV_FILE%" up -d --build
if errorlevel 1 (
  echo [eduflow:setup] ERREUR : le build ou le demarrage a echoue.
  exit /b 1
)

echo.
echo [eduflow:setup] EduFlow est en ligne. Services :
docker compose --env-file "%ENV_FILE%" ps

set "APP_PORT=3000"
for /f "usebackq tokens=2 delims==" %%A in (`findstr /B /C:"APP_PORT=" "%ENV_FILE%"`) do set "APP_PORT=%%A"

echo.
echo [eduflow:setup] Accedez a l'application : http://localhost:%APP_PORT%
echo [eduflow:setup] Documentation complete : docs\SELF_HOSTED.md
endlocal
exit /b 0

REM ===========================================================================
REM Sous-routines
REM ===========================================================================

REM Remplace la ligne <needle> par <VAR>=<generated> si le placeholder est
REM encore present. Generation : openssl (recommande) ou %RANDOM% (fallback).
:maybe_replace_secret
set "NEEDLE=%~1"
set "VAR=%~2"
findstr /C:"%NEEDLE%" "%ENV_FILE%" >nul 2>&1
if errorlevel 1 (
  echo [eduflow:setup] %VAR% : deja personnalise.
  exit /b 0
)
set "USE_OPENSSL=0"
where openssl >nul 2>&1 && set "USE_OPENSSL=1"
if "%USE_OPENSSL%"=="1" (
  if "%VAR%"=="POSTGRES_PASSWORD" (
    for /f "delims=" %%P in ('openssl rand -base64 12') do set "NEW_VALUE=%%P"
  ) else (
    for /f "delims=" %%P in ('openssl rand -hex 32') do set "NEW_VALUE=%%P"
  )
) else (
  set "NEW_VALUE=%RANDOM%%RANDOM%%RANDOM%%RANDOM%%RANDOM%%RANDOM%%RANDOM%%RANDOM%"
)
call :write_env_line "%VAR%" "%NEW_VALUE%"
echo [eduflow:setup] %VAR% : genere aleatoirement.
exit /b 0

REM Ecrase la ligne <VAR>=... par <VAR>=<VALUE> via PowerShell.
:write_env_line
set "WVAR=%~1"
set "WVAL=%~2"
powershell -NoProfile -NonInteractive -Command "(Get-Content '%ENV_FILE%') -replace ('^' + '%WVAR%' + '=.*'), ('%WVAR%' + '=' + '%WVAL%') ^| Set-Content '%ENV_FILE%'"
exit /b 0
