let sourceImage;
let cells = [];

const GRID_COLS = 34;
const GRID_ROWS = 46;
const MARGIN_RATIO = 0.09;
const NOISE_SCALE = 0.045;
const PALETTE_HEX = ["#D95F69", "#B0BF8F", "#F2DA5E", "#D99696", "#5EA4BF"];
let paletteColors = [];

let lightLevel = 0.7;
let targetLightLevel = 0.7;

const APP_SECRETS = window.APP_SECRETS || {};
const REGISTRY_BASE_URL =
  APP_SECRETS.registryBaseUrl || "https://esp-device-registry.ktorn.workers.dev";
const DEFAULT_DEVICE_ID = APP_SECRETS.deviceId || "MDS221-2026-5";

const URL_CONFIG = readUrlConfig();
let wsUrl = hasDirectWs(URL_CONFIG)
  ? URL_CONFIG.ws || `ws://${URL_CONFIG.wsHost}:${URL_CONFIG.wsPort}`
  : null;
let registryState = needsRegistryLookup(URL_CONFIG)
  ? "resolving"
  : hasDirectWs(URL_CONFIG)
    ? "bypassed"
    : "no token";

let socket = null;
let socketStatus = "idle";
let lastSensorRaw = null;
let lastMessageAt = 0;
let adaptiveMin = null;
let adaptiveMax = null;
let showDebugPane = true;

function preload() {
  sourceImage = loadImage("./assets/image.png");
}

function setup() {
  createCanvas(windowWidth, windowHeight);
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
  initWebSocketConnection();
}

function readUrlConfig() {
  const params = new URLSearchParams(window.location.search);
  const wsHost = params.get("wsHost") || params.get("host");
  return {
    deviceId: params.get("deviceId") || DEFAULT_DEVICE_ID,
    token: params.get("token") || APP_SECRETS.registryToken || null,
    registry: params.get("registry") || REGISTRY_BASE_URL,
    ws: params.get("ws"),
    wsHost,
    wsPort: params.get("wsPort") || params.get("port") || "81",
  };
}

function hasDirectWs(config) {
  return !!(config.ws || config.wsHost);
}

function needsRegistryLookup(config) {
  return !hasDirectWs(config) && !!(config.deviceId && config.token);
}

async function lookupDeviceEndpoint(config) {
  const base = config.registry.replace(/\/$/, "");
  const url = new URL(`${base}/lookup`);
  url.searchParams.set("device_id", config.deviceId);
  url.searchParams.set("token", config.token);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`lookup ${res.status}`);
  }
  const data = await res.json();
  if (!data.lan_ip) throw new Error("no lan_ip");
  const port = data.ws_port || 81;
  return `ws://${data.lan_ip}:${port}`;
}

function initWebSocketConnection() {
  if (needsRegistryLookup(URL_CONFIG)) {
    lookupDeviceEndpoint(URL_CONFIG)
      .then((url) => {
        wsUrl = url;
        registryState = "ok";
        connectWebSocket();
      })
      .catch((err) => {
        registryState = err.message || "failed";
        socketStatus = `registry ${registryState}`;
      });
  } else if (hasDirectWs(URL_CONFIG)) {
    registryState = "bypassed";
    connectWebSocket();
  } else {
    connectWebSocket();
  }
}

function draw() {
  background(42, 8, 94);

  updateTargetFromSensor();
  lightLevel = lerp(lightLevel, targetLightLevel, 0.08);

  const frameT = frameCount * 0.0045;
  const paintingArea = getPaintingArea();

  push();
  translate(paintingArea.x, paintingArea.y);
  drawPaperBackdrop(paintingArea.w, paintingArea.h, frameT);
  drawLivingCells(paintingArea.w, paintingArea.h, frameT);
  pop();

  if (showDebugPane) {
    drawDebugPane();
  }
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

    // Layered wash edge helps the block feel like hand-painted patchwork.
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

function drawDebugPane() {
  push();
  const panelX = 14;
  const panelY = 14;
  const panelW = 380;
  const panelH = 132;

  fill(0, 0, 0, 62);
  rect(panelX, panelY, panelW, panelH, 10);

  fill(0, 0, 100, 100);
  textSize(14);
  text("LIGHT SENSOR (WEBSOCKET)", panelX + 12, panelY + 24);

  textSize(13);
  text(`lightLevel: ${nf(lightLevel, 1, 2)}`, panelX + 12, panelY + 46);
  text(`target: ${nf(targetLightLevel, 1, 2)}`, panelX + 12, panelY + 64);
  text("keys: UP/DOWN light, D toggle pane", panelX + 12, panelY + 83);
  text(`ws: ${socketStatus}`, panelX + 12, panelY + 102);
  text(`registry: ${registryState}`, panelX + 200, panelY + 83);
  text(`raw: ${lastSensorRaw ?? "-"}`, panelX + 200, panelY + 102);
  text(`range: ${formatRangeValue(adaptiveMin)} - ${formatRangeValue(adaptiveMax)}`, panelX + 12, panelY + 121);

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
  if (key === "d" || key === "D") {
    showDebugPane = !showDebugPane;
  } else if (keyCode === UP_ARROW) {
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

function connectWebSocket() {
  if (socket && socket.readyState === WebSocket.OPEN) return;
  if (!wsUrl) {
    socketStatus =
      registryState === "resolving"
        ? "registry lookup…"
        : needsRegistryLookup(URL_CONFIG)
          ? `registry ${registryState}`
          : "set secrets.js or ?wsHost=";
    return;
  }

  socketStatus = `connecting ${wsUrl}...`;

  try {
    socket = new WebSocket(wsUrl);
  } catch (error) {
    socketStatus = `WebSocket error: ${error.message}`;
    return;
  }

  socket.onopen = () => {
    socketStatus = `connected ${wsUrl.replace(/^ws:\/\//, "")}`;
  };

  socket.onclose = () => {
    socketStatus = "disconnected (retry in 2s)";
    setTimeout(connectWebSocket, 2000);
  };

  socket.onerror = () => {
    socketStatus = "socket error";
  };

  socket.onmessage = (event) => {
    const value = int(event.data);
    if (!Number.isFinite(value)) return;
    lastSensorRaw = value;
    lastMessageAt = millis();
  };
}

function updateTargetFromSensor() {
  if (lastSensorRaw == null) return;

  updateAdaptiveRange(lastSensorRaw);

  const span = max(1, adaptiveMax - adaptiveMin);
  const normalized = constrain((lastSensorRaw - adaptiveMin) / span, 0, 1);
  targetLightLevel = normalized;

  if (millis() - lastMessageAt > 3000) {
    socketStatus = "stale sensor data (>3s)";
  }
}

function updateAdaptiveRange(value) {
  if (adaptiveMin == null || adaptiveMax == null) {
    adaptiveMin = value;
    adaptiveMax = value;
    return;
  }

  // Fast expand when new extremes appear.
  adaptiveMin = min(adaptiveMin, value);
  adaptiveMax = max(adaptiveMax, value);

  // Slow drift toward current signal so old extremes fade out over time.
  adaptiveMin = lerp(adaptiveMin, value, 0.0025);
  adaptiveMax = lerp(adaptiveMax, value, 0.0025);

  // Keep a minimum span to avoid unstable mapping when the sensor is steady.
  if (adaptiveMax - adaptiveMin < 40) {
    const center = (adaptiveMax + adaptiveMin) * 0.5;
    adaptiveMin = center - 20;
    adaptiveMax = center + 20;
  }
}

function formatRangeValue(v) {
  return v == null ? "-" : nf(v, 1, 0);
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
