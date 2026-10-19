# Professional editor feature coverage

Reviewed 19 October 2026 against vendor public feature inventories. These products are references for workflows, not bundled SDKs or a claim of complete parity. Feature families below aggregate many vendor commands; this is not a command-by-command certification.

Sources: [Acrobat](https://www.adobe.com/acrobat/features.html), [PDF-XChange Editor v10](https://help.pdf-xchange.com/pdfxe10/features-overview_ed.html), [PDFgear](https://www.pdfgear.com/).

| Feature family | Website status | Scope / remaining work |
|---|---|---|
| View, navigate, zoom, thumbnails, page selection | Implemented | Bounded canvases; laptop primary, phone layout |
| Edit native text / fonts | Limited | Reuses original embedded font glyphs or exact standard PDF face; missing glyphs stop export. Explicit replacement faces available. Horizontal spans only; no paragraph reflow, font identification from scans, arbitrary typesetting, or mixed-font paragraph editing |
| Images and vector objects | Limited / pending | Added images movable/resizable. Arbitrary original image/path editing remains pending |
| Stamps | Implemented within scope | Auto-saved thumbnail library, name/text/color/image updates, single placement then select/move/resize, right-click Delete, touch Delete, undo/redo. New stamps save as editable PDF Stamp annotations and reopen here. Preexisting flattened stamps cannot be separated automatically. Redaction/scan flattening can bake stamps |
| Page manipulation, merging and splitting | Implemented / limited | Existing catalog and workflow matrix apply |
| Compression and OCR | Limited | Local QPDF, image compression, bounded OCR languages/models. Not industrial OCR or guaranteed identical typography |
| Annotations and comments | Limited | Text, ink, highlight, notes, shapes and editable stamps. Full comment collaboration, multimedia and XFDF/FDF exchange remain pending |
| Forms | Limited | Existing field filling and basic field creation. XFA, calculations, dynamic validation and certificate field workflows remain pending |
| Document comparison | Limited | New extracted-text comparison by page and JSON report; no graphical/format difference detection |
| AI assistance | Limited | Optional small on-device semantic model, source-linked excerpts, extractive summaries and deterministic tool suggestions. Not a generative chatbot, translator, autonomous editor or fact verifier. English focused, explicit passage/page bounds |
| Redaction and passwords | Limited | Existing tested raster redaction and local password operations. Whiteout is visual only. Complete hidden-data sanitization and signature validation remain pending |
| Office and image conversions | Limited | Precise fidelity limits remain in features.html; no full Office layout reconstruction |
| Bookmarks, headers, watermarks, numbering, batches | Implemented / limited | Existing bounded browser workflows; see matrix |
| AWB, airline billing and Excel combining | Implemented / limited | Specialized existing parsers retained; unfamiliar layouts need review |
| PDF/A, PDF/X, tagged-PDF remediation, preflight | Pending | No compliance claim without validators and output checks |
| Measurement, CAD, 3D, layers and portfolios | Pending | No speculative buttons |
| Cryptographic signatures / trust / e-sign collection | Pending / outside browser-only release | Visual signatures are not certificate signatures; hosted signing/accounts remain excluded |
| Printing drivers, cloud accounts, review servers | Outside browser-only release | OS drivers and server-backed collaboration are not GitHub Pages features |

Physical Android/iPhone testing and independent Windows Chrome/Edge/Safari checks remain pending. No claim that every feature from all three products is implemented.
