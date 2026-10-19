# PDF Viewer

Standalone source repository for the dark browser PDF workspace, extracted from ShopPage.

**[Open PDF Viewer](https://bhavyam.shop/pdf-viewer/)** · [Feature coverage](pdf-viewer/FEATURES.md) · [Editing limitations](pdf-viewer/EDITOR-COVERAGE.md)

The stable browser release is **0.5**. The 0.6 Beta inline editing and font work remains in progress and is not included in this repository migration.

## Layout

- `pdf-viewer/`: application, pinned browser libraries, component licenses, and existing Windows ZIP downloads.
- `tests/`: unit and browser integration checks.
- `scripts/`: dependency and distribution checks, packaging helpers.

## Local use and checks

Use Node.js 22 and Python 3.11 or newer. No application build or processing server is required.

```sh
python -m http.server 8765
# Open http://localhost:8765/pdf-viewer/
node --test tests/*.test.mjs
python scripts/check_browser_build.py
python -m unittest discover -s tests -p 'test_*.py'
```

Documents are processed on the device. The application does not upload document bytes. Optional OCR and AI models download separately. Private customer documents and extracted fonts must never be committed here.

## Hosting

ShopPage hosts `bhavyam.shop`. Its Pages workflow checks out this repository and copies `pdf-viewer/` into the deployment artifact. ShopPage therefore contains only website source; the PDF application is maintained here. The public PDF URL and browser origin stay unchanged, including access to previously saved stamps. The deployment records the exact PDF source commit in `/pdf-viewer/source-revision.txt`.

ShopPage deployments run on website pushes, manually, and every 30 minutes to pick up PDF updates (GitHub may delay scheduled runs). Changes here must pass distribution checks before deployment. The old ShopPage commit history remains available as a rollback point.

## License

AGPL-3.0-or-later; see [LICENSE](LICENSE) and [third-party notices](pdf-viewer/THIRD_PARTY.md). Dependency licenses retain their respective terms.
