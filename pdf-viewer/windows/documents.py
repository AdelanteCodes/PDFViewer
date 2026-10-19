"""Page-by-page native PDF extraction and local Tesseract OCR."""
import csv
import io
import os
import re
import shutil
import subprocess
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import pdfplumber
from awb import parse_awb, datasets as awb_datasets
from airline import parse_pdf as parse_airline, FIELDS

NUMBER_FIELDS = {"Page", "Transaction amount", "Fare", "Net sales", "Commission", "Discount",
                 "Tax on commission", "Balance payable"}
CREATE_FLAGS = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def ocr_status():
    candidates = [os.environ.get("TESSERACT_CMD"), shutil.which("tesseract"),
                  r"C:\Program Files\Tesseract-OCR\tesseract.exe",
                  str(Path(os.environ.get("LOCALAPPDATA", "")) / "Programs/Tesseract-OCR/tesseract.exe")]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            try:
                langs = subprocess.run([candidate, "--list-langs"], capture_output=True, text=True,
                                       timeout=8, creationflags=CREATE_FLAGS)
                if "eng" in langs.stdout.split():
                    return {"available": True, "path": str(candidate), "message": "Offline English OCR ready."}
            except (OSError, subprocess.TimeoutExpired):
                pass
    return {"available": False, "path": None,
            "message": "OCR is not installed. Run Setup OCR.bat once to read scanned pages."}


def check_cancel(cancel):
    if cancel.is_set():
        raise InterruptedError("Processing cancelled.")


