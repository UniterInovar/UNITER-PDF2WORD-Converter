import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  CloudUpload,
  FileCheck2,
  FileText,
  Files,
  FlaskConical,
  Loader2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Direction = 'pdf_to_word' | 'word_to_pdf';
type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';
type Job = {
  id: string;
  filename: string;
  direction: Direction;
  directionLabel: string;
  status: JobStatus;
  progress: number;
  message: string;
  error: string | null;
  fileSize: number;
  duration: number | null;
  createdAt: string;
  completedAt: string | null;
  downloadUrl: string | null;
};

const SESSION_KEY = 'doc-converter-pro-session';
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function getSessionId() {
  const stored = window.localStorage.getItem(SESSION_KEY);
  if (stored) return stored;
  const next = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(SESSION_KEY, next);
  return next;
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function formatDuration(value: number | null) {
  if (!value) return '—';
  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;
}

function acceptedExtensions(direction: Direction) {
  return direction === 'pdf_to_word' ? '.pdf' : '.doc,.docx';
}

function isSupportedFile(file: File, direction: Direction) {
  const extension = `.${file.name.split('.').pop()?.toLowerCase() || ''}`;
  return (direction === 'pdf_to_word' && extension === '.pdf') || (direction === 'word_to_pdf' && ['.doc', '.docx'].includes(extension));
}

function statusTone(status: JobStatus) {
  if (status === 'completed') return 'bg-[#e5f2eb] text-[#216c4b]';
  if (status === 'failed') return 'bg-[#fae9e6] text-[#a34435]';
  if (status === 'processing') return 'bg-[#e6eff8] text-[#2f6090]';
  return 'bg-[#f5eee1] text-[#8d6e38]';
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [direction, setDirection] = useState<Direction>('pdf_to_word');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [history, setHistory] = useState<Job[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  const isBusy = activeJob?.status === 'queued' || activeJob?.status === 'processing';
  const outputLabel = direction === 'pdf_to_word' ? 'DOCX' : 'PDF';
  const inputLabel = direction === 'pdf_to_word' ? 'PDF' : 'Word';

  const loadHistory = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/history?sessionId=${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!response.ok) return;
      const result = await response.json();
      setHistory(result.history || []);
    } catch {
      // History is an enhancement; do not interrupt the primary conversion flow.
    }
  }, []);

  useEffect(() => {
    const id = getSessionId();
    setSessionId(id);
    void loadHistory(id);
    return () => eventSourceRef.current?.close();
  }, [loadHistory]);

  const subscribeToJob = useCallback((job: Job, id: string) => {
    eventSourceRef.current?.close();
    const stream = new EventSource(`/api/conversions/${job.id}/events?sessionId=${encodeURIComponent(id)}`);
    eventSourceRef.current = stream;
    stream.onmessage = (event) => {
      try {
        const next = JSON.parse(event.data) as Job;
        setActiveJob(next);
        setHistory((current) => [next, ...current.filter((item) => item.id !== next.id)]);
        if (next.status === 'completed' || next.status === 'failed') {
          stream.close();
          eventSourceRef.current = null;
        }
      } catch {
        setError('The live progress stream returned an invalid update.');
      }
    };
    stream.onerror = () => {
      if (activeJob?.status === 'completed' || activeJob?.status === 'failed') stream.close();
    };
  }, [activeJob?.status]);

  const chooseFile = (file: File | null) => {
    if (!file) return;
    setError('');
    if (!isSupportedFile(file, direction)) {
      setSelectedFile(null);
      setError(direction === 'pdf_to_word' ? 'PDF to Word accepts PDF files only.' : 'Word to PDF accepts DOC and DOCX files only.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setSelectedFile(null);
      setError('This file is larger than the 50 MB limit.');
      return;
    }
    setSelectedFile(file);
    setActiveJob(null);
  };

  const changeDirection = (next: Direction) => {
    setDirection(next);
    setSelectedFile(null);
    setActiveJob(null);
    setError('');
  };

  const submitConversion = async () => {
    if (!selectedFile || !sessionId || isSubmitting || isBusy) return;
    setIsSubmitting(true);
    setError('');
    eventSourceRef.current?.close();
    try {
      const body = new FormData();
      body.append('file', selectedFile);
      body.append('direction', direction);
      const response = await fetch('/api/conversions', {
        method: 'POST',
        headers: { 'x-session-id': sessionId },
        body,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The conversion could not be started.');
      const job = result.job as Job;
      setActiveJob(job);
      setHistory((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      subscribeToJob(job, sessionId);
    } catch (conversionError) {
      setError(conversionError instanceof Error ? conversionError.message : 'The conversion could not be started.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearActive = () => {
    eventSourceRef.current?.close();
    setActiveJob(null);
    setSelectedFile(null);
    setError('');
  };

  const helperText = useMemo(() => direction === 'pdf_to_word'
    ? 'Rebuild editable text while keeping page layout, figures, tables, and diagrams in place.'
    : 'Render the Word source through LibreOffice for a faithful PDF export, including formulas and embedded artwork.', [direction]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f7f8f6] text-[#15221d]">
      <div className="pointer-events-none fixed inset-0 -z-0 opacity-70" aria-hidden="true">
        <div className="absolute -left-44 top-24 h-96 w-96 rounded-full bg-[#e1f1e8] blur-3xl" />
        <div className="absolute right-[-11rem] top-[25rem] h-[32rem] w-[32rem] rounded-full bg-[#eef0fb] blur-3xl" />
      </div>

      <header className="relative z-10 border-b border-[#dce4df] bg-[#f7f8f6]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#173f34] text-[#dff4e7] shadow-[0_8px_24px_rgba(23,63,52,0.18)]">
              <Files className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div>
              <p className="font-display text-[16px] font-semibold tracking-[-0.02em] text-[#173f34]">UNITER document converter</p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7b8a84]">quietly precise</p>
            </div>
          </div>
          <div className="hidden items-center gap-7 text-[12px] font-medium text-[#708079] sm:flex">
            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#5f8d73]" /> Private by design</span>
            <span className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-[#5f8d73]" /> Files auto-delete after download</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#dce4df] bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-[#4f6960] shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[#5caa78] shadow-[0_0_0_4px_rgba(92,170,120,0.12)]" />
            Ready
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1280px] px-5 pb-20 pt-12 sm:px-8 sm:pt-16 lg:px-12">
        <section className="grid gap-12 lg:grid-cols-[1fr_0.95fr] lg:items-end">
          <div className="max-w-[660px]">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#cee3d5] bg-[#ecf7ef] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#477b5c]">
              <Sparkles className="h-3.5 w-3.5" /> Document fidelity, elevated
            </div>
            <h1 className="font-display text-[clamp(42px,6.5vw,82px)] font-semibold leading-[0.96] tracking-[-0.07em] text-[#15372d]">
              Move documents.<br /><span className="text-[#6a9b78]">Keep everything.</span>
            </h1>
            <p className="mt-7 max-w-[570px] text-[16px] leading-7 text-[#66766f] sm:text-[18px] sm:leading-8">
              A considered PDF and Word conversion workspace for documents where structure matters — from editorial layouts to technical diagrams and chemical formulae.
            </p>
          </div>
          <div className="hidden justify-end lg:flex">
            <div className="max-w-[300px] border-l border-[#cadbd1] pl-6 text-sm leading-6 text-[#718079]">
              <p className="mb-3 font-display text-[18px] font-medium leading-6 text-[#315948]">Made for the details most converters overlook.</p>
              <p>Embedded imagery, tables, diagrams, and the visual rhythm of your original file remain at the centre of the process.</p>
            </div>
          </div>
        </section>

        <section className="mt-12 grid gap-6 lg:mt-16 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="rounded-[28px] border border-[#dce6df] bg-white/85 p-4 shadow-[0_24px_80px_rgba(41,78,58,0.09)] backdrop-blur-xl sm:p-6">
            <div className="flex flex-col justify-between gap-5 border-b border-[#edf1ee] pb-5 sm:flex-row sm:items-center">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#7a8d84]">Choose a workflow</p>
                <h2 className="mt-1.5 font-display text-[24px] font-semibold tracking-[-0.035em] text-[#193d31]">How would you like to convert?</h2>
              </div>
              <div className="flex rounded-full bg-[#f0f4f1] p-1">
                <button type="button" onClick={() => changeDirection('pdf_to_word')} className={`flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-bold transition-all duration-200 active:scale-[0.98] ${direction === 'pdf_to_word' ? 'bg-[#193f33] text-white shadow-[0_5px_15px_rgba(25,63,51,0.2)]' : 'text-[#72837b] hover:text-[#315948]'}`}>
                  PDF <ArrowRight className="h-3.5 w-3.5" /> Word
                </button>
                <button type="button" onClick={() => changeDirection('word_to_pdf')} className={`flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-bold transition-all duration-200 active:scale-[0.98] ${direction === 'word_to_pdf' ? 'bg-[#193f33] text-white shadow-[0_5px_15px_rgba(25,63,51,0.2)]' : 'text-[#72837b] hover:text-[#315948]'}`}>
                  Word <ArrowRight className="h-3.5 w-3.5" /> PDF
                </button>
              </div>
            </div>

            <div className="relative mt-6">
              <input ref={inputRef} type="file" accept={acceptedExtensions(direction)} className="sr-only" onChange={(event) => chooseFile(event.target.files?.[0] || null)} />
              <button type="button" disabled={Boolean(isBusy)} onClick={() => inputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); chooseFile(event.dataTransfer.files?.[0] || null); }} className={`group flex min-h-[270px] w-full flex-col items-center justify-center rounded-[22px] border border-dashed px-6 text-center transition-all duration-200 ${isDragging ? 'border-[#5b9d76] bg-[#effaf2] shadow-[inset_0_0_0_1px_#6ca981]' : 'border-[#bdcfc4] bg-[#fbfcfb] hover:border-[#76a987] hover:bg-[#f4faf5]'} ${isBusy ? 'cursor-not-allowed opacity-70' : ''}`}>
                {selectedFile ? (
                  <div className="flex w-full max-w-[470px] items-center gap-4 rounded-2xl border border-[#d6e8db] bg-white p-4 text-left shadow-sm">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e8f4eb] text-[#3c8258]">
                      <FileText className="h-6 w-6" strokeWidth={1.7} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold text-[#214337]">{selectedFile.name}</p>
                      <p className="mt-1 text-[12px] text-[#819089]">{formatBytes(selectedFile.size)} · {inputLabel} source</p>
                    </div>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eff7f1] text-[#5f9870]"><Check className="h-4 w-4" /></span>
                  </div>
                ) : (
                  <>
                    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] bg-[#eaf4ed] text-[#4d9567] transition-transform duration-200 group-hover:-translate-y-1">
                      <CloudUpload className="h-7 w-7" strokeWidth={1.5} />
                    </div>
                    <p className="font-display text-[21px] font-semibold tracking-[-0.03em] text-[#284c3d]">Drop your {inputLabel} here</p>
                    <p className="mt-2 text-[13px] text-[#83928b]">or <span className="font-bold text-[#4e8b63]">browse your files</span> to get started</p>
                    <div className="mt-5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#9ba9a2]"><span>{direction === 'pdf_to_word' ? 'PDF' : 'DOC / DOCX'}</span><span className="h-1 w-1 rounded-full bg-[#c5d4cb]" /><span>Up to 50 MB</span></div>
                  </>
                )}
              </button>
              {selectedFile && !isBusy && !activeJob && <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedFile(null); }} className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#779087] shadow-sm ring-1 ring-[#e1eae3] transition hover:text-[#b05143]" aria-label="Remove selected file"><X className="h-4 w-4" /></button>}
            </div>

            <div className="mt-5 flex flex-col items-start justify-between gap-4 rounded-2xl bg-[#f5f8f5] px-4 py-4 sm:flex-row sm:items-center sm:px-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 text-[#679579]"><FileCheck2 className="h-4 w-4" /></div>
                <div><p className="text-[12px] font-bold text-[#466357]">High-fidelity {inputLabel} → {outputLabel}</p><p className="mt-0.5 max-w-[510px] text-[11px] leading-5 text-[#83928b]">{helperText}</p></div>
              </div>
              <button type="button" disabled={!selectedFile || Boolean(isBusy) || isSubmitting} onClick={submitConversion} className="flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#244e3e] px-5 py-3 text-[12px] font-bold text-white shadow-[0_8px_18px_rgba(36,78,62,0.2)] transition duration-200 hover:bg-[#193f33] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#b6c7bd] disabled:shadow-none sm:w-auto">
                {isSubmitting || isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {isSubmitting ? 'Preparing…' : isBusy ? 'Converting…' : 'Convert file'}
              </button>
            </div>

            {error && <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#f1d1cc] bg-[#fff5f3] px-4 py-3 text-[12px] leading-5 text-[#9d493b]"><X className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

            {activeJob && <div className="mt-6 overflow-hidden rounded-2xl border border-[#dce7df] bg-white">
              <div className="flex items-center justify-between gap-4 border-b border-[#edf1ee] px-4 py-4 sm:px-5">
                <div className="flex min-w-0 items-center gap-3"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${activeJob.status === 'failed' ? 'bg-[#fbeceb] text-[#aa5141]' : activeJob.status === 'completed' ? 'bg-[#e8f5eb] text-[#4f9567]' : 'bg-[#e8f0f8] text-[#4f7da4]'}`}>{activeJob.status === 'completed' ? <Check className="h-5 w-5" /> : activeJob.status === 'failed' ? <X className="h-5 w-5" /> : <RefreshCw className="h-5 w-5 animate-spin" />}</div><div className="min-w-0"><p className="truncate text-[13px] font-bold text-[#294c3d]">{activeJob.filename}</p><p className="mt-1 text-[11px] text-[#87958e]">{activeJob.directionLabel} · {formatBytes(activeJob.fileSize)}</p></div></div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.11em] ${statusTone(activeJob.status)}`}>{activeJob.status === 'completed' ? 'Ready' : activeJob.status === 'failed' ? 'Failed' : activeJob.status === 'processing' ? 'Processing' : 'Queued'}</span>
              </div>
              <div className="px-4 py-5 sm:px-5">
                <div className="mb-3 flex items-center justify-between text-[11px] font-semibold text-[#74857c]"><span>{activeJob.message}</span><span className="tabular-nums text-[#315948]">{activeJob.progress}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-[#edf2ee]"><div className={`h-full rounded-full transition-[width] duration-500 ${activeJob.status === 'failed' ? 'bg-[#bb6b5c]' : 'bg-[#5b9a72]'}`} style={{ width: `${activeJob.status === 'failed' ? 100 : activeJob.progress}%` }} /></div>
                {activeJob.error && <p className="mt-4 rounded-xl bg-[#fff5f3] px-3 py-2 text-[11px] leading-5 text-[#9d493b]">{activeJob.error}</p>}
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><button type="button" onClick={() => setShowDetails((value) => !value)} className="flex items-center gap-1 text-left text-[11px] font-bold text-[#6d8278] hover:text-[#315948]">Conversion details <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showDetails ? 'rotate-180' : ''}`} /></button>{activeJob.status === 'completed' && activeJob.downloadUrl && <a href={activeJob.downloadUrl} onClick={() => setTimeout(() => void loadHistory(sessionId), 800)} className="flex items-center justify-center gap-2 rounded-xl bg-[#e9f5eb] px-4 py-2.5 text-[12px] font-bold text-[#35754e] transition hover:bg-[#dcefe0]"><ArrowDownToLine className="h-4 w-4" /> Download {outputLabel}</a>}{activeJob.status === 'failed' && <button type="button" onClick={clearActive} className="rounded-xl bg-[#f2f5f2] px-4 py-2.5 text-[12px] font-bold text-[#527064] hover:bg-[#e9eee9]">Try another file</button>}</div>
                {showDetails && <div className="mt-4 grid gap-3 border-t border-[#edf1ee] pt-4 text-[11px] text-[#829189] sm:grid-cols-3"><div><span className="block uppercase tracking-[0.1em] text-[#a2afa8]">Source</span><strong className="mt-1 block font-semibold text-[#516a5e]">{inputLabel}</strong></div><div><span className="block uppercase tracking-[0.1em] text-[#a2afa8]">Output</span><strong className="mt-1 block font-semibold text-[#516a5e]">{outputLabel}</strong></div><div><span className="block uppercase tracking-[0.1em] text-[#a2afa8]">Duration</span><strong className="mt-1 block font-semibold text-[#516a5e]">{formatDuration(activeJob.duration)}</strong></div></div>}
              </div>
            </div>}
          </div>

          <aside className="rounded-[28px] border border-[#dce6df] bg-[#173f34] p-6 text-[#ecf8ef] shadow-[0_24px_80px_rgba(30,76,54,0.13)] sm:p-7">
            <div className="flex items-center justify-between"><p className="text-[11px] font-bold uppercase tracking-[0.19em] text-[#9dc9a9]">Why DocConverter</p><FlaskConical className="h-5 w-5 text-[#89ba99]" strokeWidth={1.6} /></div>
            <h2 className="mt-5 font-display text-[26px] font-semibold leading-8 tracking-[-0.04em]">Thoughtful handling for serious documents.</h2>
            <div className="mt-8 space-y-5">
              <div className="flex gap-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#2d5d4b] text-[#b4dfbd]"><ShieldCheck className="h-3.5 w-3.5" /></span><div><p className="text-[13px] font-bold">Structure-aware conversion</p><p className="mt-1 text-[11px] leading-5 text-[#a9c6b2]">Text flow, images, tables, and diagrams are handled as part of the document — not flattened into a screenshot.</p></div></div>
              <div className="flex gap-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#2d5d4b] text-[#b4dfbd]"><FlaskConical className="h-3.5 w-3.5" /></span><div><p className="text-[13px] font-bold">Technical detail stays visible</p><p className="mt-1 text-[11px] leading-5 text-[#a9c6b2]">A practical workflow for formula-rich scientific files, embedded artwork, and dense layouts.</p></div></div>
              <div className="flex gap-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#2d5d4b] text-[#b4dfbd]"><Clock3 className="h-3.5 w-3.5" /></span><div><p className="text-[13px] font-bold">Clear, live progress</p><p className="mt-1 text-[11px] leading-5 text-[#a9c6b2]">See what is happening now, from upload to final rendering, without guessing at a frozen spinner.</p></div></div>
            </div>
            <div className="mt-9 border-t border-[#37604f] pt-5 text-[11px] leading-5 text-[#9fc0aa]">Temporary files are removed after the download response finishes.</div>
          </aside>
        </section>

        <section className="mt-10 border-t border-[#dce6df] pt-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#83928b]">This session</p><h2 className="mt-1.5 font-display text-[25px] font-semibold tracking-[-0.04em] text-[#193d31]">Recent conversions</h2></div><p className="flex items-center gap-2 text-[11px] text-[#8a9992]"><LockKeyhole className="h-3.5 w-3.5" /> Stored only in this browser session</p></div>
          {history.length === 0 ? <div className="mt-5 flex min-h-[130px] items-center justify-center rounded-2xl border border-dashed border-[#cbd9d0] bg-white/45 text-center"><div><p className="text-[13px] font-semibold text-[#60776b]">Your conversion history will appear here.</p><p className="mt-1 text-[11px] text-[#91a098]">Start with a document above — the latest status will stay close at hand.</p></div></div> : <div className="mt-5 overflow-hidden rounded-2xl border border-[#dce6df] bg-white/70"><div className="divide-y divide-[#edf1ee]">{history.slice(0, 6).map((item) => <div key={item.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eef5f0] text-[#5d8e6c]"><FileText className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate text-[12px] font-bold text-[#365747]">{item.filename}</p><p className="mt-1 text-[10px] text-[#95a19b]">{item.directionLabel} · {formatDate(item.createdAt)}</p></div></div><div className="flex items-center justify-between gap-5 sm:justify-end"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${statusTone(item.status)}`}>{item.status === 'completed' ? 'Ready' : item.status === 'failed' ? 'Failed' : item.status === 'processing' ? 'Processing' : 'Queued'}</span>{item.downloadUrl && <a href={item.downloadUrl} className="text-[11px] font-bold text-[#4e8b63] hover:text-[#245d40]">Download</a>}</div></div>)}</div></div>}
        </section>
      </main>

      <footer className="relative z-10 border-t border-[#dce6df] py-6"><div className="mx-auto flex max-w-[1280px] flex-col justify-between gap-2 px-5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9aa8a0] sm:flex-row sm:px-8 lg:px-12"><span>DocConverter Pro</span><span>PDF · DOC · DOCX</span></div></footer>
    </div>
  );
}
