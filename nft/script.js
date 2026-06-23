"use strict";

const creator = new URLSearchParams(window.location.search).get("creator");
const viewer = new URLSearchParams(window.location.search).get("viewer");

const GRID_COLS = 34;
const GRID_ROWS = 46;
const MARGIN_RATIO = 0.09;
const NOISE_SCALE = 0.045;
const PALETTE_HEX = ["#D95F69", "#B0BF8F", "#F2DA5E", "#D99696", "#5EA4BF"];

let sourceImage;
let cells = [];
let paletteColors = [];
let lightLevel = 0.7;
let targetLightLevel = 0.7;

function preload() {
  sourceImage = loadImage("./assets/image.png");
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  colorMode(HSB, 360, 100, 100, 100);
  noStroke();
  paletteColors = PALETTE_HEX.map((hex) => {
    const rgb = hexToRgb(hex);
    return {
      ...rgb,
      swatch: color(hex),
    };
  });
  buildCellsFromImage();
}

function draw() {
  background(42, 8, 94);

  lightLevel = lerp(lightLevel, targetLightLevel, 0.08);

  const frameT = frameCount * 0.0045;
  const paintingArea = getPaintingArea();

  push();
  translate(paintingArea.x, paintingArea.y);
  drawPaperBackdrop(paintingArea.w, paintingArea.h, frameT);
  drawLivingCells(paintingArea.w, paintingArea.h, frameT);
  pop();
}

function buildCellsFromImage() {
  cells = [];
  sourceImage.loadPixels();
  const occupied = Array.from({ length: GRID_ROWS }, () =>
    Array(GRID_COLS).fill(false)
  );

  for (let gy = 0; gy < GRID_ROWS; gy++) {
    for (let gx = 0; gx < GRID_COLS; gx++) {
      if (occupied[gy][gx]) continue;

      const blockW = pickPatchSpan();
      const blockH = pickPatchSpan();
      const gw = min(blockW, GRID_COLS - gx);
      const gh = min(blockH, GRID_ROWS - gy);

      for (let by = 0; by < gh; by++) {
        for (let bx = 0; bx < gw; bx++) {
          occupied[gy + by][gx + bx] = true;
        }
      }

      const u = (gx + gw * 0.5) / GRID_COLS;
      const v = (gy + gh * 0.5) / GRID_ROWS;
      const sx = floor(u * sourceImage.width);
      const sy = floor(v * sourceImage.height);
      const sampled = sourceImage.get(sx, sy);
      const c = findNearestPaletteColor(sampled[0], sampled[1], sampled[2]);

      cells.push({
        gx,
        gy,
        gw,
        gh,
        baseColor: c,
        phase: random(TWO_PI),
        jitterX: random(-0.08, 0.08),
        jitterY: random(-0.08, 0.08),
        energyBias: random(0.65, 1.0),
      });
    }
  }
}

function drawPaperBackdrop(w, h, frameT) {
  push();
  noStroke();
  fill(44, 7, 98, 100);
  rect(0, 0, w, h, 8);

  for (let y = 0; y < h; y += 5) {
    const n = noise(20, y * 0.013, frameT * 0.05);
    const b = map(n, 0, 1, 88, 99);
    fill(38, 7, b, 16);
    rect(0, y, w, 5);
  }
  pop();
}

function drawLivingCells(areaW, areaH, frameT) {
  const cw = areaW / GRID_COLS;
  const ch = areaH / GRID_ROWS;

  for (const cell of cells) {
    const px = (cell.gx + cell.gw * 0.5 + cell.jitterX) * cw;
    const py = (cell.gy + cell.gh * 0.5 + cell.jitterY) * ch;

    const noiseLife = noise(
      cell.gx * NOISE_SCALE,
      cell.gy * NOISE_SCALE,
      frameT * 0.35 + cell.phase
    );

    let vitality = lightLevel * cell.energyBias + (noiseLife - 0.5) * 0.22;
    vitality = constrain(vitality, 0, 1);

    const fade = pow(vitality, 1.15);
    const grow = map(vitality, 0, 1, 0.82, 1.06);
    const dyingDrop = map(1 - vitality, 0, 1, 0, ch * 0.55);

    const base = cell.baseColor;
    const hh = hue(base);
    const ss = saturation(base);
    const bb = brightness(base);

    const outS = lerp(5, ss, fade);
    const outB = lerp(bb * 0.36, bb, fade);
    const outA = lerp(18, 92, fade);

    const wobbleX = sin(frameT * 0.36 + cell.phase) * cw * 0.03 * vitality;
    const wobbleY = cos(frameT * 0.31 + cell.phase) * ch * 0.03 * vitality;
    const rw = cw * cell.gw * grow;
    const rh = ch * cell.gh * grow;

    fill(hh, outS, outB, outA);
    rect(
      px - rw * 0.5 + wobbleX,
      py - rh * 0.5 + wobbleY + dyingDrop,
      rw,
      rh,
      min(rw, rh) * 0.08
    );

    const edgeChance = noise(cell.gx * 0.14 + 5, cell.gy * 0.18 - 2);
    if (edgeChance > 0.56 && vitality > 0.16) {
      fill(hh, max(outS - 18, 4), max(outB - 22, 5), outA * 0.42);
      const aw = rw * random(0.86, 1.02);
      const ah = rh * random(0.86, 1.02);
      rect(
        px - aw * 0.5 + wobbleX + random(-cw * 0.04, cw * 0.04),
        py - ah * 0.5 + wobbleY + dyingDrop + random(-ch * 0.04, ch * 0.04),
        aw,
        ah,
        min(aw, ah) * 0.06
      );
    }
  }
}

function pickPatchSpan() {
  const r = random();
  if (r < 0.54) return 1;
  if (r < 0.82) return 2;
  if (r < 0.95) return 3;
  return 4;
}

function keyPressed() {
  if (keyCode === UP_ARROW) {
    targetLightLevel = constrain(targetLightLevel + 0.07, 0, 1);
  } else if (keyCode === DOWN_ARROW) {
    targetLightLevel = constrain(targetLightLevel - 0.07, 0, 1);
  }
}

function getPaintingArea() {
  const marginX = width * MARGIN_RATIO;
  const marginY = height * MARGIN_RATIO;
  const availW = width - marginX * 2;
  const availH = height - marginY * 2;

  const imageAspect = sourceImage.width / sourceImage.height;
  let w = availW;
  let h = w / imageAspect;
  if (h > availH) {
    h = availH;
    w = h * imageAspect;
  }

  return {
    x: (width - w) * 0.5,
    y: (height - h) * 0.5,
    w,
    h,
  };
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  pixelDensity(1);
}

function findNearestPaletteColor(sr, sg, sb) {
  if (paletteColors.length === 0) return color(sr, sg, sb);

  let nearest = paletteColors[0];
  let nearestDist = Number.POSITIVE_INFINITY;

  for (const candidate of paletteColors) {
    const dr = sr - candidate.r;
    const dg = sg - candidate.g;
    const db = sb - candidate.b;
    const distSq = dr * dr + dg * dg + db * db;
    if (distSq < nearestDist) {
      nearestDist = distSq;
      nearest = candidate;
    }
  }

  return nearest.swatch;
}

function hexToRgb(hex) {
  const cleaned = hex.replace("#", "").trim();
  const full = cleaned.length === 3
    ? cleaned
        .split("")
        .map((ch) => ch + ch)
        .join("")
    : cleaned;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}
