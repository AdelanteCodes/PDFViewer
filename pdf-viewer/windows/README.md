# PDF Viewer, 0.4 Beta

The browser edition works on current mobile browsers, including iPhone Safari. It processes PDFs locally in the browser; PDF contents are not uploaded to the website. Scanned-page OCR and very large files can be slow or limited by the phone's available memory. The Windows edition below remains available for offline processing.

Double-click **Start Viewer.bat**. A browser tab opens automatically. Keep the launcher window open while using the viewer; press Ctrl+C in it to stop cleanly.

## Using the viewer

1. Choose a PDF up to **100 MiB (104,857,600 bytes)**. Enter its password if needed and click **Read PDF**.
2. Watch upload and page-processing progress. **Cancel** stops processing; uploading a replacement also clears the previous document.
3. Choose **Airline billing records**, a detected **Table**, or **Page text**. Different table columns produce separate views; identical headings are grouped across pages.
4. All fields are selected by default. Use **Select all** or untick individual fields. Use airline filters, **Find a ticket**, or **Search text**.
5. Click a column heading to sort ascending, then descending. **Original order** clears sorting. Blank values stay last. **All** displays every matching row; smaller page sizes are available for large results.
6. Click a source page to inspect it in the original PDF. An encrypted preview may ask for the PDF password again.
7. **Export PDF** and **Export Excel** include all matching rows (not only the visible page), exactly the selected columns, and the selected sort order.

## Mobile browser edition

Visit `https://bhavyam.shop/pdf-viewer/`. The browser edition uses PDF.js and English Tesseract OCR in the browser. Supporting libraries are loaded from public CDNs; the selected PDF stays on the device. iPhone Safari and Android browsers are supported by the responsive layout. Browser memory and device speed can limit very large PDFs, especially scanned documents. Its source is in the `pdf-viewer/` folder of the website's GitHub repository.

## Documents and OCR

Recognized IATA FCAIBILLDET reports retain their specialized billing fields. Ordinary PDFs expose detected table columns and searchable page text. Text pages are read directly; scanned or image-heavy pages use English Tesseract OCR when available. Mixed documents use both methods page by page. Scanned tables are reconstructed from visible ruling or repeated aligned columns when possible. Review OCR results against their source pages. Handwriting, uncommon encodings, complex layouts, and non-English OCR are not guaranteed.

For scanned PDFs, run **Setup OCR.bat** once if the viewer reports OCR unavailable. This installs the Tesseract Windows package through winget; the installer may require Windows administrator approval. English language data must be present. For a custom installation, set the `TESSERACT_CMD` environment variable to `tesseract.exe`. Installation may need internet, but PDF processing does not use an online service. If OCR is unavailable, native text pages still work and scanned pages are explicitly flagged.

**Find a ticket** matches direct and related ticket numbers in the airline view, ignoring spaces and hyphens. It also accepts an airline-prefixed 13-digit number when that airline code matches the report. In general documents it searches the current table or text view; choose **Page text** to search the entire document. **Search text** performs a case-insensitive literal search of the current view. Identifiers remain text, amounts sort numerically, and identified date columns sort chronologically. Recognized numeric date formats use day/month/year; ambiguous unrecognized date columns remain text.

## Exports

Excel files contain typed numbers and recognized dates, text document identifiers, frozen headings, and filters. Document text is never interpreted as an Excel formula. PDF exports wrap long values and repeat headings. Wide selections are divided into groups of up to five fields with matching row numbers. Page text is split into chunks of up to 6,000 characters without discarding content. Exports contain source filename, active filters, and sorting. General-document exports do not label arbitrary amounts as INR. Extremely large Excel selections must fit Excel's row limit.

The airline report's printed summary may cover more pages than the uploaded file. Selected totals use only extracted billing records. Blank financial amounts are unavailable, not zero.

## Privacy and setup

The server listens only on `127.0.0.1`. Uploads are streamed to an app-owned `.runtime/session-...` folder. Input PDFs and OCR images are removed after processing; extracted results stay in memory until replacement, cancellation, an hour of inactivity, or shutdown. Close the viewer tab or use Cancel to release its document. A forced process termination can leave a session folder; these folders contain temporary processing data and can be removed when no viewer instance is running. Passwords are used for processing and are never written to disk.

This computer uses its bundled Python runtime. On another computer install Python 3.10+ with Add to PATH enabled; the launcher installs missing dependencies from `requirements.txt` on first use. You can also run `python -m pip install -r requirements.txt` and then `python app.py`.

## Local API

The browser uses `POST /upload` with a raw PDF body, `Content-Type: application/pdf`, URL-encoded `X-Filename` and optional `X-PDF-Password` headers. An optional `X-Upload-ID` (32 random lowercase hexadecimal characters) allows cancellation before upload completes; otherwise the server generates it. The response is `202 {id}`. `GET /jobs/{id}` supplies processing status and view metadata. `GET /jobs/{id}/records` accepts dataset, ticket, query, agency, type, from, to, sort, direction, offset, and limit parameters. `POST /jobs/{id}/cancel` releases the document. Export endpoints accept JSON with job, dataset, selected fields, filters, and sort parameters; rows come from server-held results. The random job ID is the document's local access token. This API replaces the previous synchronous multipart upload and client-supplied export rows.

## Added in 0.4

AWB PDFs add shipment, cargo, charge and full-text views. The existing billing reader remains available. Additional local browser pages provide Excel combining and PDF tools; those pages download supporting libraries from CDNs. Review extracted fields against the original for unfamiliar layouts. See the website's FEATURES.md for full tool coverage and limits.
