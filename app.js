// ===== State =====
let rawModel    = null;
let palette     = null;   // array di {id, hex, lab, chiselable}
let voxels      = null;   // voxels[y][z][x] = matIdx (1-based)
let dims        = { w: 0, h: 0, d: 0 };
let axis        = 'y';
let currentLayer = 0;
let cellSize    = 16;

// Materiali estratti dal modello
// [ { name, hex, lab, avgColor, textureName, suggestions: [{id,hex,dist,chiselable}] } ]
let materials = [];

// ===== DOM =====
const dropModel      = document.getElementById('dropModel');
const fileModel      = document.getElementById('fileModel');
const modelBadge     = document.getElementById('modelBadge');
const errorBox       = document.getElementById('errorBox');
const filePalette    = document.getElementById('filePalette');
const paletteStatus  = document.getElementById('paletteStatus');
const secPalette     = document.getElementById('sec-palette');
const secScale       = document.getElementById('sec-scale');
const secViewer      = document.getElementById('sec-viewer');
const scaleBlocksEl  = document.getElementById('scaleBlocks');
const scalePreview   = document.getElementById('scalePreview');
const btnGenerate    = document.getElementById('btnGenerate');
const btnMinus       = document.getElementById('btnMinus');
const btnPlus        = document.getElementById('btnPlus');
const statsRow       = document.getElementById('statsRow');
const materialsGrid  = document.getElementById('materialsGrid');
const axisToggle     = document.getElementById('axisToggle');
const layerSlider    = document.getElementById('layerSlider');
const layerCounter   = document.getElementById('layerCounter');
const btnPrev        = document.getElementById('btnPrev');
const btnNext        = document.getElementById('btnNext');
const canvas         = document.getElementById('layerCanvas');
const ctx            = canvas.getContext('2d');
const layerInfo      = document.getElementById('layerInfo');
const btnZoomIn      = document.getElementById('btnZoomIn');
const btnZoomOut     = document.getElementById('btnZoomOut');
const zoomLabel      = document.getElementById('zoomLabel');
const highlightSel   = document.getElementById('highlightMat');

// Canvas offscreen per estrarre texture
const offscreen = document.createElement('canvas');

// ===== Upload modello =====
dropModel.addEventListener('dragover', e => { e.preventDefault(); dropModel.classList.add('drag-over'); });
dropModel.addEventListener('dragleave', () => dropModel.classList.remove('drag-over'));
dropModel.addEventListener('drop', e => { e.preventDefault(); dropModel.classList.remove('drag-over'); if (e.dataTransfer.files[0]) loadModel(e.dataTransfer.files[0]); });
fileModel.addEventListener('change', e => { if (e.target.files[0]) loadModel(e.target.files[0]); });

async function loadModel(file) {
  clearError();
  try {
    const text = await file.text();
    rawModel = JSON.parse(text);
    modelBadge.textContent = '✓ ' + file.name;
    modelBadge.style.display = 'block';
    modelBadge.className = 'file-badge file-badge--ok';
    secPalette.style.display = 'block';
    secScale.style.display = 'block';
    updateScalePreview();
  } catch (e) {
    showError('File non valido: ' + e.message);
  }
}

// ===== Upload palette =====
filePalette.addEventListener('change', async e => {
  if (!e.target.files[0]) return;
  try {
    const text = await e.target.files[0].text();
    const data = JSON.parse(text);
    // Supporta sia array diretto che {blocks: [...]}
    const blocks = Array.isArray(data) ? data : (data.blocks || []);
    // Aggiungi lab se non presente
    palette = blocks.map(b => {
      if (!b.lab) {
        const rgb = hexToRgb(b.hex || '#888888');
        b.lab = rgbToLab(rgb.r, rgb.g, rgb.b);
      }
      return b;
    });
    paletteStatus.textContent = '✓ ' + palette.length + ' blocchi caricati';
    paletteStatus.className = 'palette-status palette-status--ok';
  } catch (err) {
    paletteStatus.textContent = 'Errore nel file palette: ' + err.message;
    paletteStatus.className = 'palette-status palette-status--err';
  }
});

