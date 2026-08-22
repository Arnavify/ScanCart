# ScanCart

A barcode-first shopping and nutrition assistant built with React + Vite + Tailwind CSS v4.

## Features

- Barcode scanning with staged detection states
- Product identification with honest data attribution (source + confidence badges)
- AI product analysis using OCR/AI when necessary
- Expiry date OCR flow
- Cart management with quantity steppers
- Checkout with payment methods
- Payment success screen
- Scan history
- Comprehensive error states

## Design

- Black background (#0a0a0a), dark charcoal cards (#161618/#111113)
- Orange accent (#ef602a)
- SF Pro typography
- Minimal line icons

## Prerequisites

- Node.js 20+
- pnpm

## Installation

```bash
pnpm install
```

## Running

```bash
pnpm dev
```

The app runs on http://localhost:5173 by default.

## Project Structure

- `src/App.tsx` — Primary application component with all screens
- `src/data.ts` — Typed mock product database
- `src/icons.tsx` — Cohesive icon set
- `src/index.css` — Global CSS and Tailwind v4 import
- `src/main.tsx` — React entrypoint
