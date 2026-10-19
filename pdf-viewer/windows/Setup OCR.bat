@echo off
echo Installing the English Tesseract OCR engine for offline scanned PDF reading.
echo Windows may request permission to install the OCR application.
where winget >nul 2>nul
if errorlevel 1 goto manual
winget install --id UB-Mannheim.TesseractOCR --exact --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
if errorlevel 1 goto manual
echo OCR installation finished. Restart the viewer and upload your PDF again.
goto done
:manual
echo Install Tesseract for Windows from https://github.com/UB-Mannheim/tesseract/wiki
echo Include the English language data. The viewer detects the default install folder.
echo For a custom location, set TESSERACT_CMD to the full path of tesseract.exe.
:done
pause
