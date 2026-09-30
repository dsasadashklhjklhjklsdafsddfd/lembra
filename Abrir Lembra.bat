@echo off
rem Dois cliques aqui abrem o Lembra no navegador.
cd /d "%~dp0"
where python >nul 2>nul
if not errorlevel 1 (
  start "Lembra" /min python serve.py
  exit /b
)
where py >nul 2>nul
if not errorlevel 1 (
  start "Lembra" /min py serve.py
  exit /b
)
echo.
echo  O Python nao esta instalado neste computador.
echo  Instale em https://www.python.org/downloads/
echo  e marque a opcao "Add python.exe to PATH" na instalacao.
echo.
pause
