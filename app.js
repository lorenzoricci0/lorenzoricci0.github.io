// ===== State =====
let rawModel = null;
let voxels = null;       // voxels[y][z][x] = colorIndex (1-based, 0 = vuoto)
let dims = { w: 0, h: 0, d: 0 };
let axis = 'y';
let currentLayer = 0;
let cellSize = 16;
let colorList = [];      // hex string per ogni materiale

const PALETTE = [
  '#4d96ff', '#ff6b6b', '#6bcb77', '#ffd93d', '#c77dff',
  '#ff9f1c', '#2ec4b6', '#e71d36', '#aaaaaa', '#4a4e69',
  '#f2cc8f', '#81b29a', '#e07a5f', '#3d405b', '#118ab2', '#06d6a0'
];

// ===== DOM refs =====
const dropZone      = document.getElementById('dropZone');
const fileInput     = document.getElementById('fileInput');
const fileInfo      = document.getElementById('fileInfo');
const fileInfoName  = document.getElementById('fileInfoName');
const btnChangeFile = document.getElementById('btnChangeFile');
const errorBox      = document.getElementById('errorBox');
const sectionScale  = document.getElementById('sectionScale');
const sectionViewer = document.getElementById('sectionViewer');
const scaleBlocksEl = document.getElementById('scaleBlocks');
const scalePreview  = document.getElementById('scalePreview');
const btnGenerate   = document.getElementById('btnGenerate');
const btnScaleMinus = document.getElementById('btnScaleMinus');
const btnScalePlus  = document.getElementById('btnScalePlus');
const statsRow      = document.getElementById('statsRow');
const layerSlider   = document.getElementById('layerSlider');
const layerCounter  = document.getElementById('layerCounter');
const btnPrev       = document.getElementById('btnPrev');
const btnNext       = document.getElementById('btnNext');
const canvas        = document.getElementById('layerCanvas');
const ctx           = canvas.getContext('2d');
const layerInfo     = document.getElementById('layerInfo');
const legend        = document.getElementById('legend');
const btnZoomIn     = document.getElementById('btnZoomIn');
const btnZoomOut    = document.getElementById('btnZoomOut');
const zoomLabel     = document.getElementById('zoomLabel');
const axisToggle    = document.getElementById('axisToggle');

// ===== Upload =====
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });
btnChangeFile.addEventListener('click', () => { fileInput.value = ''; fileInput.click(); });

