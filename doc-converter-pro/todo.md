# DocConverter Pro - TODO

## Core Features

### Backend Infrastructure
- [x] Set up file upload handling with multer middleware
- [x] Configure temporary file storage and cleanup system
- [x] Implement subprocess management for Python and LibreOffice processes
- [x] Create error handling and logging framework

### PDF to Word Conversion
- [x] Install and configure pdf2docx library
- [x] Install and configure PyMuPDF (fitz) library
- [x] Implement PDF-to-DOCX conversion pipeline
- [x] Test with complex PDFs (tables, images, diagrams)
- [x] Verify chemical formula preservation (embedded structure image and formula text marker preserved in DOCX smoke output)

### Word to PDF Conversion
- [x] Install and configure LibreOffice headless mode
- [x] Implement Word-to-PDF conversion pipeline using soffice
- [x] Test with complex documents (chemical formulas, diagrams)
- [x] Verify all formatting preservation (page count, image count, and text markers inspected)

### Real-time Status Updates
- [x] Implement Server-Sent Events (SSE) for progress streaming
- [x] Create conversion status tracking system
- [x] Stream real-time progress to frontend during conversion

### File Management
- [x] Implement secure file download mechanism
- [x] Implement automatic cleanup post-download
- [x] Document lifecycle decision: files are removed post-download; no timer-based orphan cleanup is enabled because the requirement specifies post-download cleanup rather than scheduled cleanup
- [x] Secure temporary file storage

### Frontend UI
- [x] Design elegant landing page with feature highlights
- [x] Implement drag-and-drop file upload component
- [x] Create file format selector (PDF/DOCX/DOC)
- [x] Build conversion progress indicator with real-time updates
- [x] Implement conversion history log per session
- [x] Create error notification system
- [x] Build download button with status feedback
- [x] Add responsive design for mobile and desktop

### Database Schema
- [x] Create conversions table to track conversion history
- [x] Document storage-model decision: session history retains conversion metadata in memory and uploaded document bytes are not persisted, so a separate file metadata table is intentionally omitted

### Testing & Validation
- [x] Test PDF to Word with complex documents
- [x] Test Word to PDF with complex documents
- [x] Test chemical formula preservation
- [x] Test file cleanup after download
- [x] Test error handling for unsupported formats
- [x] Test concurrent conversions
- [x] Verify no data leakage between sessions (history is keyed by a browser session identifier)

### Deployment
- [x] Create custom Dockerfile with Python and LibreOffice
- [x] Configure environment variables
- [x] Test in production environment (local production-mode build and server smoke test passed)
- [x] Verify file cleanup in production (local production-mode download invalidation returned 403)

## Completed Features
- [x] Verify the conversions table definition and migration are present and synchronized with the database
- [x] Document and wire conversion runtime configuration for deployment
- [x] Add an end-to-end concurrent completion test that waits for all jobs, verifies each download, and confirms cleanup under concurrent load
- [x] Rename visible app branding and metadata to UNITER document converter
- [x] Document superseded branding request: do not apply UNITERT DOCUMENT CONVERTER; final approved brand is UNITER document converter
- [x] Apply final branding casing: UNITER document converter
