#!/usr/bin/env python3
import json
import sys
from pathlib import Path

import fitz  # PyMuPDF
from pdf2docx import Converter


def emit(progress: int, message: str) -> None:
    print(json.dumps({"progress": progress, "message": message}), flush=True)


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: pdf_to_docx.py INPUT_PDF OUTPUT_DOCX", file=sys.stderr)
        return 2

    input_path = Path(sys.argv[1]).resolve()
    output_path = Path(sys.argv[2]).resolve()
    if input_path.suffix.lower() != ".pdf":
        print("Input must be a PDF file.", file=sys.stderr)
        return 2
    if not input_path.is_file():
        print("Input PDF was not found.", file=sys.stderr)
        return 2

    document = None
    converter = None
    try:
        document = fitz.open(input_path)
        page_count = document.page_count
        if page_count < 1:
            print("The PDF does not contain any pages.", file=sys.stderr)
            return 1

        emit(18, f"PyMuPDF inspected {page_count} page{'s' if page_count != 1 else ''}.")
        emit(28, "Extracting text blocks, images, tables, and diagrams…")
        converter = Converter(str(input_path))
        emit(42, "Rebuilding the editable Word layout with pdf2docx…")
        converter.convert(str(output_path), start=0, end=None)
        emit(86, "Embedding preserved visual content in the DOCX file…")
        converter.close()
        converter = None
        emit(96, "Validating the generated Word document…")
        if not output_path.is_file() or output_path.stat().st_size == 0:
            print("The conversion output is empty.", file=sys.stderr)
            return 1
        emit(100, "PDF to Word conversion completed.")
        return 0
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1
    finally:
        if converter is not None:
            try:
                converter.close()
            except Exception:
                pass
        if document is not None:
            document.close()


if __name__ == "__main__":
    raise SystemExit(main())
