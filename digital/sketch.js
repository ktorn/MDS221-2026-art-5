let sourceImage;
let cells = [];

const GRID_COLS = 22;
const GRID_ROWS = 30;
const MARGIN_RATIO = 0.09;
const NOISE_SCALE = 0.045;

let lightLevel = 0.7;
let targetLightLevel = 0.7;

function preload() {
  sourceImage = loadImage("./assets/image.png");
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
  noStroke();
  buildCellsFromImage();
}

function draw() {
  background(42, 8, 94);

  lightLevel = lerp(lightLevel, targetLightLevel, 0.08);

  const frameT = frameCount * 0.01;
  const paintingArea = getPaintingArea();

  push();
  translate(paintingArea.x, paintingArea.y);
  drawPaperBackdrop(paintingArea.w, paintingArea.h, frameT);
  drawLivingCells(paintingArea.w, paintingArea.h, frameT);
  pop();

  drawDebugPane();
}

function buildCellsFromImage() {
  cells = [];
  sourceImage.loadPixels();

  for (let gy = 0; gy < GRID_ROWS; gy++) {
    for (let gx = 0; gx < GRID_COLS; gx++) {
      const u = (gx + 0.5) / GRID_COLS;
      const v = (gy + 0.5) / GRID_ROWS;

      const sx = floor(u * sourceImage.width);
      const sy = floor(v * sourceImage.height);
      const sampled = sourceImage.get(sx, sy);
      const c = color(sampled[0], sampled[1], sampled[2], 100);

      const jitterX = random(-0.23, 0.23);
      const jitterY = random(-0.23, 0.23);
      const baseScale = random(0.72, 1.2);
      const energyBias = random(0.6, 1.0);

      cells.push({
        gx,
        gy,
        u,
        v,
        baseColor: c,
        jitterX,
        jitterY,
        baseScale,
        energyBias,
        phase: random(TWO_PI),
      });
    }
  }
}

function drawPaperBackdrop(w, h, frameT) {
  push();
  noStroke();
  fill(44, 7, 98, 100);
  rect(0, 0, w, h, 8);

  // Subtle watercolor paper variation
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
    const px = (cell.gx + 0.5 + cell.jitterX) * cw;
    const py = (cell.gy + 0.5 + cell.jitterY) * ch;

    const noiseLife = noise(
      cell.gx * NOISE_SCALE,
      cell.gy * NOISE_SCALE,
      frameT * 0.35 + cell.phase
    );

    let vitality = lightLevel * cell.energyBias + (noiseLife - 0.5) * 0.22;
    vitality = constrain(vitality, 0, 1);

    const fade = pow(vitality, 1.15);
    const grow = map(vitality, 0, 1, 0.3, 1.22) * cell.baseScale;
    const dyingDrop = map(1 - vitality, 0, 1, 0, ch * 1.7);

    const base = cell.baseColor;
    const hh = hue(base);
    const ss = saturation(base);
    const bb = brightness(base);

    const outS = lerp(5, ss, fade);
    const outB = lerp(bb * 0.36, bb, fade);
    const outA = lerp(18, 92, fade);

    const wobbleX = sin(frameT * 1.9 + cell.phase) * cw * 0.05 * vitality;
    const wobbleY = cos(frameT * 1.4 + cell.phase) * ch * 0.05 * vitality;

    const rw = cw * random(0.82, 1.16) * grow;
    const rh = ch * random(0.82, 1.16) * grow;

    fill(hh, outS, outB, outA);
    rect(
      px - rw * 0.5 + wobbleX,
      py - rh * 0.5 + wobbleY + dyingDrop,
      rw,
      rh,
      min(rw, rh) * 0.15
    );

    // Occasional dark accents inspired by the reference painting.
    const accentChance = noise(cell.gx * 0.23 + 7, cell.gy * 0.17 - 4);
    if (accentChance > 0.8 && vitality > 0.2) {
      fill(hh, min(outS + 12, 100), max(outB - 40, 8), outA * 0.65);
      const aw = rw * random(0.2, 0.48);
      const ah = rh * random(0.2, 0.6);
      rect(
        px - aw * 0.5 + wobbleX + random(-cw * 0.18, cw * 0.18),
        py - ah * 0.5 + wobbleY + random(-ch * 0.18, ch * 0.18) + dyingDrop,
        aw,
        ah,
        min(aw, ah) * 0.25
      );
    }
  }
}

function drawDebugPane() {
  push();
  const panelX = 14;
  const panelY = 14;
  const panelW = 235;
  const panelH = 96;

  fill(0, 0, 0, 62);
  rect(panelX, panelY, panelW, panelH, 10);

  fill(0, 0, 100, 100);
  textSize(14);
  text("SIMULATED LIGHT SENSOR", panelX + 12, panelY + 24);

  textSize(13);
  text(`lightLevel: ${nf(lightLevel, 1, 2)}`, panelX + 12, panelY + 46);
  text(`target: ${nf(targetLightLevel, 1, 2)}`, panelX + 12, panelY + 64);
  text("keys: UP increase, DOWN decrease", panelX + 12, panelY + 83);

  const barX = panelX + 132;
  const barY = panelY + 35;
  const barW = 90;
  const barH = 12;
  fill(0, 0, 25, 90);
  rect(barX, barY, barW, barH, 3);
  fill(140, 65, 88, 95);
  rect(barX, barY, barW * lightLevel, barH, 3);
  pop();
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
}