// ===== Scala =====
btnMinus.addEventListener('click', () => {
  const v = parseInt(scaleBlocksEl.value); if (v > 1) { scaleBlocksEl.value = v - 1; updateScalePreview(); }
});
btnPlus.addEventListener('click', () => {
  const v = parseInt(scaleBlocksEl.value); if (v < 8) { scaleBlocksEl.value = v + 1; updateScalePreview(); }
});
scaleBlocksEl.addEventListener('input', updateScalePreview);

function updateScalePreview() {
  if (!rawModel) return;
  const b = getBBBounds(rawModel); if (!b) return;
  const blocks = parseInt(scaleBlocksEl.value) || 1;
  const scale = (blocks * 16) / Math.max(b.w, b.h, b.d);
  const W = Math.max(1, Math.round(b.w * scale));
  const H = Math.max(1, Math.round(b.h * scale));
  const D = Math.max(1, Math.round(b.d * scale));
  scalePreview.textContent = `→ ${W}×${H}×${D} bit`;
}

// ===== Model parsing =====
function getAllElements(model) {
  const els = [];
  const byUUID = {};
  for (const e of (model.elements || [])) byUUID[e.uuid] = e;
  function walk(items) {
    if (!items) return;
    for (const item of items) {
      if (typeof item === 'string') { if (byUUID[item]) els.push(byUUID[item]); }
      else if (item && item.children) walk(item.children);
      else if (item && item.from) els.push(item);
    }
  }
  if (model.outliner) walk(model.outliner);
  else for (const e of (model.elements || [])) els.push(e);
  return els;
}

function getBBBounds(model) {
  const els = getAllElements(model);
  if (!els.length) return null;
  let x0=Infinity, y0=Infinity, z0=Infinity, x1=-Infinity, y1=-Infinity, z1=-Infinity;
  for (const e of els) {
    const f = e.from||[0,0,0], t = e.to||[16,16,16];
    x0=Math.min(x0,f[0],t[0]); y0=Math.min(y0,f[1],t[1]); z0=Math.min(z0,f[2],t[2]);
    x1=Math.max(x1,f[0],t[0]); y1=Math.max(y1,f[1],t[1]); z1=Math.max(z1,f[2],t[2]);
  }
  return { x0, y0, z0, w: x1-x0, h: y1-y0, d: z1-z0 };
}

// Estrai texture dal bbmodel e calcola colore medio
async function extractMaterials(model) {
  const textures = model.textures || [];
  const result = {}; // texIdx → {name, hex, lab, dataUrl}

  for (let i = 0; i < textures.length; i++) {
    const tex = textures[i];
    const name = tex.name || ('texture_' + i);
    let dataUrl = tex.source || tex.data || '';
    if (dataUrl && !dataUrl.startsWith('data:')) {
      dataUrl = 'data:image/png;base64,' + dataUrl;
    }
    let color = { hex: '#888888', lab: rgbToLab(136, 136, 136) };
    if (dataUrl) {
      try { color = await extractTextureColor(dataUrl, offscreen); } catch(e) {}
    }
    result[i] = { name, hex: color.hex, lab: color.lab, dataUrl };
  }
  return result;
}

// Fallback palette se nessuna texture (solo colore cubo)
const CUBE_PALETTE = [
  '#4d96ff','#ff6b6b','#6bcb77','#ffd93d','#c77dff',
  '#ff9f1c','#2ec4b6','#e71d36','#aaaaaa','#4a4e69',
  '#f2cc8f','#81b29a','#e07a5f','#3d405b','#118ab2','#06d6a0'
];

// ===== Genera voxels =====
btnGenerate.addEventListener('click', async () => {
  if (!rawModel) return;
  clearError();
  btnGenerate.disabled = true;
  btnGenerate.textContent = 'Elaborazione…';

  try {
    await buildVoxels();
  } catch(e) {
    showError('Errore: ' + e.message);
  }

  btnGenerate.disabled = false;
  btnGenerate.textContent = 'Genera schematica →';
});

