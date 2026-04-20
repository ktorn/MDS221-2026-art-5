# MDS221-2026-art-5
MDS221-2026-art-5

## Run the p5.js interactive exhibit

The sketch lives in `digital/` and uses `digital/assets/image.png` as the visual reference.

### Option 1: Open directly

1. Go to `digital/`
2. Open `index.html` in your browser

### Option 2: Run with a local server (recommended)

Using a local server avoids browser security issues and is better for future sensor integration.

If you have Node.js:

```bash
npx serve digital
```

Then open the URL shown in terminal (usually `http://localhost:3000`).

## Controls

- `UP ARROW`: increase simulated light level
- `DOWN ARROW`: decrease simulated light level

The debug pane in the top-left corner shows current light values.
