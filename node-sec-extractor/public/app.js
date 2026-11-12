const form = document.getElementById('extract-form');
const statusEl = document.getElementById('status');
const summaryEl = document.getElementById('summary');
const summaryContentEl = document.getElementById('summary-content');
const resultsEl = document.getElementById('results');
const resultsBodyEl = document.getElementById('resultsBody');
const downloadBtn = document.getElementById('downloadJsonBtn');

let latestPayload = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#b91c1c' : '#0f172a';
}

function renderResults(payload) {
  summaryEl.classList.remove('hidden');
  resultsEl.classList.remove('hidden');

  summaryContentEl.innerHTML = `
    <p><strong>Source URL:</strong> ${payload.sourceUrl}</p>
    <p><strong>Kafka Topic:</strong> ${payload.kafkaTopic}</p>
    <p><strong>Extracted At:</strong> ${payload.extractedAt}</p>
    <p><strong>Pages Detected:</strong> ${payload.pageCount}</p>
    <p><strong>Total Elements:</strong> ${payload.elementCount}</p>
  `;

  resultsBodyEl.innerHTML = '';
  payload.elements.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.pageNumber ?? ''}</td>
      <td>${item.element ?? ''}</td>
      <td>${item.value ?? ''}</td>
      <td>${item.source ?? ''}</td>
    `;
    resultsBodyEl.appendChild(tr);
  });
}

function downloadJson(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sec-elements-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('Extracting from SEC filing...');

  const formData = new FormData(form);
  const filingUrl = formData.get('filingUrl');
  const kafkaTopic = formData.get('kafkaTopic');

  summaryEl.classList.add('hidden');
  resultsEl.classList.add('hidden');

  try {
    const response = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filingUrl, kafkaTopic })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Extraction failed.');
    }

    latestPayload = payload;
    renderResults(payload);
    setStatus('Extraction complete. You can now download the JSON payload.');
  } catch (error) {
    latestPayload = null;
    setStatus(error.message, true);
  }
});

downloadBtn.addEventListener('click', () => {
  if (!latestPayload) {
    setStatus('No payload available to download yet.', true);
    return;
  }
  downloadJson(latestPayload);
});
