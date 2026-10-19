# Third-party components

The website ships pinned browser modules in `vendor/`. `vendor-lock.json` records source URLs and both upstream and vendored SHA-256 hashes. Transitive imports were rewritten to local files and source-map references removed; library behavior is otherwise unmodified. License texts and a transitive package manifest are included in `vendor/licenses/`. For dual-licensed packages, this distribution uses MIT or Apache-2.0 where offered. OCR core and language models download on demand from the pinned Tesseract runtime and model hosts. No paid SDK is included.

| Component | Version | License | Source |
| --- | --- | --- | --- |
| PDF.js | 4.10.38 | Apache-2.0 | https://github.com/mozilla/pdf.js |
| pdf-lib | 1.17.1 | MIT | https://github.com/Hopding/pdf-lib |
| SheetJS CE | 0.20.3 | Apache-2.0 | https://git.sheetjs.com/sheetjs/sheetjs |
| jsPDF | 2.5.2 | MIT | https://github.com/parallax/jsPDF |
| Tesseract.js | 5.1.1 | Apache-2.0 | https://github.com/naptha/tesseract.js |
| JSZip | 3.10.1 | MIT (alternative license offered upstream) | https://github.com/Stuk/jszip |
| docx | 9.1.1 | MIT | https://github.com/dolanmiu/docx |
| PptxGenJS | 3.12.0 | MIT | https://github.com/gitbrent/PptxGenJS |
| Mammoth | 1.8.0 | BSD-2-Clause | https://github.com/mwilliamson/mammoth.js |
| UTIF.js | 3.1.0 | MIT | https://github.com/photopea/UTIF.js |
| qpdf-wasm-esm-embedded | 1.1.1 | Apache-2.0 | https://github.com/sharevb/qpdf-wasm-esm |

The Windows reader continues using pdfplumber, openpyxl, ReportLab, pypdfium2, Pillow and NumPy, with optional Tesseract installed separately. These dependencies are obtained from their package distributions; their upstream notices apply.

## Rebuilding

Run `python scripts/vendor_browser.py` to rebuild and verify locked upstream bytes. An upstream checksum mismatch stops the build and requires review. Run `python scripts/vendor_licenses.py` to collect upstream notices. `python scripts/check_browser_build.py` verifies committed assets without network access. Modules originally referenced by versionless transitive URLs are frozen by their checked-in bytes and hashes; their resolved versions are recorded in each module header and the license manifest.

SheetJS disclosure: Copyright (C) 2012-present SheetJS LLC. Licensed under the Apache License, Version 2.0. See `vendor/licenses/xlsx@0.20.3.txt` and https://docs.sheetjs.com/docs/miscellany/license/.
