import { readFile, writeFile } from 'node:fs/promises';

const baseUrl = process.env.DOC_CONVERTER_URL ?? 'http://127.0.0.1:3401';
const sessionId = 'prod-smoke-session';
const sourcePath = '/tmp/doc-converter-smoke/chemistry-layout.pdf';

async function upload() {
  const form = new FormData();
  form.append('file', new Blob([await readFile(sourcePath)], { type: 'application/pdf' }), 'chemistry-layout.pdf');
  form.append('direction', 'pdf_to_word');
  const response = await fetch(`${baseUrl}/api/conversions`, {
    method: 'POST',
    headers: { 'x-session-id': sessionId },
    body: form,
  });
  if (!response.ok) throw new Error(`upload failed: ${response.status} ${await response.text()}`);
  return (await response.json()).job;
}

const job = await upload();
const eventsResponse = await fetch(`${baseUrl}/api/conversions/${job.id}/events?sessionId=${sessionId}`);
if (!eventsResponse.ok) throw new Error(`events failed: ${eventsResponse.status}`);
const eventText = await eventsResponse.text();
const events = eventText
  .split(/\n/)
  .filter(line => line.startsWith('data: '))
  .map(line => JSON.parse(line.slice(6)));
const completed = events.at(-1);
if (!completed || completed.status !== 'completed' || !completed.downloadUrl) {
  throw new Error(`conversion did not complete: ${eventText}`);
}

const downloadUrl = `${baseUrl}${completed.downloadUrl}`;
const output = await fetch(downloadUrl);
if (!output.ok) throw new Error(`download failed: ${output.status}`);
await writeFile('/tmp/prod-output.docx', Buffer.from(await output.arrayBuffer()));
const secondDownload = await fetch(downloadUrl);
if (secondDownload.status !== 403 && secondDownload.status !== 404) {
  throw new Error(`download was not invalidated after first use: ${secondDownload.status}`);
}
console.log(JSON.stringify({ jobId: job.id, events: events.length, outputBytes: (await readFile('/tmp/prod-output.docx')).byteLength, cleanupStatus: secondDownload.status }, null, 2));
