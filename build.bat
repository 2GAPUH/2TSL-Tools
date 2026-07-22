@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

rem ============================================================
rem  2TSL toolbox - build ZIP for Chrome extension install
rem  Only runtime files are packed (no docs, dumps, analytics).
rem ============================================================

echo.
echo === 2TSL toolbox: build archive ===
echo.

rem --- Find 7-Zip ---
set "SEVENZ="
if exist "%ProgramFiles%\7-Zip\7z.exe" set "SEVENZ=%ProgramFiles%\7-Zip\7z.exe"

if not defined SEVENZ (
  set "PF86=%ProgramFiles(x86)%"
  if exist "!PF86!\7-Zip\7z.exe" set "SEVENZ=!PF86!\7-Zip\7z.exe"
)

if not defined SEVENZ (
  if exist "%LOCALAPPDATA%\Programs\7-Zip\7z.exe" set "SEVENZ=%LOCALAPPDATA%\Programs\7-Zip\7z.exe"
)

if not defined SEVENZ (
  where 7z.exe >nul 2>&1
  if not errorlevel 1 set "SEVENZ=7z.exe"
)

if not defined SEVENZ (
  where 7za.exe >nul 2>&1
  if not errorlevel 1 set "SEVENZ=7za.exe"
)

if not defined SEVENZ (
  echo [ERROR] 7-Zip not found.
  echo Install 7-Zip or add 7z.exe to PATH.
  echo Expected: %%ProgramFiles%%\7-Zip\7z.exe
  exit /b 1
)

echo [OK] 7-Zip: %SEVENZ%

rem --- Version from manifest.json ---
set "VERSION="
for /f "usebackq tokens=2 delims=:" %%A in (`findstr /R /C:"\"version\"" "manifest.json"`) do (
  if not defined VERSION set "VERSION=%%~A"
)
if defined VERSION (
  set "VERSION=!VERSION: =!"
  set "VERSION=!VERSION:,=!"
  set "VERSION=!VERSION:"=!"
)

if not defined VERSION (
  echo [ERROR] Cannot read version from manifest.json
  exit /b 1
)

echo [OK] Version: %VERSION%

rem --- Paths ---
set "OUT_DIR=%~dp0dist"
set "STAGE_DIR=%OUT_DIR%\_stage"
set "ZIP_NAME=2TSL-toolbox-v%VERSION%.zip"
set "ZIP_PATH=%OUT_DIR%\%ZIP_NAME%"

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

if exist "%STAGE_DIR%" rmdir /s /q "%STAGE_DIR%"
mkdir "%STAGE_DIR%"
mkdir "%STAGE_DIR%\icons"
mkdir "%STAGE_DIR%\omnichat"

echo.
echo Copying extension files...

call :copy_req "manifest.json"
if errorlevel 1 goto :fail
call :copy_req "background.js"
if errorlevel 1 goto :fail
call :copy_req "analytics.js"
if errorlevel 1 goto :fail
call :copy_req "cloud-sync.js"
if errorlevel 1 goto :fail
call :copy_req "popup.html"
if errorlevel 1 goto :fail
call :copy_req "popup.js"
if errorlevel 1 goto :fail
call :copy_req "popup-import-export.js"
if errorlevel 1 goto :fail
call :copy_req "import-export.html"
if errorlevel 1 goto :fail
call :copy_req "import-export-page.js"
if errorlevel 1 goto :fail
call :copy_req "content-accounting.js"
if errorlevel 1 goto :fail
call :copy_req "content-form.js"
if errorlevel 1 goto :fail
call :copy_req "content-grafana.js"
if errorlevel 1 goto :fail
call :copy_req "content-onyma.js"
if errorlevel 1 goto :fail
call :copy_req "content-sipal.js"
if errorlevel 1 goto :fail
call :copy_req "content-ssh.js"
if errorlevel 1 goto :fail
call :copy_req "content-ttm.js"
if errorlevel 1 goto :fail
call :copy_req "content-volgahelp.js"
if errorlevel 1 goto :fail
call :copy_req "content-argus-theme.js"
if errorlevel 1 goto :fail
call :copy_req "argus-dark.css"
if errorlevel 1 goto :fail
call :copy_req "content-axiros-theme.js"
if errorlevel 1 goto :fail
call :copy_req "axiros-dark.css"
if errorlevel 1 goto :fail

for %%F in (
  namespace.js
  state.js
  constants.js
  utils.js
  draft-insert.js
  ttm-links.js
  templates-modal.js
  init.js
) do (
  call :copy_req "omnichat\%%F"
  if errorlevel 1 goto :fail
)

if not exist "icons\" (
  echo [ERROR] icons folder not found
  goto :fail
)
xcopy /E /I /Y /Q "icons\*" "%STAGE_DIR%\icons\" >nul
if errorlevel 1 (
  echo [ERROR] Failed to copy icons
  goto :fail
)
echo   + icons\

echo.
echo Packing: %ZIP_NAME%

if exist "%ZIP_PATH%" del /f /q "%ZIP_PATH%"

pushd "%STAGE_DIR%"
"%SEVENZ%" a -tzip -mx=9 "%ZIP_PATH%" *
set "ZIP_ERR=!errorlevel!"
popd

if not "!ZIP_ERR!"=="0" (
  echo [ERROR] 7-Zip exit code: !ZIP_ERR!
  goto :fail
)

rmdir /s /q "%STAGE_DIR%"

for %%A in ("%ZIP_PATH%") do set "ZIP_SIZE=%%~zA"

echo.
echo === Done ===
echo Archive: %ZIP_PATH%
echo Size:    %ZIP_SIZE% bytes
echo.
echo Excluded: README, AI_CONTEXT, about, xlsx, .gs, scripts,
echo           systems-html, agent-tools, terminals, .git,
echo           content-userinfo.js, build.bat
echo.
exit /b 0

:fail
if exist "%STAGE_DIR%" rmdir /s /q "%STAGE_DIR%"
echo.
echo Build failed.
exit /b 1

:copy_req
if not exist "%~1" (
  echo [ERROR] Missing file: %~1
  exit /b 1
)
copy /Y "%~1" "%STAGE_DIR%\%~1" >nul
if errorlevel 1 (
  echo [ERROR] Copy failed: %~1
  exit /b 1
)
echo   + %~1
exit /b 0
