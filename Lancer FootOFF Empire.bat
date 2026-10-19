@echo off
chcp 65001 >nul
title FootOFF Empire
cd /d "%~dp0"

echo.
echo   FootOFF Empire - lancement en local
echo   -----------------------------------

where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js est introuvable. Installe-le depuis https://nodejs.org puis relance ce fichier.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo   Premiere utilisation : installation des dependances...
  call npm install
  if errorlevel 1 (
    echo   L'installation a echoue.
    pause
    exit /b 1
  )
)

echo   Le jeu s'ouvre dans ton navigateur : http://localhost:5173
echo   Pour arreter le jeu, ferme cette fenetre.
echo.
call npm run dev -- --port 5173 --open
pause
