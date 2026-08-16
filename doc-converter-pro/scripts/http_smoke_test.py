import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

BASE_URL = os.environ.get('DOC_CONVERTER_URL', 'http://127.0.0.1:3000')
ROOT = Path('/tmp/doc-converter-smoke')
SESSION = 'smoke-session-2026'


def mime_for(source: Path) -> str:
    return 'application/pdf' if source.suffix.lower() == '.pdf' else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'


def start_job(source: Path, direction: str, session: str):
    with source.open('rb') as handle:
        response = requests.post(
            f'{BASE_URL}/api/conversions',
            headers={'x-session-id': session},
            files={'file': (source.name, handle, mime_for(source))},
            data={'direction': direction},
            timeout=20,
        )
    if not response.ok:
        raise RuntimeError(f'Upload failed with {response.status_code}: {response.text}')
    job = response.json()['job']
    assert job['status'] in {'queued', 'processing'}
    return job


def wait_for_job(job, session: str):
    events = []
    with requests.get(
        f"{BASE_URL}/api/conversions/{job['id']}/events",
        params={'sessionId': session},
        stream=True,
        timeout=90,
    ) as stream:
        stream.raise_for_status()
        for raw in stream.iter_lines(decode_unicode=True):
            if not raw or not raw.startswith('data: '):
                continue
            event = json.loads(raw[6:])
            events.append(event)
            if event['status'] in {'completed', 'failed'}:
                job = event
                break
    assert events, 'SSE returned no events'
    assert job['status'] == 'completed', job
    assert job['downloadUrl'], job
    return job, len(events)


def download_and_verify(job, events: int, output: Path):
    download = requests.get(f'{BASE_URL}{job["downloadUrl"]}', timeout=30)
    download.raise_for_status()
    output.write_bytes(download.content)
    assert output.stat().st_size > 0
    time.sleep(0.2)
    gone = requests.get(f'{BASE_URL}{job["downloadUrl"]}', timeout=10)
    assert gone.status_code in {403, 404}, gone.text
    return {'id': job['id'], 'events': events, 'bytes': output.stat().st_size, 'cleanup_status': gone.status_code}


def convert(source: Path, direction: str, output: Path, session: str = SESSION):
    job = start_job(source, direction, session)
    completed, events = wait_for_job(job, session)
    return download_and_verify(completed, events, output)


def concurrent_conversion_check():
    session = 'concurrent-session-2026'
    source = ROOT / 'chemistry-layout.pdf'
    with ThreadPoolExecutor(max_workers=2) as executor:
        jobs = list(executor.map(lambda _: start_job(source, 'pdf_to_word', session), range(2)))
    assert len({job['id'] for job in jobs}) == 2
    outputs = [ROOT / 'concurrent-a.docx', ROOT / 'concurrent-b.docx']
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda pair: download_and_verify(*wait_for_job(pair[0], session), pair[1]), zip(jobs, outputs)))
    assert all(result['bytes'] > 0 for result in results)
    return results


pdf_result = convert(ROOT / 'chemistry-layout.pdf', 'pdf_to_word', ROOT / 'converted-chemistry.docx')
docx_result = convert(ROOT / 'technical-layout.docx', 'word_to_pdf', ROOT / 'converted-technical.pdf')
concurrent_results = concurrent_conversion_check()

unsupported = ROOT / 'unsupported.txt'
unsupported.write_text('not a document\n')
with unsupported.open('rb') as handle:
    rejected = requests.post(
        f'{BASE_URL}/api/conversions',
        headers={'x-session-id': 'error-session-2026'},
        files={'file': (unsupported.name, handle, 'text/plain')},
        data={'direction': 'pdf_to_word'},
        timeout=20,
    )
assert rejected.status_code == 400

history = requests.get(f'{BASE_URL}/api/history', params={'sessionId': SESSION}, timeout=10)
history.raise_for_status()
history_items = history.json()['history']
assert len(history_items) >= 2
other_history = requests.get(f'{BASE_URL}/api/history', params={'sessionId': 'other-session-2026'}, timeout=10)
other_history.raise_for_status()
assert other_history.json()['history'] == []

print(json.dumps({
    'pdf_to_word': pdf_result,
    'word_to_pdf': docx_result,
    'concurrent_jobs': concurrent_results,
    'history_items': len(history_items),
    'unsupported_status': rejected.status_code,
    'other_session_items': len(other_history.json()['history']),
}, indent=2))
