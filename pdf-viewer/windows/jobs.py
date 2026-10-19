"""Local processing jobs and shared filtering/sorting for screen and export."""
import shutil
import tempfile
import threading
import time
import uuid
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from documents import process_document, parse_date, normalize_ticket, ocr_status

MAX_UPLOAD = 100 * 1024 * 1024


class Job:
    def __init__(self, root, filename, job_id=None):
        self.id = job_id or uuid.uuid4().hex
        self.folder = Path(tempfile.mkdtemp(prefix="job-", dir=root))
        self.path = self.folder / "input.pdf"
        self.filename = filename
        self.cancel = threading.Event()
        self.lock = threading.RLock()
        self.state = "uploading"
        self.done = self.total = 0
        self.message = "Uploading"
        self.error = None
        self.document = None
        self.touched = time.monotonic()
        self.retired = False
        self.upload_socket = None
        self.upload_finished = threading.Event()

    def progress(self, done, total, message):
        with self.lock:
            self.done, self.total, self.message = done, total, message

    def snapshot(self):
        with self.lock:
            result = {"id":self.id,"state":self.state,"done":self.done,"total":self.total,
                      "message":self.message,"error":self.error}
            if self.state == "ready":
                doc = self.document
                result["document"] = {k:v for k,v in doc.items() if k != "datasets"}
                result["document"]["filename"] = self.filename
                result["document"]["datasets"] = [{k:v for k,v in d.items() if k != "rows"} | {"count":len(d["rows"])} for d in doc["datasets"]]
                airline = next((d for d in doc["datasets"] if d["id"] == "airline"), None)
                if airline:
                    result["document"]["agencies"] = sorted({r["Agency"] for r in airline["rows"]})
                    result["document"]["transaction_types"] = sorted({r["Type"] for r in airline["rows"]})
            return result


class JobManager:
    def __init__(self, root):
        root = Path(root)
        root.mkdir(parents=True,exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="session-", dir=root)
        self.jobs = {}
        self.lock = threading.RLock()
        self.executor = ThreadPoolExecutor(max_workers=1,thread_name_prefix="pdf-reader")
        self.closed = False

    def create(self, filename, job_id=None):
        with self.lock:
            self.expire()
            if len(self.jobs) >= 12:
                raise ValueError("Too many open documents. Close or replace an existing document first.")
            if job_id and (not re.fullmatch(r"[a-f0-9]{32}",job_id) or job_id in self.jobs):
                raise ValueError("Invalid or duplicate upload ID.")
            job = Job(self.temp.name, filename, job_id)
            self.jobs[job.id] = job
            return job

    def get(self, job_id):
        with self.lock:
            job = self.jobs.get(job_id)
            if job is None or job.retired:
                raise ValueError("This document has been closed. Upload it again.")
            job.touched = time.monotonic()
            return job

    def submit(self, job, password):
        with job.lock:
            job.state, job.message = "queued", "Waiting to process"
        self.executor.submit(self.run,job,password)

    def run(self, job, password):
        try:
            if job.cancel.is_set():
                raise InterruptedError()
            with job.lock:
                job.state = "processing"
            document = process_document(job.path,password,job.folder,job.cancel,job.progress,source_name=job.filename)
            if job.cancel.is_set():
                raise InterruptedError()
            with job.lock:
                job.document, job.state = document, "ready"
        except InterruptedError:
            with job.lock:
                job.state, job.message = "cancelled", "Cancelled; temporary files removed."
        except Exception as error:
            with job.lock:
                job.error, job.state = str(error), "error"
        finally:
            # Only extracted results remain in memory; remove input and OCR images.
            shutil.rmtree(job.folder,ignore_errors=True)
            if job.retired:
                with self.lock:
                    self.jobs.pop(job.id,None)

    def retire(self, job_id):
        with self.lock:
            job = self.jobs.get(job_id)
            if not job:
                return
            job.retired = True
            job.cancel.set()
            with job.lock:
                if job.state=="uploading" and job.upload_socket is not None:
                    # The receiving loop checks cancel every 200 ms and removes
                    # its file after closing the Windows file handle.
                    pass
                elif job.state in ("ready","error","cancelled","uploading"):
                    job.document = None
                    shutil.rmtree(job.folder,ignore_errors=True)
                    self.jobs.pop(job.id,None)

    def discard_upload(self, job):
        with self.lock:
            job.cancel.set()
            job.retired = True
            shutil.rmtree(job.folder,ignore_errors=True)
            self.jobs.pop(job.id,None)

    def expire(self):
        for job in list(self.jobs.values()):
            if job.state in ("ready","error","cancelled") and time.monotonic()-job.touched > 3600:
                self.retire(job.id)

    def close(self):
        if self.closed:
            return
        self.closed = True
        with self.lock:
            uploading = [job for job in self.jobs.values() if job.state=="uploading"]
            for job in list(self.jobs.values()):
                self.retire(job.id)
        for job in uploading:
            if job.upload_socket is not None:
                job.upload_finished.wait(5)
        self.executor.shutdown(wait=True)
        self.jobs.clear()
        self.temp.cleanup()


