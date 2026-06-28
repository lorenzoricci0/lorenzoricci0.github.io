// ===== Palette Builder =====
// Carica PNG di texture blocchi → calcola colore medio → esporta palette.json

const offscreenCanvas = document.getElementById('offscreen');
const dropTextures    = document.getElementById('dropTextures');
const fileTextures    = document.getElementById('fileTextures');
const textureGrid     = document.getElementById('textureGrid');
const pbToolbar       = document.getElementById('pbToolbar');
const pbFilterRow     = document.getElementById('pbFilterRow');
const pbCount         = document.getElementById('pbCount');
const pbSearch        = document.getElementById('pbSearch');
const chkChiselable   = document.getElementById('chkChiselable');
const btnExport       = document.getElementById('btnExport');
const btnClearAll     = document.getElementById('btnClearAll');

// Blocchi NON chisel-able (non si possono smontare)
const NON_CHISELABLE = new Set([
  'glass', 'ice', 'packed_ice', 'blue_ice', 'frosted_ice',
  'barrier', 'bedrock', 'command_block', 'chain_command_block',
  'repeating_command_block', 'structure_block', 'jigsaw',
  'moving_piston', 'piston_head', 'air', 'cave_air', 'void_air',
  'water', 'lava', 'fire', 'soul_fire',
]);

// { id: string, hex: string, lab: {L,a,b}, dataUrl: string, chiselable: bool }
let palette = {};

// ===== Drag & drop =====
dropTextures.addEventListener('dragover', e => { e.preventDefault(); dropTextures.classList.add('drag-over'); });
dropTextures.addEventListener('dragleave', () => dropTextures.classList.remove('drag-over'));
dropTextures.addEventListener('drop', e => {
  e.preventDefault();
  dropTextures.classList.remove('drag-over');
  processFiles([...e.dataTransfer.files]);
});
fileTextures.addEventListener('change', e => processFiles([...e.target.files]));

// ===== Carica file =====
async function processFiles(files) {
  const imageFiles = files.filter(f => f.type.startsWith('image/') || f.name.endsWith('.png') || f.name.endsWith('.gif'));
  if (!imageFiles.length) return;

  for (const file of imageFiles) {
    const id = file.name.replace(/\.(png|gif)$/i, '').toLowerCase().replace(/\s+/g, '_');
    if (palette[id]) continue; // skip duplicati

    try {
      const dataUrl = await fileToDataUrl(file);
      const color = await colorFromDataUrl(dataUrl);
      const chiselable = !NON_CHISELABLE.has(id) && !id.includes('glass') && !id.includes('ice');
      palette[id] = { id, hex: color.hex, lab: color.lab, dataUrl, chiselable };
      renderCard(palette[id]);
    } catch (e) {
      console.warn('Skip', file.name, e);
    }
  }

  updateToolbar();
}

function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function colorFromDataUrl(dataUrl) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const data = imageToData(img, offscreenCanvas);
      res(averageColor(data));
    };
    img.onerror = rej;
    img.src = dataUrl;
  });
}

// ===== Render card =====
function renderCard(block) {
  const existing = document.getElementById('pbcard-' + block.id);
  if (existing) return;

  const card = document.createElement('div');
  card.className = 'pb-card';
  card.id = 'pbcard-' + block.id;
  if (!block.chiselable) card.classList.add('pb-card--notchisel');

  card.innerHTML = `
    <div class="pb-card-img">
      <img src="${block.dataUrl}" alt="${block.id}" loading="lazy">
    </div>
    <div class="pb-card-body">
      <div class="pb-card-id" title="${block.id}">${block.id}</div>
      <div class="pb-card-color">
        <div class="pb-swatch" style="background:${block.hex}"></div>
        <code>${block.hex}</code>
      </div>
      <div class="pb-card-tags">
        ${block.chiselable
          ? '<span class="tag tag--ok">chisel-able</span>'
          : '<span class="tag tag--no">non chisel-able</span>'}
      </div>
    </div>
    <button class="pb-card-remove" data-id="${block.id}" title="Rimuovi">×</button>
  `;

  textureGrid.appendChild(card);

  card.querySelector('.pb-card-remove').addEventListener('click', e => {
    const id = e.currentTarget.dataset.id;
    delete palette[id];
    card.remove();
    updateToolbar();
  });
}

// ===== Filtro ricerca =====
pbSearch.addEventListener('input', filterGrid);
chkChiselable.addEventListener('change', filterGrid);

function filterGrid() {
  const q = pbSearch.value.toLowerCase().trim();
  const onlyChisel = chkChiselable.checked;
  document.querySelectorAll('.pb-card').forEach(card => {
    const id = card.querySelector('.pb-card-id').textContent.toLowerCase();
    const notChisel = card.classList.contains('pb-card--notchisel');
    const matchQ = !q || id.includes(q);
    const matchC = !onlyChisel || !notChisel;
    card.style.display = matchQ && matchC ? '' : 'none';
  });
}

// ===== Toolbar =====
function updateToolbar() {
  const count = Object.keys(palette).length;
  pbCount.textContent = count + ' texture caricate';
  pbToolbar.style.display = count > 0 ? 'flex' : 'none';
  pbFilterRow.style.display = count > 0 ? 'flex' : 'none';
}

btnClearAll.addEventListener('click', () => {
  palette = {};
  textureGrid.innerHTML = '';
  updateToolbar();
});

// ===== Export =====
btnExport.addEventListener('click', exportPalette);

function exportPalette() {
  const out = Object.values(palette).map(b => ({
    id: b.id,
    hex: b.hex,
    lab: { L: +b.lab.L.toFixed(2), a: +b.lab.a.toFixed(2), b: +b.lab.b.toFixed(2) },
    chiselable: b.chiselable,
  }));

  const json = JSON.stringify({ version: 1, blocks: out }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'palette.json';
  a.click();
  URL.revokeObjectURL(url);
}
