# UNITER Document Converter (DocConverter Pro)

Local development and conversion server for PDF ↔ Word workflows.

Quick overview
- The app runs an Express server (default port `3000`) that serves the web UI and the conversion API.
- In development the server uses Vite middleware so the UI is available at the same server URL.
- Conversion workers require Python (`pdf2docx`, `PyMuPDF`) and LibreOffice (`soffice`).

Live URL (local)
- Open: http://localhost:3000/

Prerequisites
- Node.js (18+ recommended)
- Git
- Python 3 with `pdf2docx` and `PyMuPDF` installed (for PDF → Word)
- LibreOffice (for Word → PDF)

Install

```bash
# from repo root
npm install
```

Run (development)

```bash
npm run dev
# then open http://localhost:3000/
```

Build & Run (production)

```bash
npm run build
npm start
# opens at http://localhost:3000/
```

Environment variables
- `PORT` — preferred port (default `3000`).
- `DOC_CONVERTER_MAX_FILE_BYTES` — max upload bytes (default `10737418240` = 10 GiB).
 - `DOC_CONVERTER_MAX_FILE_BYTES` — max upload bytes (default `209715200` = 200 MB). Set lower limits for free hosting.
- `DOC_CONVERTER_PYTHON` — Python executable (default `python3`).
- `DOC_CONVERTER_SOFFICE` — LibreOffice executable (default `soffice`).
- `DOC_CONVERTER_PROCESS_TIMEOUT_MS` — per-process timeout in ms (default `300000`).

API (server)
- POST `/api/conversions` — upload a file and start conversion.
  - multipart form: field `file` (the file), `direction` (`pdf_to_word` or `word_to_pdf`)
  - returns `202` with `sessionId` and initial `job` metadata.
- GET `/api/conversions/:id` — query job status.
- GET `/api/conversions/:id/events` — Server-Sent Events stream for progress updates.
- GET `/api/conversions/:id/download?token=...` — download the completed output (authorized by token).
- GET `/api/history` — session-scoped recent job history (send `x-session-id` header or `sessionId` query param).

Example upload (curl)

```bash
curl -v -F "file=@/path/to/file.pdf" -F "direction=pdf_to_word" http://localhost:3000/api/conversions
```

Tests

```bash
npm test
```

Notes
- The server will try the `PORT` you set and fall back to the next available port starting at 3000.
- Uploaded files and converted outputs are stored temporarily and cleaned up after download or job completion.
- The `CONVERSION_RUNTIME.md` in the repo documents runtime requirements in more detail.

Repository
- https://github.com/UniterInovar/UNITER-PDF2WORD-Converter

License
- MIT

Vercel (frontend) guidance
- You can host the frontend on Vercel (free) and the backend on the Oracle VM. To do this:
  1. In Vercel, create a new project and point it at this repository.
  2. Set the Project Root to `client` and select the Vite framework preset (or set Build Command to `npm run build` and Output Directory to `dist`).
  3. Add an Environment Variable `VITE_API_BASE` with the value of your backend URL, e.g. `https://your-vm.example.com` (no trailing slash).
  4. Deploy — the frontend will call `${VITE_API_BASE}/api/...` for API requests.

Note: The repository's client was updated to respect `VITE_API_BASE`. When empty, the client uses the current origin (same-origin server). When set in Vercel, API calls go to the backend URL.

Render (backend) guidance
- Render supports Docker-based web services and will run the backend persistently with an HTTPS public URL.

Quick steps to deploy the backend on Render (Docker):
1. Create a free account at https://render.com and connect your GitHub repo.
2. In Render dashboard click "New" → "Web Service" and select this repository/branch.
3. Set the Environment to `Docker` (Render will use the `Dockerfile` in the repo root).
4. Service Port: `3000` (the app uses `process.env.PORT || 3000`).
5. Add Environment Variables (Render dashboard → Environment) as needed:
  - `DOC_CONVERTER_MAX_FILE_BYTES` (default `10737418240`)
  - `DOC_CONVERTER_PROCESS_TIMEOUT_MS` (default `300000`)
  - any secrets or API keys your integration requires
6. Deploy — Render will build the Docker image and provide a stable HTTPS URL for your service.

Notes and caveats:
- The `Dockerfile` installs LibreOffice and Python packages required for conversions; Render's free plan can run this image but be mindful of build time and resource limits.
- For large uploads (multi-GB) consider using signed direct uploads to object storage (S3-compatible) and handing off conversion jobs via background workers; Render has request size/time limits for web requests.
- This repository includes a `render.yaml` manifest for Render's infrastructure-as-code if you prefer to create the service from the repo.

If you want, I can prepare an optional GitHub Action that builds and pushes the image to GHCR and triggers a Render deploy from the registry.