def select_records(job, params):
    with job.lock:
        if job.state != "ready" or job.document is None:
            raise ValueError("The document is not ready yet.")
        document = job.document
    dataset_id = params.get("dataset", document["datasets"][0]["id"])
    dataset = next((d for d in document["datasets"] if d["id"] == dataset_id),None)
    if dataset is None:
        raise ValueError("Choose a valid table or page-text view.")
    query = str(params.get("query", "")).strip().casefold()
    ticket = normalize_ticket(params.get("ticket", ""))
    tickets = [ticket]
    if dataset_id == "airline" and len(ticket)==13 and ticket[:3] == document["title"][:3]:
        tickets.append(ticket[3:])
    date_from, date_to = params.get("from",""),params.get("to","")
    for date in (date_from,date_to):
        if date and not parse_date(date):
            raise ValueError("Choose a valid date range.")
    if date_from and date_to and date_from > date_to:
        raise ValueError("From date must be on or before To date.")
    def matches(row):
        if dataset_id=="airline":
            if params.get("agency") and row["Agency"] != params["agency"]:
                return False
            if params.get("type") and row["Type"] != params["type"]:
                return False
            date = parse_date(row.get("Date",""))
            if date_from and (not date or date.date().isoformat()<date_from):
                return False
            if date_to and (not date or date.date().isoformat()>date_to):
                return False
            search_values = [row.get("Document number",""),row.get("Related document","")]
        else:
            search_values = list(row.values())
        if ticket and not any(t in normalize_ticket(v) for t in tickets for v in search_values):
            return False
        return not query or any(query in str(v).casefold() for v in row.values())
    rows = [r for r in dataset["rows"] if matches(r)]
    sort = params.get("sort", "")
    direction = params.get("direction","asc")
    if direction not in ("asc","desc"):
        raise ValueError("Invalid sort direction.")
    if sort:
        if sort not in dataset["fields"]:
            raise ValueError("Choose an available sort column.")
        def key(row):
            value = row[sort]
            kind = dataset["types"].get(sort,"text")
            if kind=="number":
                return float(value)
            if kind=="date":
                return parse_date(value) or __import__('datetime').datetime.min
            return str(value).casefold()
        populated = [r for r in rows if r.get(sort) not in (None,"")]
        blanks = [r for r in rows if r.get(sort) in (None,"")]
        rows = sorted(populated,key=key,reverse=direction=="desc")+blanks
    return dataset, rows, document


def query_records(job, params):
    dataset, rows, _ = select_records(job,params)
    offset = max(0,int(params.get("offset",0)))
    requested_limit = params.get("limit", "50")
    limit = len(rows) if requested_limit == "all" else min(200,max(1,int(requested_limit)))
    result = {"rows":rows[offset:offset+limit],"count":len(rows),"offset":offset,"limit":limit}
    if dataset["id"]=="airline":
        result["totals"] = {f:sum(r.get(f) or 0 for r in rows) for f in ("Transaction amount","Balance payable")}
    return result


def export_payload(job, params):
    dataset, rows, document = select_records(job,params)
    fields = params.get("fields",[])
    if not isinstance(fields,list) or not fields or any(f not in dataset["fields"] for f in fields):
        raise ValueError("Select at least one available field.")
    descriptions = [f"{k}: {params[k]}" for k in ("agency","type","ticket","query","from","to","sort","direction") if params.get(k)]
    return {"fields":fields,"rows":rows,"available_fields":dataset["fields"],"field_types":dataset["types"],
            "filename":job.filename,"period":document["period"],"mode":document["mode"],"currency":"INR" if dataset["id"]=="airline" else "",
            "title":"Selected billing records" if dataset["id"]=="airline" else "Selected PDF information",
            "filters":dataset["label"] + ("; " + "; ".join(descriptions) if descriptions else "")}