async function buildVoxels() {
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

  // Estrai materiali dalle texture
  const texMap = await extractMaterials(rawModel);

  // Mappa ogni elemento a un materiale
  // Chiave: texture index o colore cubo
  const matKeyMap = {}; // chiave → indice in materials[]
  materials = [];

  function getMatIdx(el) {
    // Cerca la texture usata dalla faccia "nord" o qualsiasi faccia
    let texIdx = null;
    if (el.faces) {
      for (const face of Object.values(el.faces)) {
        if (face && face.texture !== undefined && face.texture !== null && face.texture !== -1) {
          texIdx = face.texture;
          break;
        }
      }
    }

    let key, hex, lab, name, dataUrl;

    if (texIdx !== null && texMap[texIdx]) {
      key = 'tex:' + texIdx;
      hex = texMap[texIdx].hex;
      lab = texMap[texIdx].lab;
      name = texMap[texIdx].name;
      dataUrl = texMap[texIdx].dataUrl;
    } else if (el.color !== undefined) {
      key = 'col:' + el.color;
      hex = CUBE_PALETTE[el.color % CUBE_PALETTE.length];
      const rgb = hexToRgb(hex);
      lab = rgbToLab(rgb.r, rgb.g, rgb.b);
      name = 'Colore ' + el.color;
      dataUrl = null;
    } else {
      key = 'default';
      hex = '#888888';
      lab = rgbToLab(136, 136, 136);
      name = 'Default';
      dataUrl = null;
    }

    if (matKeyMap[key] !== undefined) return matKeyMap[key];

    const idx = materials.length;
    matKeyMap[key] = idx;

    // Trova blocchi suggeriti
    let suggestions = [];
    if (palette && palette.length) {
      suggestions = findClosestBlocks(lab, palette, 4);
    }

    materials.push({ name, hex, lab, dataUrl, suggestions });
    return idx;
  }

  // Alloca griglia voxels[y][z][x] = matIdx+1 (0=vuoto)
  const grid = [];
  for (let y = 0; y < H; y++) {
    grid[y] = [];
    for (let z = 0; z < D; z++) grid[y][z] = new Int32Array(W);
  }

  for (const el of els) {
    const f = el.from || [0,0,0];
    const t = el.to   || [16,16,16];
    const matIdx = getMatIdx(el) + 1;

    const bx0 = Math.max(0, Math.floor((Math.min(f[0],t[0])-x0)*scale));
    const bx1 = Math.min(W,  Math.ceil((Math.max(f[0],t[0])-x0)*scale));
    const by0 = Math.max(0, Math.floor((Math.min(f[1],t[1])-y0)*scale));
    const by1 = Math.min(H,  Math.ceil((Math.max(f[1],t[1])-y0)*scale));
    const bz0 = Math.max(0, Math.floor((Math.min(f[2],t[2])-z0)*scale));
    const bz1 = Math.min(D,  Math.ceil((Math.max(f[2],t[2])-z0)*scale));

    for (let y=by0; y<by1; y++)
      for (let z=bz0; z<bz1; z++)
        for (let x=bx0; x<bx1; x++)
          grid[y][z][x] = matIdx;
  }

  voxels = grid;
  dims = { w: W, h: H, d: D };
  axis = 'y';
  currentLayer = 0;

  // Stats
  let totalBits = 0;
  for (let y=0;y<H;y++) for (let z=0;z<D;z++) for (let x=0;x<W;x++) if(grid[y][z][x]) totalBits++;

  statsRow.innerHTML = [
    [W+'×'+H+'×'+D, 'Dimensioni (bit)'],
    [Math.ceil(W/16)+'×'+Math.ceil(H/16)+'×'+Math.ceil(D/16), 'Blocchi C&B'],
    [totalBits.toLocaleString('it'), 'Bit pieni'],
    [els.length, 'Cubi sorgente']
  ].map(([v,l]) => `<div class="stat"><div class="val">${v}</div><div class="lbl">${l}</div></div>`).join('');

  // Reset axis
  document.querySelectorAll('#axisToggle button').forEach(b => b.classList.toggle('active', b.dataset.ax==='y'));

  buildMaterialsGrid();
  buildHighlightSelect();
  refreshSlider();
  secViewer.style.display = 'block';
  secViewer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  drawLayer();
}

