"""Offline PDF viewer. Launch with Start Viewer.bat."""
import atexit
import json
import threading
import webbrowser
import time
import select
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, unquote

from airline import parse_pdf  # backwards-compatible parser entry point
from documents import ocr_status
from jobs import JobManager, MAX_UPLOAD, query_records, export_payload
from exports import export_selection

ROOT = Path(__file__).resolve().parent


class ViewerServer(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self,address):
        super().__init__(address,Handler)
        self.manager = JobManager(ROOT / ".runtime")
        self.last_expire = 0

    def service_actions(self):
        if time.monotonic()-self.last_expire > 30:
            with self.manager.lock:
                self.manager.expire()
            self.last_expire = time.monotonic()

    def server_close(self):
        self.manager.close()
        super().server_close()


class Handler(BaseHTTPRequestHandler):
    # Unbuffered reads let the upload loop wait with a short, cancellable select
    # rather than blocking until an entire megabyte arrives on Windows.
    rbufsize = 0
    def send(self, status, body, content_type="application/json", filename=None):
        if isinstance(body,dict):
            body = json.dumps(body,ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type",content_type)
        self.send_header("Content-Length",str(len(body)))
        self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff")
        if filename:
            self.send_header("Content-Disposition",f'attachment; filename="{filename}"')
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):
            pass

    def do_GET(self):
        try:
            route = urlsplit(self.path)
            parts = route.path.strip("/").split("/")
            if route.path in ("/","/index.html"):
                self.send(200,(ROOT/"index.html").read_bytes(),"text/html; charset=utf-8")
            elif route.path=="/viewer.js":
                self.send(200,(ROOT/"viewer.js").read_bytes(),"text/javascript; charset=utf-8")
            elif route.path.startswith("/browser/"):
                asset = route.path[len("/browser/"):]
                # Serve only direct files from the packaged browser-tools folder.
                if not asset or "/" in asset or "\\" in asset or asset.startswith("."):
                    self.send(404,{"error":"Not found"})
                else:
                    browser_root = ROOT / "browser" if (ROOT / "browser").is_dir() else ROOT.parent
                    target = browser_root / asset
                    types = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8"}
                    if target.is_file() and target.suffix in types:
                        self.send(200,target.read_bytes(),types[target.suffix])
                    else:
                        self.send(404,{"error":"Not found"})
            elif route.path=="/capabilities":
                self.send(200,{"max_upload":MAX_UPLOAD,"ocr":ocr_status()})
            elif len(parts)>=2 and parts[0]=="jobs":
                job = self.server.manager.get(parts[1])
                if len(parts)==2:
                    self.send(200,job.snapshot())
                elif parts[2]=="records":
                    params = {k:v[-1] for k,v in parse_qs(route.query).items()}
                    self.send(200,query_records(job,params))
                else:
                    self.send(404,{"error":"Not found"})
            else:
                self.send(404,{"error":"Not found"})
        except ValueError as error:
            self.send(400,{"error":str(error)})
        except Exception:
            self.send(500,{"error":"Could not retrieve this document."})

    def do_POST(self):
        job = None
        try:
            origin = self.headers.get("Origin")
            if origin and origin != f"http://{self.headers.get('Host')}":
                raise ValueError("Use the local viewer page to submit requests.")
            path = urlsplit(self.path).path
            manager = self.server.manager
            length = int(self.headers.get("Content-Length","0"))
            if path=="/upload":
                # Raw PDF body: actual file bytes are measured without multipart overhead.
                if length<=0 or length>MAX_UPLOAD:
                    self.send(413,{"error":"Choose a PDF up to 100 MB (100 MiB)."})
                    return
                if self.headers.get("Content-Type", "").split(";")[0] != "application/pdf":
                    raise ValueError("Choose a PDF file.")
                previous = self.headers.get("X-Previous-Job","")
                if previous:
                    manager.retire(previous)
                filename = unquote(self.headers.get("X-Filename","document.pdf"))[:250]
                password = unquote(self.headers.get("X-PDF-Password",""))
                job = manager.create(filename,self.headers.get("X-Upload-ID"))
                job.upload_socket = self.connection
                remaining = length
                self.connection.settimeout(120)
                last_data = time.monotonic()
                with job.path.open("wb") as f:
                    while remaining:
                        if job.cancel.is_set():
                            raise ValueError("Upload cancelled.")
                        if not select.select([self.connection],[],[],.2)[0]:
                            if time.monotonic()-last_data > 120:
                                raise ValueError("Upload timed out. Please try again.")
                            continue
                        chunk = self.rfile.read(min(1024*1024,remaining))
                        if not chunk:
                            raise ValueError("Upload interrupted. Please try again.")
                        f.write(chunk)
                        remaining -= len(chunk)
                        last_data = time.monotonic()
                if job.cancel.is_set():
                    raise ValueError("Upload cancelled.")
                job.upload_socket = None
                with job.path.open("rb") as f:
                    if b"%PDF-" not in f.read(1024):
                        raise ValueError("This file is not a PDF.")
                manager.submit(job,password)
                self.send(202,{"id":job.id})
            elif path.startswith("/jobs/") and path.endswith("/cancel"):
                manager.retire(path.split("/")[2])
                self.send(200,{"state":"cancelled"})
            elif path in ("/export/pdf","/export/xlsx"):
                if length<=0 or length>64*1024:
                    raise ValueError("Invalid export request.")
                chunks, remaining = [], length
                while remaining:
                    chunk = self.rfile.read(remaining)
                    if not chunk:
                        raise ValueError("Incomplete export request.")
                    chunks.append(chunk)
                    remaining -= len(chunk)
                params = json.loads(b"".join(chunks))
                job = manager.get(params.get("job",""))
                payload = export_payload(job,params)
                fmt = path.rsplit("/",1)[1]
                body,content_type = export_selection(payload,fmt)
                self.send(200,body,content_type,f"selected-pdf-information.{fmt}")
            else:
                self.send(404,{"error":"Not found"})
        except (ValueError,TypeError) as error:
            if job and job.state=="uploading":
                self.server.manager.discard_upload(job)
            self.send(400,{"error":str(error)})
        except Exception:
            if job and job.state=="uploading":
                self.server.manager.discard_upload(job)
            self.send(500,{"error":"Could not complete this request. Please retry."})
        finally:
            if job:
                job.upload_finished.set()


if __name__=="__main__":
    server = ViewerServer(("127.0.0.1",0))
    atexit.register(server.manager.close)
    url = f"http://127.0.0.1:{server.server_port}"
    print(f"PDF Viewer: {url}\n{ocr_status()['message']}\nKeep this window open. Press Ctrl+C to stop.")
    threading.Timer(.7,lambda:webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
