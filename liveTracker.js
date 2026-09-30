/**
 * Live Valorant HUD Screen Reader
 * Captures screen and reads round scores via Tesseract OCR
 */
const screenshot = require('screenshot-desktop');
const { createWorker } = require('tesseract.js');

let worker = null;
let isTracking = false;
let trackingInterval = null;
let lastScores = { a: -1, b: -1 };
let lastStatus = {
  running: false,
  lastChecked: null,
  detectedText: '',
  scoreA: 0,
  scoreB: 0,
  error: null
};

// Callback to invoke when scores change
let onScoresChanged = null;

async function initWorker() {
  if (!worker) {
    worker = await createWorker('eng');
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789',
      tessedit_pageseg_mode: '7', // Treat the image as a single text line
    });
  }
  return worker;
}

let isBusy = false;

async function captureAndRead() {
  if (isBusy) return;
  isBusy = true;
  try {
    const w = await initWorker();
    const imgBuffer = await screenshot({ format: 'png' });
    if (!imgBuffer) {
      isBusy = false;
      return;
    }

    // Full screen 1920x1080 assumed (or scaled)
    // Left score rectangle
    const rectLeft = { left: 835, top: 12, width: 85, height: 60 };
    // Right score rectangle
    const rectRight = { left: 1000, top: 12, width: 85, height: 60 };

    // Sequential recognition on single worker to prevent WASM state corruption
    const resA = await w.recognize(imgBuffer, { rectangle: rectLeft });
    const resB = await w.recognize(imgBuffer, { rectangle: rectRight });

    const numA = parseInt(resA.data.text.trim().replace(/\D/g, ''), 10);
    const numB = parseInt(resB.data.text.trim().replace(/\D/g, ''), 10);

    lastStatus.lastChecked = new Date().toISOString();
    lastStatus.detectedText = `Left: "${resA.data.text.trim()}" | Right: "${resB.data.text.trim()}"`;

    if (!isNaN(numA) && numA >= 0 && numA <= 30) {
      lastStatus.scoreA = numA;
    }
    if (!isNaN(numB) && numB >= 0 && numB <= 30) {
      lastStatus.scoreB = numB;
    }

    if (!isNaN(numA) && !isNaN(numB)) {
      if (numA !== lastScores.a || numB !== lastScores.b) {
        lastScores = { a: numA, b: numB };
        if (typeof onScoresChanged === 'function') {
          onScoresChanged(numA, numB);
        }
      }
    }
  } catch (err) {
    lastStatus.error = err.message;
    console.error('[LiveTracker] OCR Error:', err.message);
  } finally {
    isBusy = false;
  }
}

function startTracking(callback, intervalMs = 2000) {
  if (isTracking) return;
  onScoresChanged = callback;
  isTracking = true;
  lastStatus.running = true;
  lastStatus.error = null;

  trackingInterval = setInterval(() => {
    captureAndRead();
  }, intervalMs);

  captureAndRead(); // initial check
}

function stopTracking() {
  if (!isTracking) return;
  clearInterval(trackingInterval);
  trackingInterval = null;
  isTracking = false;
  lastStatus.running = false;
}

function getStatus() {
  return { ...lastStatus };
}

module.exports = {
  startTracking,
  stopTracking,
  getStatus,
  captureAndRead
};
