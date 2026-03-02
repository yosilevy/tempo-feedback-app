# Tempo Feedback Coach (PWA)

Single-player tempo and volume awareness app designed for quick practice with a blinking beat target and microphone feedback.

## Features (current)

- Mode selector with Single enabled and Dual placeholder
- Tempo level selector (1-10, default 5)
- Volume level selector (1-3, default 2)
- Start button that becomes `🏃 Let’s go!`
- Red square blink synchronized to target tempo
- Microphone hit detection with tempo feedback:
  - Green: Good!
  - Red: Too fast
  - Blue: Too slow
- Volume feedback and live mic meter
- Installable PWA with offline caching

## Local run

1. Install Node.js 20+.
2. Install deps:

```bash
npm install
```

3. Start dev server:

```bash
npm run dev
```

4. Open `http://localhost:5173`, tap `Start`, and allow microphone permission.

## GitHub Pages deploy

1. Push this repo to GitHub (default branch `main`).
2. In repository settings, ensure **Pages** source is **GitHub Actions**.
3. The included workflow in `.github/workflows/deploy.yml` builds and deploys automatically on push to `main`.

## Tempo & audio model

- Tempo level mapping: `1..10 -> 40..180 BPM`
- Beat interval: `60000 / BPM`
- Hit detection: RMS energy over time-domain samples
- Classification:
  - within ±15% interval tolerance: Good
  - shorter interval: Too fast
  - longer interval: Too slow