function loadFile(file) {
  clearError();
  const reader = new FileReader();
  reader.onload = e => {
    try {
      rawModel = JSON.parse(e.target.result);
      fileInfoName.textContent = file.name;
      fileInfo.style.display = 'flex';
      sectionScale.style.display = 'block';
      updateScalePreview();
    } catch (err) {
      showError('File non valido: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ===== Scale =====
scaleBlocksEl.addEventListener('input', updateScalePreview);
btnScaleMinus.addEventListener('click', () => {
  const v = parseInt(scaleBlocksEl.value);
  if (v > 1) { scaleBlocksEl.value = v - 1; updateScalePreview(); }
});
btnScalePlus.addEventListener('click', () => {
  const v = parseInt(scaleBlocksEl.value);
  if (v < 8) { scaleBlocksEl.value = v + 1; updateScalePreview(); }
});

function updateScalePreview() {
  if (!rawModel) return;
  const bounds = getBBBounds(rawModel);
  if (!bounds) return;
  const blocks = parseInt(scaleBlocksEl.value) || 1;
  const maxSide = Math.max(bounds.w, bounds.h, bounds.d);
  const scale = (blocks * 16) / maxSide;
  const bW = Math.max(1, Math.round(bounds.w * scale));
  const bH = Math.max(1, Math.round(bounds.h * scale));
  const bD = Math.max(1, Math.round(bounds.d * scale));
  scalePreview.textContent = `→ ${bW} × ${bH} × ${bD} bit`;
}

btnGenerate.addEventListener('click', buildVoxels);

// ===== Model parsing =====
function getAllElements(model) {
  const els = [];
  const byUUID = {};
  for (const e of (model.elements || [])) byUUID[e.uuid] = e;

  function walk(items) {
    if (!items) return;
    for (const item of items) {
      if (typeof item === 'string') {
        if (byUUID[item]) els.push(byUUID[item]);
      } else if (item && item.children) {
        walk(item.children);
      } else if (item && item.from) {
        els.push(item);
      }
    }
  }

  if (model.outliner) walk(model.outliner);
  else for (const e of (model.elements || [])) els.push(e);
  return els;
}

function getBBBounds(model) {
  const els = getAllElements(model);
  if (!els.length) return null;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity;
  let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const e of els) {
    const f = e.from || [0, 0, 0];
    const t = e.to   || [16, 16, 16];
    x0 = Math.min(x0, f[0], t[0]); y0 = Math.min(y0, f[1], t[1]); z0 = Math.min(z0, f[2], t[2]);
    x1 = Math.max(x1, f[0], t[0]); y1 = Math.max(y1, f[1], t[1]); z1 = Math.max(z1, f[2], t[2]);
  }
  return { x0, y0, z0, w: x1 - x0, h: y1 - y0, d: z1 - z0 };
}

// ===== Voxelization =====
function buildVoxels() {
  if (!rawModel) return;
  clearError();

  const els = getAllElements(rawModel);
  if (!els.length) { showError('Nessun cubo trovato nel modello.'); return; }

  const bounds = getBBBounds(rawModel);
  const { x0, y0, z0 } = bounds;
  const blocks = parseInt(scaleBlocksEl.value) || 1;
  const maxSide = Math.max(bounds.w, bounds.h, bounds.d);
  const scale = (blocks * 16) / maxSide;

  const W = Math.max(1, Math.round(bounds.w * scale));
  const H = Math.max(1, Math.round(bounds.h * scale));
  const D = Math.max(1, Math.round(bounds.d * scale));

  // Alloca griglia: grid[y][z][x]
  const grid = [];
  for (let y = 0; y < H; y++) {
    grid[y] = [];
    for (let z = 0; z < D; z++) grid[y][z] = new Int32Array(W);
  }

  colorList = [];
  const colorIndex = {};
  let ci = 0;

  function getColorIdx(el) {
    const key = el.color !== undefined ? 'c:' + el.color : 'u:' + (el.uuid || ci);
    if (colorIndex[key] !== undefined) return colorIndex[key];
    const idx = ci++;
    colorIndex[key] = idx;
    colorList[idx] = el.color !== undefined
      ? PALETTE[el.color % PALETTE.length]
      : PALETTE[idx % PALETTE.length];
    return idx;
  }

  for (const el of els) {
    const f = el.from || [0, 0, 0];
    const t = el.to   || [16, 16, 16];
    const cidx = getColorIdx(el) + 1; // 1-based

    const bx0 = Math.max(0, Math.floor((Math.min(f[0], t[0]) - x0) * scale));
    const bx1 = Math.min(W,  Math.ceil((Math.max(f[0], t[0]) - x0) * scale));
    const by0 = Math.max(0, Math.floor((Math.min(f[1], t[1]) - y0) * scale));
    const by1 = Math.min(H,  Math.ceil((Math.max(f[1], t[1]) - y0) * scale));
    const bz0 = Math.max(0, Math.floor((Math.min(f[2], t[2]) - z0) * scale));
    const bz1 = Math.min(D,  Math.ceil((Math.max(f[2], t[2]) - z0) * scale));

    for (let y = by0; y < by1; y++)
      for (let z = bz0; z < bz1; z++)
        for (let x = bx0; x < bx1; x++)
          grid[y][z][x] = cidx;
  }

  voxels = grid;
  dims = { w: W, h: H, d: D };
  axis = 'y';
  currentLayer = 0;

  // Stats
  let totalBits = 0;
  for (let y = 0; y < H; y++)
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++)
        if (grid[y][z][x]) totalBits++;

  statsRow.innerHTML = [
    [W + '×' + H + '×' + D, 'Dimensioni (bit)'],
    [Math.ceil(W/16) + '×' + Math.ceil(H/16) + '×' + Math.ceil(D/16), 'Blocchi C&B'],
    [totalBits.toLocaleString('it'), 'Bit pieni'],
    [els.length, 'Cubi sorgente']
  ].map(([v, l]) => `<div class="stat"><div class="val">${v}</div><div class="lbl">${l}</div></div>`).join('');

  // Reset axis toggle
  document.querySelectorAll('#axisToggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.ax === 'y');
  });

  refreshSlider();
  buildLegend();
  sectionViewer.style.display = 'block';
  sectionViewer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  drawLayer();
}

// ===== Axis toggle =====
axisToggle.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn || !voxels) return;
  axis = btn.dataset.ax;
  currentLayer = 0;
  document.querySelectorAll('#axisToggle button').forEach(b => b.classList.toggle('active', b.dataset.ax === axis));
  refreshSlider();
  drawLayer();
});

