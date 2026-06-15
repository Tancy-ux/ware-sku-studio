@echo off
title ware SKU Studio

echo.
echo  ==========================================
echo    ware SKU Studio
echo  ==========================================
echo.

:: Install dependencies silently on first run
pip install -r requirements.txt --quiet 2>nul

:: Wait a moment then open Chrome automatically
start "" /B timeout /t 2 /nobreak >nul && start chrome "http://localhost:5050"

:: Start the server
python app.py

pause
