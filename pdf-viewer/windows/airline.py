"""Local, offline viewer for IATA FCAIBILLDET billing PDFs."""
import io
import re

import pdfplumber

TYPES = {"TKTT": "Ticket", "RFND": "Refund", "CANX": "Cancellation",
         "EMDA": "EMD-A", "EMDS": "EMD-S", "SPDR": "Debit memo"}
FIELDS = ["Page", "Agency", "Agency code", "Type", "Document number", "Date",
          "Transaction amount", "Fare", "Taxes (codes)", "Fees (codes)",
          "Penalties (codes)", "Net sales", "Commission", "Discount",
          "Tax on commission", "Balance payable", "Payment code", "Related document", "Notes"]


def number(value):
    value = value.strip().replace(",", "").replace("*", "")
    return float(value) if re.fullmatch(r"-?\d+(?:\.\d+)?", value) else None


def parse_pdf(data, password="", progress=None, cancel=None, page_provider=None, text_sink=None):
    records, warnings = [], []
    agency, code, current = "", "", None
    agency_counts = {}
    source = io.BytesIO(data) if isinstance(data, bytes) else data
    with pdfplumber.open(source, password=password or None) as pdf:
        if not pdf.pages:
            raise ValueError("This PDF has no pages.")
        first_page = page_provider(pdf.pages[0], 1) if page_provider else pdf.pages[0]
        first = first_page.extract_text() or ""
        if "FCAIBILLDET" not in first:
            raise ValueError("Please upload an IATA FCAIBILLDET airline billing PDF like the sample.")
        period = re.search(r"Billing Period:\s*(.*?)(?:REFERENCE:|$)", first, re.M)
        airline = re.search(r"AIRLINE BILLING DETAILS\s+(.*)", first)
        summary = next((line for line in first.splitlines() if line.startswith("GRAND TOTAL (")), "")
        for page_no, page in enumerate(pdf.pages, 1):
            if cancel is not None and cancel.is_set():
                raise InterruptedError("Processing cancelled.")
            if progress:
                progress(page_no - 1, len(pdf.pages), f"Reading airline page {page_no}")
            if page_no == 1:
                page = first_page
            elif page_provider:
                page = page_provider(page, page_no)
            if text_sink:
                text_sink(page_no, page.extract_text() or "")
            words = page.extract_words(x_tolerance=2, y_tolerance=2)
            lines = []
            for word in sorted(words, key=lambda w: (w["top"], w["x0"])):
                if not lines or abs(word["top"] - lines[-1][0]) > 2:
                    lines.append((word["top"], [word]))
                else:
                    lines[-1][1].append(word)
            for _, line_words in lines:
                line_words.sort(key=lambda w: w["x0"])
                text = " ".join(w["text"] for w in line_words)
                match = re.match(r"^(14-\d\s+\d+\s+\d)\s+(?:AE|HE)\s+(.+)", text)
                if match:
                    code, agency = match.groups()
                    agency_counts.setdefault(agency, 0)
                    current = None
                    continue
                token = line_words[0]["text"] if line_words else ""
                kind = token.lstrip("+")
                if kind in TYPES and len(line_words) > 2 and re.fullmatch(r"\d+", line_words[1]["text"]):
                    # Normalize the original A4 landscape coordinates for scaled PDFs.
                    cells = lambda lo, hi: " ".join(w["text"] for w in line_words if lo <= w["x0"] * 841 / page.width < hi)
                    current = {key: "" for key in FIELDS}
                    current.update({"Page": page_no, "Agency": agency, "Agency code": code,
                                    "Type": TYPES[kind], "Document number": line_words[1]["text"],
                                    "Date": line_words[2]["text"], "Payment code": cells(249, 280)})
                    for name, lo, hi in [("Transaction amount", 280, 340), ("Fare", 340, 390),
                                         ("Net sales", 530, 573), ("Commission", 610, 645),
                                         ("Discount", 690, 721), ("Tax on commission", 732, 770),
                                         ("Balance payable", 770, 841)]:
                        current[name] = number(cells(lo, hi))
                    for name, lo, hi in [("Taxes (codes)", 390, 440), ("Fees (codes)", 440, 486),
                                         ("Penalties (codes)", 486, 530)]:
                        current[name] = cells(lo, hi)
                    if token.startswith("+"):
                        current["Notes"] = "Conjunction document; amounts may be on the preceding ticket."
                    records.append(current)
                    agency_counts[agency] = agency_counts.get(agency, 0) + 1
                    continue
                if current is not None:
                    if "TOTAL" in text or text.startswith("***"):
                        current = None
                        continue
                    if "RTDN:" in text:
                        related = re.search(r"RTDN:\s*(\d+)", text)
                        if related:
                            current["Related document"] = related.group(1)
                    elif "TOUR:" in text or "ESAC:" in text or "RMIC:" in text:
                        current["Notes"] = (current["Notes"] + " " + text).strip()
                    elif line_words and 390 <= line_words[0]["x0"] * 841 / page.width < 530:
                        for name, lo, hi in [("Taxes (codes)", 390, 440), ("Fees (codes)", 440, 486), ("Penalties (codes)", 486, 530)]:
                            extra = " ".join(w["text"] for w in line_words if lo <= w["x0"] * 841 / page.width < hi)
                            if extra:
                                current[name] = (current[name] + "; " + extra).strip("; ")
            if hasattr(page, "close"):
                page.close()
        if not records:
            raise ValueError("No supported transactions were found. The PDF may be scanned or use a different layout.")
        empty = [name for name, count in agency_counts.items() if not count]
        if empty:
            warnings.append("Agency section has no transactions in this file: " + ", ".join(empty) + ". The report may be incomplete.")
        if any(r["Transaction amount"] is None and not r["Notes"].startswith("Conjunction") for r in records):
            warnings.append("Some amounts could not be read. Blank amounts mean missing data, not zero; check the original PDF.")
        warnings.append("The report's overall summary may include pages absent from this file. Selected totals use only extracted rows.")
        return {"filename": "", "airline": airline.group(1) if airline else "Airline billing report",
                "period": period.group(1).strip() if period else "", "pages": len(pdf.pages),
                "summary": summary, "records": records, "fields": FIELDS, "warnings": warnings}