// ===== Layer navigation =====
function layerCount() {
  if (!voxels) return 0;
  if (axis === 'y') return dims.h;
  if (axis === 'x') return dims.w;
  return dims.d;
}

function refreshSlider() {
  const lc = layerCount();
  layerSlider.max = Math.max(0, lc - 1);
  currentLayer = Math.min(currentLayer, lc - 1);
  currentLayer = Math.max(0, currentLayer);
  layerSlider.value = currentLayer;
  btnPrev.disabled = currentLayer === 0;
  btnNext.disabled = currentLayer >= lc - 1;
  layerCounter.textContent = (currentLayer + 1) + ' / ' + lc;
}

layerSlider.addEventListener('input', () => {
  currentLayer = parseInt(layerSlider.value);
  refreshSlider();
  drawLayer();
});

btnPrev.addEventListener('click', () => {
  if (currentLayer > 0) { currentLayer--; refreshSlider(); drawLayer(); }
});

btnNext.addEventListener('click', () => {
  if (currentLayer < layerCount() - 1) { currentLayer++; refreshSlider(); drawLayer(); }
});

// Tastiera
document.addEventListener('keydown', e => {
  if (!voxels) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
    e.preventDefault();
    if (currentLayer > 0) { currentLayer--; refreshSlider(); drawLayer(); }
  }
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (currentLayer < layerCount() - 1) { currentLayer++; refreshSlider(); drawLayer(); }
  }
});

// ===== Zoom =====
btnZoomIn.addEventListener('click', () => {
  if (cellSize < 40) { cellSize = Math.min(40, cellSize + 2); updateZoomLabel(); if (voxels) drawLayer(); }
});
btnZoomOut.addEventListener('click', () => {
  if (cellSize > 4) { cellSize = Math.max(4, cellSize - 2); updateZoomLabel(); if (voxels) drawLayer(); }
});
function updateZoomLabel() { zoomLabel.textContent = cellSize + ' px'; }

// ===== Draw =====
function getSlice(l) {
  const { w, h, d } = dims;
  if (axis === 'y') {
    const rows = d, cols = w;
    const data = [];
    for (let z = 0; z < rows; z++) {
      data[z] = [];
      for (let x = 0; x < cols; x++) data[z][x] = voxels[l][z][x];
    }
    return { data, rows, cols, axR: 'Z', axC: 'X' };
  } else if (axis === 'x') {
    const rows = h, cols = d;
    const data = [];
    for (let y = 0; y < rows; y++) {
      data[y] = [];
      for (let z = 0; z < cols; z++) data[y][z] = voxels[h - 1 - y][z][l];
    }
    return { data, rows, cols, axR: 'Y', axC: 'Z' };
  } else {
    const rows = h, cols = w;
    const data = [];
    for (let y = 0; y < rows; y++) {
      data[y] = [];
      for (let x = 0; x < cols; x++) data[y][x] = voxels[h - 1 - y][l][x];
    }
    return { data, rows, cols, axR: 'Y', axC: 'X' };
  }
}

function drawLayer() {
  if (!voxels) return;
  const { data, rows, cols, axR, axC } = getSlice(currentLayer);
  const c = cellSize;

  canvas.width  = cols * c;
  canvas.height = rows * c;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let bitsInLayer = 0;

  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const v = data[r][col];
      const x = col * c, y = r * c;

      if (v) {
        bitsInLayer++;
        ctx.fillStyle = colorList[v - 1] || '#8888ff';
        ctx.fillRect(x, y, c, c);
        // bordo interno
        ctx.strokeStyle = 'rgba(0,0,0,0.13)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x + 0.25, y + 0.25, c - 0.5, c - 0.5);
      } else if (c >= 6) {
        // griglia vuota
        ctx.strokeStyle = 'rgba(128,128,128,0.08)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, c, c);
      }
    }
  }

  const axNames = { y: 'Y', x: 'X', z: 'Z' };
  layerInfo.textContent =
    `Asse ${axNames[axis]}, layer ${currentLayer + 1} — ${bitsInLayer} bit pieni — ${cols} ${axC} × ${rows} ${axR}`;
}

// ===== Legend =====
function buildLegend() {
  legend.innerHTML = colorList.map((hex, i) =>
    `<div class="leg-item">
      <div class="leg-swatch" style="background:${hex}"></div>
      Materiale ${i + 1}
    </div>`
  ).join('');
}

// ===== Helpers =====
function showError(msg) {
  errorBox.textContent = msg;
  errorBox.style.display = 'block';
}
function clearError() {
  errorBox.style.display = 'none';
}
