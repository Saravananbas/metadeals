const express = require('express');
const path = require('path');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const SEC_ARCHIVES_HOST = 'www.sec.gov';

function isValidSecArchiveUrl(urlString) {
  try {
    const url = new URL(urlString);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.hostname === SEC_ARCHIVES_HOST &&
      url.pathname.startsWith('/Archives/')
    );
  } catch {
    return false;
  }
}

function splitIntoPages($) {
  const separators = [
    'hr',
    'a[name^="page"]',
    'a[id^="page"]',
    'div[style*="page-break"]',
    '.pagebreak',
    '.pagenum'
  ];

  const bodyHtml = $('body').html() || '';
  let markerHtml = bodyHtml;

  separators.forEach((selector) => {
    $(selector).each((_, el) => {
      const raw = $.html(el);
      markerHtml = markerHtml.replace(raw, '\n<!--PAGE_BREAK-->\n');
    });
  });

  const pages = markerHtml
    .split('<!--PAGE_BREAK-->')
    .map((chunk) => cheerio.load(`<body>${chunk}</body>`)('body').text())
    .map((text) => text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (pages.length === 0) {
    const single = $('body').text().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    return single ? [single] : [];
  }

  return pages;
}

function extractKeyValueLines(pageText) {
  const lineCandidates = pageText
    .split(/(?<=[.;])\s+|\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.length < 280);

  const kvRegex = /^([A-Za-z0-9 ,().\-/&]{2,100})\s*:\s*(.{1,160})$/;

  return lineCandidates
    .map((line) => {
      const match = line.match(kvRegex);
      if (!match) return null;
      return {
        element: match[1].trim(),
        value: match[2].trim(),
        source: line
      };
    })
    .filter(Boolean);
}

function extractTableElements($, pageNumber) {
  const items = [];

  $('table').each((tableIndex, table) => {
    const rows = $(table).find('tr');
    rows.each((rowIndex, row) => {
      const cells = $(row)
        .find('th, td')
        .map((_, cell) => $(cell).text().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim())
        .get()
        .filter(Boolean);

      if (cells.length >= 2) {
        items.push({
          pageNumber,
          element: cells[0],
          value: cells.slice(1).join(' | '),
          source: `table-${tableIndex + 1}-row-${rowIndex + 1}`
        });
      }
    });
  });

  return items;
}

function extractElementsFromHtml(html) {
  const $ = cheerio.load(html);
  const pages = splitIntoPages($);
  const elements = [];

  pages.forEach((pageText, pageIndex) => {
    const pageNumber = pageIndex + 1;
    const kvLines = extractKeyValueLines(pageText);
    kvLines.forEach((item) => {
      elements.push({ pageNumber, ...item });
    });
  });

  const tableElements = extractTableElements($, 1);
  elements.push(...tableElements);

  const dedup = new Map();
  elements.forEach((item) => {
    const key = `${item.pageNumber}|${item.element}|${item.value}`;
    if (!dedup.has(key)) {
      dedup.set(key, item);
    }
  });

  return {
    pageCount: pages.length || 1,
    elements: Array.from(dedup.values())
  };
}

app.post('/api/extract', async (req, res) => {
  const { filingUrl, kafkaTopic } = req.body || {};

  if (!filingUrl || !isValidSecArchiveUrl(filingUrl)) {
    return res.status(400).json({
      message: 'Please provide a valid SEC archives URL, e.g. https://www.sec.gov/Archives/...'
    });
  }

  try {
    const response = await fetch(filingUrl, {
      headers: {
        'User-Agent': 'sec-filing-element-extractor/1.0 (local-dev@example.com)',
        Accept: 'text/html,application/xhtml+xml'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        message: `Failed to fetch filing URL. HTTP ${response.status}`
      });
    }

    const html = await response.text();
    const extraction = extractElementsFromHtml(html);

    const payload = {
      sourceUrl: filingUrl,
      extractedAt: new Date().toISOString(),
      kafkaTopic: kafkaTopic || 'sec.filing.elements',
      pageCount: extraction.pageCount,
      elementCount: extraction.elements.length,
      elements: extraction.elements
    };

    return res.json(payload);
  } catch (error) {
    return res.status(500).json({
      message: 'Unable to fetch or parse the SEC filing URL.',
      error: error.message
    });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`SEC extractor UI running at http://localhost:${PORT}`);
});
