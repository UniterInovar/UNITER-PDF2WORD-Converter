# Conversion Runtime

DocConverter Pro runs its conversion workers as child processes of the Express request handler. The development environment and production image both require Python 3, `pdf2docx`, PyMuPDF, and LibreOffice Writer.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DOC_CONVERTER_MAX_FILE_BYTES` | `52428800` | Maximum upload size; the upload middleware and conversion service read the same value. |
| `DOC_CONVERTER_PYTHON` | `python3` | Python executable used for the PDF-to-Word worker. |
| `DOC_CONVERTER_SOFFICE` | `soffice` | LibreOffice executable used for Word-to-PDF rendering. |
| `DOC_CONVERTER_PROCESS_TIMEOUT_MS` | `300000` | Maximum time in milliseconds to allow an external conversion process before it is killed (default 5 minutes). |

The root `Dockerfile` installs the required system runtime and Python packages, runs the full frontend and server build, and starts `dist/index.js`. No conversion secrets are required. The existing template-provided environment variables continue to supply authentication, database, and analytics configuration.

## Fidelity behavior

PDF-to-Word uses PyMuPDF to validate and inspect the source PDF, then `pdf2docx` to rebuild editable Word content. Word-to-PDF invokes LibreOffice Writer headlessly with a per-job user profile so embedded artwork, tables, formulas, and page layout are rendered by the office engine rather than approximated in the browser.

The product intentionally does not promise mathematical equivalence between arbitrary PDF source layouts and editable Word markup. Scanned PDFs without a text layer, fonts unavailable to LibreOffice, and proprietary embedded objects can require source-specific handling. Downloaded outputs and upload inputs are removed after the response finishes; session history retains metadata only and does not store document bytes.
