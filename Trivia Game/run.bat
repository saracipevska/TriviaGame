@echo off
title Trivia Game

echo.
echo  Installing / checking dependencies...
pip install -r requirements.txt --quiet

echo.
echo  Starting Trivia Game server...
echo  Open your browser and go to: http://localhost:5000
echo.

python app.py
pause