// ===== Materials grid =====
function buildMaterialsGrid() {
  materialsGrid.innerHTML = '';
  materials.forEach((mat, i) => {
    const card = document.createElement('div');
    card.className = 'mat-card';
    card.dataset.matIdx = i;

    const thumbHtml = mat.dataUrl
      ? `<img src="${mat.dataUrl}" alt="${mat.name}" class="mat-thumb">`
      : `<div class="mat-thumb mat-thumb--color" style="background:${mat.hex}"></div>`;

    let suggestionsHtml = '';
    if (mat.suggestions && mat.suggestions.length) {
      suggestionsHtml = `
        <div class="mat-suggestions">
          <div class="mat-sug-label">Blocchi suggeriti:</div>
          <div class="mat-sug-list">
            ${mat.suggestions.map(s => `
              <div class="mat-sug-item ${s.chiselable === false ? 'mat-sug-item--notchisel' : ''}">
                <div class="mat-sug-swatch" style="background:${s.hex}" title="${s.hex}"></div>
                <span class="mat-sug-id">${s.id}</span>
                <span class="mat-sug-dist" title="Distanza colore LAB">${Math.round(s.dist)}</span>
                ${s.chiselable === false ? '<span class="tag tag--no-sm">✗</span>' : ''}
              </div>
            `).join('')}
          </div>
        </div>`;
    } else {
      suggestionsHtml = `<div class="mat-no-palette">Carica una palette per i suggerimenti sui blocchi</div>`;
    }

    card.innerHTML = `
      <div class="mat-card-header">
        ${thumbHtml}
        <div class="mat-card-info">
          <div class="mat-name">${mat.name}</div>
          <div class="mat-color-row">
            <div class="mat-swatch" style="background:${mat.hex}"></div>
            <code class="mat-hex">${mat.hex}</code>
          </div>
        </div>
        <div class="mat-index">#${i+1}</div>
      </div>
      ${suggestionsHtml}
    `;

    // Click per highlight
    card.addEventListener('click', () => {
      const sel = card.classList.toggle('mat-card--active') ? String(i+1) : '';
      highlightSel.value = sel;
      drawLayer();
    });

    materialsGrid.appendChild(card);
  });
}

function buildHighlightSelect() {
  highlightSel.innerHTML = '<option value="">— tutti —</option>';
  materials.forEach((mat, i) => {
    const opt = document.createElement('option');
    opt.value = String(i + 1);
    opt.textContent = `#${i+1} ${mat.name}`;
    highlightSel.appendChild(opt);
  });
}

highlightSel.addEventListener('change', () => {
  // Deseleziona tutte le card
  document.querySelectorAll('.mat-card').forEach(c => c.classList.remove('mat-card--active'));
  const v = highlightSel.value;
  if (v) {
    const idx = parseInt(v) - 1;
    const card = materialsGrid.children[idx];
    if (card) card.classList.add('mat-card--active');
  }
  drawLayer();
});

// ===== Axis =====
axisToggle.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn || !voxels) return;
  axis = btn.dataset.ax;
  currentLayer = 0;
  document.querySelectorAll('#axisToggle button').forEach(b => b.classList.toggle('active', b.dataset.ax===axis));
  refreshSlider();
  drawLayer();
});

// ===== Layer navigation =====
function layerCount() {
  if (!voxels) return 0;
  return axis==='y' ? dims.h : axis==='x' ? dims.w : dims.d;
}

