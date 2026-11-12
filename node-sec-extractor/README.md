# SEC Filing Element Extractor (Node.js)

A small local Node.js app that lets you:

1. Paste an SEC Archives filing URL (like `https://www.sec.gov/Archives/...`).
2. Extract data elements and page numbers from the filing.
3. Download extracted output as JSON suitable for pushing to Kafka.

## Prerequisites

- Node.js 18+ (for native `fetch` support)

## Run locally

```bash
cd node-sec-extractor
npm install
npm start
```

Open: `http://localhost:3000`

## Notes

- This app currently supports SEC HTML archive pages and uses heuristic extraction.
- Page numbers are inferred based on common page break markers in filing HTML.
- Table rows are extracted as `element/value` pairs as a second pass.

## Output schema

```json
{
  "sourceUrl": "https://www.sec.gov/Archives/...",
  "extractedAt": "2026-03-25T00:00:00.000Z",
  "kafkaTopic": "sec.filing.elements",
  "pageCount": 12,
  "elementCount": 345,
  "elements": [
    {
      "pageNumber": 1,
      "element": "Document Type",
      "value": "485BPOS",
      "source": "Document Type: 485BPOS"
    }
  ]
}
```
