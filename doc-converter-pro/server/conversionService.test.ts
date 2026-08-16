import { describe, expect, it } from 'vitest';
import {
  buildDownloadName,
  getMimeType,
  inputExtensions,
  isConversionDirectionValid,
  isPathInside,
  outputExtension,
  sanitizeDownloadName,
} from './services/conversionService';

describe('conversion service contracts', () => {
  it('accepts only PDF files for PDF to Word', () => {
    expect(isConversionDirectionValid('research.pdf', 'pdf_to_word')).toBe(true);
    expect(isConversionDirectionValid('research.docx', 'pdf_to_word')).toBe(false);
  });

  it('accepts DOC and DOCX files for Word to PDF', () => {
    expect(isConversionDirectionValid('research.docx', 'word_to_pdf')).toBe(true);
    expect(isConversionDirectionValid('legacy.DOC', 'word_to_pdf')).toBe(true);
    expect(isConversionDirectionValid('research.pdf', 'word_to_pdf')).toBe(false);
  });

  it('uses the requested target extensions and MIME types', () => {
    expect(inputExtensions('pdf_to_word')).toEqual(['.pdf']);
    expect(inputExtensions('word_to_pdf')).toEqual(['.doc', '.docx']);
    expect(outputExtension('pdf_to_word')).toBe('.docx');
    expect(outputExtension('word_to_pdf')).toBe('.pdf');
    expect(getMimeType('.docx')).toContain('wordprocessingml.document');
    expect(getMimeType('.pdf')).toBe('application/pdf');
  });

  it('sanitizes download names without losing the original document identity', () => {
    expect(buildDownloadName('Lab results - draft.pdf', 'pdf_to_word')).toBe('Lab-results-draft.docx');
    expect(sanitizeDownloadName('../../private.docx', '.pdf')).toBe('private.pdf');
  });

  it('keeps download paths inside the conversion temp directory', () => {
    expect(isPathInside('/tmp/doc-converter-pro', '/tmp/doc-converter-pro/job.pdf')).toBe(true);
    expect(isPathInside('/tmp/doc-converter-pro', '/tmp/doc-converter-pro-other/job.pdf')).toBe(false);
    expect(isPathInside('/tmp/doc-converter-pro', '/tmp/doc-converter-pro/../secrets.txt')).toBe(false);
  });
});