function refreshSlider() {
  const lc = layerCount();
  layerSlider.max = Math.max(0, lc-1);
  currentLayer = Math.max(0, Math.min(currentLayer, lc-1));
  layerSlider.value = currentLayer;
  btnPrev.disabled = currentLayer === 0;
  btnNext.disabled = currentLayer >= lc-1;
  layerCounter.textContent = (currentLayer+1) + ' / ' + lc;
}

layerSlider.addEventListener('input', () => { currentLayer = parseInt(layerSlider.value); refreshSlider(); drawLayer(); });
btnPrev.addEventListener('click', () => { if(currentLayer>0){ currentLayer--; refreshSlider(); drawLayer(); } });
btnNext.addEventListener('click', () => { if(currentLayer<layerCount()-1){ currentLayer++; refreshSlider(); drawLayer(); } });

document.addEventListener('keydown', e => {
  if (!voxels) return;
  if (e.key==='ArrowLeft'||e.key==='ArrowDown') { e.preventDefault(); if(currentLayer>0){currentLayer--;refreshSlider();drawLayer();} }
  if (e.key==='ArrowRight'||e.key==='ArrowUp')  { e.preventDefault(); if(currentLayer<layerCount()-1){currentLayer++;refreshSlider();drawLayer();} }
});

// ===== Zoom =====
btnZoomIn.addEventListener('click',  () => { if(cellSize<40){cellSize=Math.min(40,cellSize+2);zoomLabel.textContent=cellSize+'px';if(voxels)drawLayer();} });
btnZoomOut.addEventListener('click', () => { if(cellSize>4) {cellSize=Math.max(4,cellSize-2); zoomLabel.textContent=cellSize+'px';if(voxels)drawLayer();} });

// ===== Draw =====
function getSlice(l) {
  const {w,h,d} = dims;
  let rows, cols, getData;
  if (axis==='y')      { rows=d; cols=w; getData=(r,c)=>voxels[l][r][c]; }
  else if (axis==='x') { rows=h; cols=d; getData=(r,c)=>voxels[h-1-r][c][l]; }
  else                 { rows=h; cols=w; getData=(r,c)=>voxels[h-1-r][l][c]; }
  return {rows,cols,getData};
}

function drawLayer() {
  if (!voxels) return;
  const {rows,cols,getData} = getSlice(currentLayer);
  const c = cellSize;
  const highlightIdx = highlightSel ? parseInt(highlightSel.value) || 0 : 0;

  canvas.width  = cols * c;
  canvas.height = rows * c;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  let bitsInLayer = 0;

  for (let r=0; r<rows; r++) {
    for (let col=0; col<cols; col++) {
      const v = getData(r,col);
      const x = col*c, y = r*c;
      if (!v) {
        if (c>=6) { ctx.strokeStyle='rgba(128,128,128,0.07)'; ctx.lineWidth=.5; ctx.strokeRect(x,y,c,c); }
        continue;
      }
      bitsInLayer++;
      const mat = materials[v-1];
      const hex = mat ? mat.hex : '#888888';

      if (highlightIdx && v !== highlightIdx) {
        // Dimmed
        ctx.fillStyle = 'rgba(128,128,128,0.15)';
        ctx.fillRect(x,y,c,c);
      } else {
        ctx.fillStyle = hex;
        ctx.fillRect(x,y,c,c);
        // Bordo
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = .5;
        ctx.strokeRect(x+.25,y+.25,c-.5,c-.5);
        // Numero materiale se zoom grande
        if (c >= 18 && materials.length > 1) {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.font = `${Math.max(8, c/3)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(v, x+c/2, y+c/2);
        }
      }
    }
  }

  const axN = {y:'Y',x:'X',z:'Z'};
  layerInfo.textContent = `Asse ${axN[axis]}, layer ${currentLayer+1} — ${bitsInLayer} bit`;
  refreshSlider();
}

// ===== Helpers =====
function showError(msg) { errorBox.textContent = msg; errorBox.style.display='block'; }
function clearError()   { errorBox.style.display='none'; }
