# PDF Viewer 0.4 Beta

The existing billing parser, tables, filters, sorting and exports remain available. All tools process files locally. Browser libraries download from public CDNs; document contents are not uploaded by this application.

## AWBs

Open a PDF as before. Recognized air waybills add **Air waybills**, **AWB details and full text**, **AWB cargo lines**, and **AWB charge breakdown** views. Choose fields, search by AWB number, sort and export the selected view to PDF or Excel. The full extracted page text is always retained. The details view also retains additional colon-labelled values. Scans use English OCR.

The parser uses labels and relative word positions instead of fixed customers, routes, amounts or filenames. It supports common IATA forms and simpler labelled house/master AWBs. Unrecognized layouts may leave fields blank or require checking against the original. It does not infer values that are absent. Multiple AWB pages remain separate source records; duplicate shipper/carrier copies are not silently deduplicated. Only the supplied layout and synthetic variants have been tested so far; this is not a claim of universal AWB recognition.

## Combine spreadsheets

Choose multiple XLSX, XLS, XLSM, XLSB, ODS or CSV files, then read them. Select worksheets and the heading row for each sheet. Preview before downloading. The default appends rows and aligns columns by case-insensitive headings; unmatched columns remain present. Duplicate headings receive unique names. Optional source filename and worksheet columns identify each row without overwriting existing columns. Alternatively keep each sheet in a separate tab.

Combining copies **values**, including saved formula results, dates and text identifiers. It does not recalculate formulas or retain macros, formatting, charts or workbook links. A formula with no cached result, or an existing spreadsheet error, produces an error rather than silently dropping a value. Each file is limited to 50 MiB, the combined input to 100 MiB, and each imported worksheet to 200,001 rows / 2,001 columns to bound browser memory. CSV cells are read as text to preserve identifiers. Very large workbooks can still exceed phone memory.

## PDF tools

The tool inventory was compared with [Sejda's tools and editor](https://www.sejda.com/). This is an independent implementation; it does not upload files to Sejda or use Sejda code.

| Area | Implemented tools |
| --- | --- |
| Merge | Combine PDFs, alternate/mix pages, reorder and duplicate pages, file ordering |
| Split | Extract/delete pages, split by page groups, top-level bookmarks, size, matching text, or half-page |
| Layout | Rotate, crop visible margins, resize/add margins, mirror, N-up |
| Stamp | Page numbers, Bates numbering, headers/footers, text watermark |
| Metadata | Edit title/author/subject/keywords, create bookmarks, rename from text |
| Security | AES-256 password protection, unlock using supplied password, remove annotations, flatten form fields |
| Scans | Lossless recompression, lossy scan compression, grayscale, automatic/manual deskew, English searchable OCR, QPDF repair |
| Convert from PDF | Excel through the viewer; text; JPG/PNG/TIFF page images; embedded image extraction; reflowed Word text; PowerPoint page images |
| Convert to PDF | Images, DOCX text flow, local HTML text flow |
| Editor | Text with style/color/size, drawn/typed/image signatures, images, shapes, highlight, strikeout, comments, links, whiteout, redaction, visible text replacement, undo, select/move/resize added objects |
| Forms | Fill existing text/check/dropdown/radio fields; create text, multiline, checkbox, dropdown and radio fields |

### Deliberate limits

- This is not feature-identical to Sejda. Office conversion does not reconstruct the original editable layout. DOCX/HTML input converts text only. PPTX output uses page images, not editable slide objects. HTML-to-PDF does not fetch arbitrary website URLs.
- Text replacement rebuilds affected pages as images. It removes original text on those pages, does not reflow other content, and flattens existing form fields in the document. Region redaction uses the same page rebuilding process. Whiteout and cropping are visual operations, not secure redaction.
- Merging, splitting, reordering and page embedding flatten existing forms to preserve their visible values. The editor preserves interactive fields when no raster replacement/redaction is used.
- The editor and text-to-PDF use standard PDF fonts; unsupported scripts may not render correctly or may produce a font-encoding error. English OCR is the supported recognition language. Drawn/typed signatures are visual marks, not cryptographic certificate signatures.
- Lossless compression cannot promise a smaller file. Repair is best effort. Automatic deskew estimates angles up to five degrees and may need manual adjustment on complex layouts. Image-based tools remove selectable text and interactive objects. Use OCR afterward if needed.
- PDF signing with certificates, cloud storage integrations, original embedded-image editing and full-fidelity Word/HTML/PowerPoint layout conversion are not implemented. No placeholder tool claims to provide them.

## Phones and Windows

Responsive browser layouts and touch pointer input are used for Android and iPhone. Tests cover desktop Chromium and phone-sized browser viewports; physical Android Chrome and iPhone Safari testing has not yet been performed. Browser memory, OS download handling and older Safari versions remain practical limits. The application includes a `Promise.withResolvers` compatibility shim for PDF.js.

The Windows ZIP includes offline Python AWB extraction in addition to the existing reader, plus the browser tools served locally. The additional tools still need an internet connection to load their CDN libraries. The original 0.3 archive is retained; the 0.4 archive is built from `windows/` by `scripts/package_windows.py`.

## Development and validation

Run `npm install --ignore-scripts`, then `npm test`. Run `python -m unittest discover -s tests -p "test_*.py"` for the pure Windows AWB tests. The Windows reader's dependencies are in `windows/requirements.txt`.

Local tests include AWB extraction on the supplied file (not committed), numeric values and leading-zero identifiers in exports, differently ordered spreadsheet columns, form values and new fields, text replacement, encryption/decryption, OCR text, archive contents and conversions. Synthetic fixtures are generated by `tests/build-fixtures.mjs`. Browser smoke tests cover every PDF tool, but do not establish correctness for every possible PDF layout. No customer documents or extracted personal data belong in the repository.
