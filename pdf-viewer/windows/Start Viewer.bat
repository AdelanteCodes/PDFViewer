@echo off
cd /d "%~dp0"
set "VIEWER_PY=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if exist "%VIEWER_PY%" goto bundled
where python >nul 2>nul
if errorlevel 1 goto missing
python -c "import pdfplumber, openpyxl, reportlab, pypdfium2, PIL, numpy" >nul 2>nul
if errorlevel 1 python -m pip install -r requirements.txt
if errorlevel 1 goto failed
python app.py
goto done
:bundled
"%VIEWER_PY%" -c "import pdfplumber, openpyxl, reportlab, pypdfium2, PIL, numpy" >nul 2>nul
if errorlevel 1 "%VIEWER_PY%" -m pip install -r requirements.txt
if errorlevel 1 goto failed
"%VIEWER_PY%" app.py
goto done
:missing
echo Python 3.10 or newer is required. Install Python from python.org and enable Add to PATH.
goto done
:failed
echo Could not install the required packages. Check your internet connection and try again.
:done
pause
