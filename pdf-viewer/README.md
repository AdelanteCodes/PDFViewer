# PDF Viewer, 0.4 Beta — browser edition

This page is a static, phone-friendly edition of PDF Viewer. It uses PDF.js for PDF text, Tesseract.js for English OCR on scanned pages, and SheetJS/jsPDF for exports. Those libraries are fetched from public CDNs. PDF files are read in the visitor's browser and are not uploaded to this website.

Open `index.html` from a static HTTPS host. Test with recent iPhone Safari and Android browsers. Large PDFs and OCR may be limited by device memory and speed.

AWB extraction adds shipment, cargo, charge and full-text views while retaining the existing billing and general PDF views. Additional pages provide Excel combining, PDF page tools, conversions, encryption and an editor. See [FEATURES.md](FEATURES.md) for usage, tested coverage and conversion limits.

The updated Windows source is in `windows/` and `PDF-Viewer-0.4-Beta-Windows.zip`. The original 0.3 archive remains available unchanged. Build the new archive with `python scripts/package_windows.py` from the repository root.