def parse_date(value):
    for fmt in ("%d%b%y", "%d-%b-%Y", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d %b %Y"):
        try:
            return datetime.strptime(str(value).strip(), fmt)
        except ValueError:
            pass
    return None


def normalize_ticket(value):
    return re.sub(r"[\s-]+", "", str(value)).casefold()


def number_value(value):
    text = str(value).strip().replace(",", "")
    if re.fullmatch(r"-?(?:0|[1-9]\d*)(?:\.\d+)?", text):
        return float(text) if "." in text else int(text)
    return None


def infer_types(dataset):
    types = {"Page": "number"}
    for field in dataset["fields"]:
        if field == "Page":
            continue
        vals = [r.get(field) for r in dataset["rows"] if r.get(field) not in (None, "")]
        identifiers = re.search(r"ticket|document|number|\bid\b|code|reference|account|phone|zip", field, re.I)
        if vals and not identifiers and all(number_value(v) is not None for v in vals):
            types[field] = "number"
            for row in dataset["rows"]:
                if row.get(field) not in (None, ""):
                    row[field] = number_value(row[field])
        elif vals and re.search(r"date|issued|due", field, re.I) and all(parse_date(v) for v in vals):
            types[field] = "date"
        else:
            types[field] = "text"
    dataset["types"] = types


def headers_and_rows(table):
    table = [["" if c is None else str(c).strip() for c in row] for row in table if row and any(c for c in row)]
    if len(table) < 2:
        return None
    width = max(map(len, table))
    if width < 2 or width > 200:
        return None
    table = [r + [""] * (width - len(r)) for r in table]
    first = table[0]
    # A numeric first row is data, not an invented heading.
    header = not any(number_value(c) is not None for c in first if c)
    names, used = [], {"Page", "Source"}
    for i, cell in enumerate(first if header else [""] * width):
        base = re.sub(r"\s+", " ", cell)[:120] or f"Column {i + 1}"
        name, n = base, 2
        while name in used:
            name = f"{base} ({n})"
            n += 1
        used.add(name)
        names.append(name)
    return names, table[1:] if header else table


def grid_lines(image):
    """Locate continuous ruling, rejecting ordinary text strokes."""
    import numpy as np
    dark = np.asarray(image.convert("L")) < 110
    height, width = dark.shape
    def centers(indices):
        groups = []
        for i in indices:
            if not groups or i - groups[-1][-1] > 3:
                groups.append([int(i)])
            else:
                groups[-1].append(int(i))
        return [sum(g) / len(g) for g in groups]
    def longest_run(values):
        changes = np.diff(np.r_[False, values, False].astype(np.int8))
        return max(np.flatnonzero(changes==-1)-np.flatnonzero(changes==1),default=0)
    ys = centers([i for i in np.flatnonzero(dark.sum(axis=1)>width*.2)
                  if longest_run(dark[i,:])>width*.2])
    xs = centers([i for i in np.flatnonzero(dark.sum(axis=0)>height*.07)
                  if longest_run(dark[:,i])>height*.07])
    return xs, ys


def ocr_tables(image, words):
    """Prefer ruled grid cells; otherwise accept repeated aligned OCR columns."""
    width, height = image.size
    xs, ys = grid_lines(image)
    if len(xs) >= 3 and len(ys) >= 3:
        cells = [[[] for _ in range(len(xs) - 1)] for _ in range(len(ys) - 1)]
        for word in words:
            cx, cy = (word["x0"] + word["x1"]) / 2, (word["top"] + word["bottom"]) / 2
            ri = next((i for i in range(len(ys) - 1) if ys[i] < cy < ys[i + 1]), None)
            ci = next((i for i in range(len(xs) - 1) if xs[i] < cx < xs[i + 1]), None)
            if ri is not None and ci is not None:
                cells[ri][ci].append(word)
        grid = [[" ".join(w["text"] for w in sorted(c, key=lambda w:(w["top"], w["x0"]))) for c in row] for row in cells]
        if sum(any(c for c in row) for row in grid) >= 2:
            return [grid]
    lines = defaultdict(list)
    for w in words:
        lines[w["line_key"]].append(w)
    aligned = []
    for line in lines.values():
        line.sort(key=lambda w: w["x0"])
        cells, starts = [], []
        end = None
        for word in line:
            if end is None or word["x0"] - end > width * .035:
                cells.append(word["text"])
                starts.append(word["x0"])
            else:
                cells[-1] += " " + word["text"]
            end = word["x1"]
        if len(cells) >= 2:
            aligned.append((line[0]["top"], starts, cells))
    aligned.sort()
    tables, group, anchor = [], [], None
    for _, starts, cells in aligned:
        if anchor is not None and (len(starts) != len(anchor) or any(abs(a-b) > width * .025 for a,b in zip(anchor, starts))):
            if len(group) >= 3:
                tables.append(group)
            group, anchor = [], None
        anchor = anchor or starts
        group.append(cells)
    if len(group) >= 3:
        tables.append(group)
    return tables


class OCRPage:
    def __init__(self, native, page_no, folder, cancel, engine):
        self.width, self.height = native.width, native.height
        resolution = min(220, 3200 * 72 / native.width, 4200 * 72 / native.height)
        image = native.to_image(resolution=resolution).original.convert("RGB")
        # Bound rendering memory for unusually large page dimensions.
        image.thumbnail((3200, 4200))
        path = folder / f"ocr-{page_no}.png"
        # Ruling can cause Tesseract to omit entire cells. Detect it from the
        # original, then recognize a same-size copy with those rules removed.
        from PIL import ImageDraw
        recognition = image.copy()
        drawing = ImageDraw.Draw(recognition)
        xs, ys = grid_lines(image)
        if len(xs)>=3 and len(ys)>=3:
            for x in xs:
                drawing.line((x,ys[0],x,ys[-1]), fill="white", width=7)
            for y in ys:
                drawing.line((xs[0],y,xs[-1],y), fill="white", width=7)
        recognition.save(path)
        recognition.close()
        output = folder / f"ocr-{page_no}"
        stderr = folder / f"ocr-{page_no}.log"
        try:
            with stderr.open("wb") as log:
                process = subprocess.Popen([engine, str(path), str(output), "-l", "eng", "--psm", "6", "tsv"],
                                           stdout=subprocess.DEVNULL, stderr=log, creationflags=CREATE_FLAGS)
                start = time.monotonic()
                try:
                    while process.poll() is None:
                        check_cancel(cancel)
                        if time.monotonic() - start > 180:
                            raise ValueError(f"OCR timed out on page {page_no}.")
                        cancel.wait(.1)
                finally:
                    if process.poll() is None:
                        process.kill()
                    process.wait()
            if process.returncode:
                raise ValueError(f"OCR failed on page {page_no}.")
            raw = []
            with output.with_suffix(".tsv").open(encoding="utf-8") as f:
                for row in csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
                    if not row.get("text", "").strip():
                        continue
                    left, top, w, h = (int(row[k]) for k in ("left", "top", "width", "height"))
                    raw.append({"text":row["text"].strip(), "x0":left, "x1":left+w,
                                "top":top, "bottom":top+h,
                                "line_key":tuple(row[k] for k in ("block_num", "par_num", "line_num"))})
            self.tables = ocr_tables(image, raw)
            lines = defaultdict(list)
            for w in raw:
                lines[w["line_key"]].append(w)
            self.text = "\n".join(" ".join(w["text"] for w in sorted(line,key=lambda w:w["x0"]))
                                  for line in sorted(lines.values(),key=lambda line: min(w["top"] for w in line)))
            self.words = [{**w, "x0":w["x0"]*self.width/image.width, "x1":w["x1"]*self.width/image.width,
                           "top":w["top"]*self.height/image.height, "bottom":w["bottom"]*self.height/image.height} for w in raw]
        finally:
            image.close()
            for item in (path, output.with_suffix(".tsv"), stderr):
                item.unlink(missing_ok=True)

    def extract_text(self):
        return self.text

    def extract_words(self, **kwargs):
        return self.words

    def extract_tables(self, **kwargs):
        return self.tables

    def close(self):
        pass


def process_document(path, password, folder, cancel, progress, engine_info=None, source_name=None):
    engine_info = engine_info or ocr_status()
    warnings, ocr_pages, missing_ocr = [], [], []
    text_rows, tables, signatures, awbs = [], [], {}, []
    def provide(page, page_no):
        check_cancel(cancel)
        text = page.extract_text() or ""
        area = page.width * page.height
        image_area = sum(max(0,min(page.width,i["x1"])-max(0,i["x0"])) *
                         max(0,min(page.height,i["bottom"])-max(0,i["top"])) for i in page.images)
        scanned = len(text.strip()) < 25 or (image_area / max(area, 1) > .55 and len(text) < 1000)
        if scanned and (page.images or page.curves):
            if not engine_info["available"]:
                missing_ocr.append(page_no)
                return page, "Text (OCR unavailable)"
            progress(page_no - 1, page_count, f"OCR page {page_no} of {page_count}")
            converted = OCRPage(page, page_no, folder, cancel, engine_info["path"])
            page.close()
            ocr_pages.append(page_no)
            return converted, "OCR"
        return page, "Text"
    def add_text(page_no, text, source="Text"):
        # Chunk long pages without truncating or breaching Excel's cell limit.
        for offset in range(0, max(len(text), 1), 6000):
            text_rows.append({"Page":page_no, "Text":text[offset:offset+6000], "Source":source})
    def add_table(raw, page_no, source):
        parsed = headers_and_rows(raw)
        if not parsed:
            return
        names, rows = parsed
        signature = tuple(names)
        if signature not in signatures:
            dataset = {"id":f"table-{len(tables)+1}", "label":f"Table {len(tables)+1}: " + ", ".join(names[:3]),
                       "fields":["Page"] + names + ["Source"], "rows":[]}
            signatures[signature] = dataset
            tables.append(dataset)
        for row in rows:
            signatures[signature]["rows"].append({"Page":page_no, **dict(zip(names,row)), "Source":source})
    try:
        with pdfplumber.open(path, password=password or None) as pdf:
            page_count = len(pdf.pages)
            if not page_count:
                raise ValueError("This PDF has no pages.")
            first, first_source = provide(pdf.pages[0], 1)
            first_text = first.extract_text() or ""
            airline = "FCAIBILLDET" in first_text and "AIRLINE BILLING DETAILS" in first_text
            if not airline:
                for page_no, native in enumerate(pdf.pages, 1):
                    check_cancel(cancel)
                    progress(page_no-1, page_count, f"Reading page {page_no} of {page_count}")
                    page, source = (first, first_source) if page_no == 1 else provide(native, page_no)
                    add_text(page_no, page.extract_text() or "", source)
                    awb = parse_awb(page,page_no,source_name or Path(path).name)
                    if awb:
                        awbs.append(awb)
                    extracted = page.extract_tables()
                    if not extracted and source == "Text":
                        # Text-aligned fallback is accepted only with repeated columns.
                        candidates = page.extract_tables(table_settings={"vertical_strategy":"text", "horizontal_strategy":"text", "min_words_vertical":3})
                        extracted = [t for t in candidates if len(t) >= 3 and len(t[0]) >= 2]
                    for raw in extracted:
                        add_table(raw, page_no, source)
                    if source == "OCR" and not extracted:
                        warnings.append(f"Page {page_no}: OCR text extracted; no reliable table grid detected.")
                    page.close()
        if airline:
            # The original billing parser retains its exact financial-field mapping.
            cache = {1:(first,first_source)} if isinstance(first, OCRPage) else {}
            def provider(page, page_no):
                result, source = cache.pop(page_no) if page_no in cache else provide(page,page_no)
                add_text(page_no,result.extract_text() or "",source)
                return result
            result = parse_airline(path, password=password, progress=progress, cancel=cancel, page_provider=provider)
            warnings.extend(result["warnings"])
            tables.insert(0,{"id":"airline", "label":"Airline billing records", "fields":FIELDS,
                             "rows":result["records"], "types":{f:"number" if f in NUMBER_FIELDS else "date" if f=="Date" else "text" for f in FIELDS}})
            title, period, summary = result["airline"], result["period"], result["summary"]
        else:
            title, period, summary = "PDF document", "", ""
    except InterruptedError:
        raise
    except Exception as error:
        from pdfminer.pdfdocument import PDFPasswordIncorrect
        if isinstance(error, PDFPasswordIncorrect) or isinstance(error.__context__, PDFPasswordIncorrect):
            raise ValueError("This PDF requires a password, or the password is incorrect. Enter it and upload again.") from error
        if isinstance(error, ValueError):
            raise
        raise ValueError("Could not read this PDF. It may be damaged or use an unsupported encoding.") from error
    tables = awb_datasets(awbs) + tables
    if awbs:
        warnings.append("AWB fields use detected labels and positions. Check them against the original. All extracted text is retained in AWB details and Page text.")
    for dataset in tables:
        if dataset["id"] != "airline" and not dataset.get("types"):
            infer_types(dataset)
    tables.append({"id":"text", "label":"Page text", "fields":["Page","Text","Source"],
                   "rows":text_rows,"types":{"Page":"number","Text":"text","Source":"text"}})
    if ocr_pages:
        warnings.append("OCR used on pages " + ", ".join(map(str,sorted(set(ocr_pages)))) + ". Check recognized text and tables against the original.")
    if missing_ocr:
        warnings.append("Scanned pages need OCR: " + ", ".join(map(str,sorted(set(missing_ocr)))) + ". Run Setup OCR.bat and upload again.")
    progress(page_count,page_count,"Ready")
    return {"mode":"airline" if airline else "general", "title":title,"period":period,"summary":summary,
            "pages":page_count,"warnings":warnings,"datasets":tables}
