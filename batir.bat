@echo off
setlocal enabledelayedexpansion

REM =========================================================
REM SABİTLER
REM =========================================================
set "REPO=C:\Users\salih\Desktop\33"
set "GITDIR=%REPO%\.git"
set "BACKUPROOT=C:\Users\salih\Desktop\33ESKI"
set "COMMIT=d1d153f"

REM =========================================================
REM 1) KONTROLLER
REM =========================================================
if not exist "%GITDIR%" (
  echo HATA: %GITDIR% bulunamadi.
  goto :eof
)

if defined GITHUB_TOKEN (
  echo GITHUB_TOKEN var
) else (
  echo UYARI: GITHUB_TOKEN yok
)

git --git-dir="%GITDIR%" --work-tree="%REPO%" remote -v
git --git-dir="%GITDIR%" --work-tree="%REPO%" fetch origin

REM =========================================================
REM 2) YEDEK (33ESKI\1,2,3...)
REM =========================================================
if not exist "%BACKUPROOT%" mkdir "%BACKUPROOT%"

set N=1
:findslot
if exist "%BACKUPROOT%\!N!" (
  set /a N+=1
  goto findslot
)

mkdir "%BACKUPROOT%\!N!"
echo Yedek klasoru: %BACKUPROOT%\!N!

xcopy "%REPO%\*" "%BACKUPROOT%\!N!\" /E /I /H /Y >nul
echo Yedekleme tamamlandi.

REM =========================================================
REM 3) SADECE REPO KOK DOSYALARINI GUNCELLE (.git'e YAZMAZ)
REM =========================================================
git --git-dir="%GITDIR%" --work-tree="%REPO%" show %COMMIT%:bundle.js > "%REPO%\bundle.js"
git --git-dir="%GITDIR%" --work-tree="%REPO%" show %COMMIT%:sw.js     > "%REPO%\sw.js"

echo.
echo Tamam: Sadece su dosyalar guncellendi:
echo   %REPO%\bundle.js
echo   %REPO%\sw.js
echo.

REM =========================================================
REM 4) KONTROL
REM =========================================================
git --git-dir="%GITDIR%" --work-tree="%REPO%" status --short
git --git-dir="%GITDIR%" --work-tree="%REPO%" diff --name-only

endlocal
