# ScanCart

Real-world barcode product scanner with package-level MRP and expiry verification.

## How it works

1. Open Scan.
2. The rear camera starts automatically.
3. ZXing continuously detects EAN/UPC barcodes.
4. The barcode is sent to the ScanCart Worker.
5. The Worker resolves the product through Open Food Facts.
6. A captured package frame is sent to Gemma 4 31B for printed MRP, expiry and quantity extraction.
7. Missing values remain unavailable. ScanCart never invents an MRP or expiry date.

## AI configuration

The AI verifier runs server-side so the API key is never shipped to the browser.

For Cloudflare Workers, add the secret:

```bash
npx wrangler secret put GEMINI_API_KEY
```

Then redeploy the Worker.

The Worker uses the Gemini API with `gemma-4-31b-it` for package image inspection.

## Important data rule

A barcode identifies a product. It does not reliably encode the printed MRP or the expiry date of the individual package. ScanCart therefore does not treat a generic database price as MRP. MRP and expiry are only shown when they are read from the physical package by the AI verifier.

Open Food Facts supplies product identity and nutrition data. Database coverage is not universal, so an unknown barcode is reported as unknown rather than mapped to a fake product.

## Deployment

Build:

```bash
pnpm install --frozen-lockfile
pnpm run build
```

Deploy the Cloudflare Worker using the existing `wrangler.jsonc` configuration.

## Camera requirements

Camera access requires HTTPS or localhost. On iPhone Safari and Android Chrome, allow camera permission for the deployed site.
