// ===== State =====
let rawModel     = null;
let palette      = null;
let voxels       = null;
let voxelColors  = null;
let dims         = { w:0, h:0, d:0 };
let axis         = 'y';
let currentLayer = 0;
let cellSize     = 16;
let materials    = [];
let texImages    = {};

// ===== DOM =====
const dropModel     = document.getElementById('dropModel');
const fileModel     = document.getElementById('fileModel');
const modelBadge    = document.getElementById('modelBadge');
const errorBox      = document.getElementById('errorBox');
const filePalette   = document.getElementById('filePalette');
const paletteStatus = document.getElementById('paletteStatus');
const secPalette    = document.getElementById('sec-palette');
const secScale      = document.getElementById('sec-scale');
const secViewer     = document.getElementById('sec-viewer');
const scaleBlocksEl = document.getElementById('scaleBlocks');
const scalePreview  = document.getElementById('scalePreview');
const btnGenerate   = document.getElementById('btnGenerate');
const btnMinus      = document.getElementById('btnMinus');
const btnPlus       = document.getElementById('btnPlus');
const statsRow      = document.getElementById('statsRow');
const materialsGrid = document.getElementById('materialsGrid');
const axisToggle    = document.getElementById('axisToggle');
const layerSlider   = document.getElementById('layerSlider');
const layerCounter  = document.getElementById('layerCounter');
const btnPrev       = document.getElementById('btnPrev');
const btnNext       = document.getElementById('btnNext');
const canvas        = document.getElementById('layerCanvas');
const ctx           = canvas.getContext('2d');
const layerInfo     = document.getElementById('layerInfo');
const btnZoomIn     = document.getElementById('btnZoomIn');
const btnZoomOut    = document.getElementById('btnZoomOut');
const zoomLabel     = document.getElementById('zoomLabel');
const highlightSel  = document.getElementById('highlightMat');

// ===== Upload model =====
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
  } catch(e) { showError('File non valido: ' + e.message); }
}

// ===== Upload palette =====
filePalette.addEventListener('change', async e => {
  if (!e.target.files[0]) return;
  try {
    const data = JSON.parse(await e.target.files[0].text());
    const blocks = Array.isArray(data) ? data : (data.blocks || []);
    palette = blocks.map(b => {
      if (!b.lab) { const rgb = hexToRgb(b.hex||'#888'); b.lab = rgbToLab(rgb.r,rgb.g,rgb.b); }
      return b;
    });
    paletteStatus.textContent = '✓ ' + palette.length + ' blocchi caricati';
    paletteStatus.className = 'palette-status palette-status--ok';
  } catch(err) {
    paletteStatus.textContent = 'Errore: ' + err.message;
    paletteStatus.className = 'palette-status palette-status--err';
  }
});

// ===== Scale =====
btnMinus.addEventListener('click', () => { const v=parseInt(scaleBlocksEl.value); if(v>1){scaleBlocksEl.value=v-1;updateScalePreview();} });
btnPlus.addEventListener('click',  () => { const v=parseInt(scaleBlocksEl.value); if(v<8){scaleBlocksEl.value=v+1;updateScalePreview();} });
scaleBlocksEl.addEventListener('input', updateScalePreview);

function updateScalePreview() {
  if (!rawModel) return;
  const b = getBBBounds(rawModel); if (!b) return;
  const blocks = parseInt(scaleBlocksEl.value)||1;
  const scale = (blocks*16) / Math.max(b.w,b.h,b.d);
  scalePreview.textContent = `→ ${Math.max(1,Math.round(b.w*scale))}×${Math.max(1,Math.round(b.h*scale))}×${Math.max(1,Math.round(b.d*scale))} bit`;
}

// ===== Model parsing =====
function getAllElements(model) {
  const els = [];
  const byUUID = {};
  for (const e of (model.elements||[])) byUUID[e.uuid]=e;
  function walk(items) {
    if (!items) return;
    for (const item of items) {
      if (typeof item==='string') { if(byUUID[item]) els.push(byUUID[item]); }
      else if (item&&item.children) walk(item.children);
      else if (item&&item.from) els.push(item);
    }
  }
  if (model.outliner) walk(model.outliner); else for(const e of (model.elements||[])) els.push(e);
  return els;
}

function getBBBounds(model) {
  const els = getAllElements(model);
  if (!els.length) return null;
  let x0=Infinity,y0=Infinity,z0=Infinity,x1=-Infinity,y1=-Infinity,z1=-Infinity;
  for (const e of els) {
    // Per gli elementi ruotati devo considerare i vertici trasformati
    const corners = getWorldCorners(e);
    for (const c of corners) {
      x0=Math.min(x0,c.x); y0=Math.min(y0,c.y); z0=Math.min(z0,c.z);
      x1=Math.max(x1,c.x); y1=Math.max(y1,c.y); z1=Math.max(z1,c.z);
    }
  }
  return { x0,y0,z0, w:x1-x0, h:y1-y0, d:z1-z0 };
}

// Restituisce gli 8 angoli del cubo nel world space (dopo rotazione)
function getWorldCorners(el) {
  const fx=Math.min(el.from[0],el.to[0]), fy=Math.min(el.from[1],el.to[1]), fz=Math.min(el.from[2],el.to[2]);
  const tx=Math.max(el.from[0],el.to[0]), ty=Math.max(el.from[1],el.to[1]), tz=Math.max(el.from[2],el.to[2]);
  const localCorners = [
    {x:fx,y:fy,z:fz},{x:tx,y:fy,z:fz},{x:fx,y:ty,z:fz},{x:tx,y:ty,z:fz},
    {x:fx,y:fy,z:tz},{x:tx,y:fy,z:tz},{x:fx,y:ty,z:tz},{x:tx,y:ty,z:tz},
  ];
  const rot = el.rotation;
  if (!rot || rot.angle === 0) return localCorners;

  const axMap = { x:{x:1,y:0,z:0}, y:{x:0,y:1,z:0}, z:{x:0,y:0,z:1} };
  const R = rotMatrix(axMap[rot.axis]||axMap.y, rot.angle);
  const o = {x:rot.origin[0], y:rot.origin[1], z:rot.origin[2]};

  return localCorners.map(p => {
    // Trasla rispetto all'origin, ruota, ritrasla
    const rel = {x:p.x-o.x, y:p.y-o.y, z:p.z-o.z};
    const rot2 = matVec(R, rel);
    return {x:rot2.x+o.x, y:rot2.y+o.y, z:rot2.z+o.z};
  });
}

// ===== Load textures =====
async function loadTextures(model) {
  texImages = {};
  for (let i = 0; i < (model.textures||[]).length; i++) {
    const tex = model.textures[i];
    let src = tex.source || tex.data || '';
    if (src && !src.startsWith('data:')) src = 'data:image/png;base64,' + src;
    if (!src) continue;
    try { texImages[i] = await loadImage(src); } catch(_) {}
  }
}

// ===== Rotazione: prepara dati per OBB =====
//
// Blockbench: la rotazione è attorno a `rotation.origin` (world coords),
// sull'asse rotation.axis, di rotation.angle gradi.
//
// Per testare se un voxel world-point P è dentro il cubo ruotato:
//   1. Sottrai l'origin: P_rel = P - origin
//   2. Applica la rotazione INVERSA (= trasposta per matrici ortonormali): P_local = R^T * P_rel
//   3. Verifica se P_local è dentro il cubo non-ruotato
//      cioè from[i] <= P_local[i] <= to[i]
//
// NON usiamo il centro dell'OBB come centro di rotazione — usiamo l'origin di BB.

function buildElementRotation(el) {
  const rot = el.rotation;
  if (!rot || rot.angle === 0) return null;
  const axMap = { x:{x:1,y:0,z:0}, y:{x:0,y:1,z:0}, z:{x:0,y:0,z:1} };
  const R  = rotMatrix(axMap[rot.axis]||axMap.y, rot.angle);
  const Rt = matTranspose(R); // rotazione inversa
  const origin = {x:rot.origin[0], y:rot.origin[1], z:rot.origin[2]};
  return { Rt, origin,
    // Bounds NON-ruotati dell'elemento in coordinate BB (per il test locale)
    fx: Math.min(el.from[0],el.to[0]),
    fy: Math.min(el.from[1],el.to[1]),
    fz: Math.min(el.from[2],el.to[2]),
    tx: Math.max(el.from[0],el.to[0]),
    ty: Math.max(el.from[1],el.to[1]),
    tz: Math.max(el.from[2],el.to[2]),
  };
}

// Test: il punto world-space P (in coordinate BB) è dentro il cubo ruotato?
function pointInRotatedElement(P_bb, elRot) {
  const { Rt, origin, fx,fy,fz,tx,ty,tz } = elRot;
  // Trasla rispetto all'origin di rotazione
  const rel = { x: P_bb.x - origin.x, y: P_bb.y - origin.y, z: P_bb.z - origin.z };
  // Applica rotazione inversa → torna nel frame locale dell'elemento
  const local = matVec(Rt, rel);
  // Riporta al frame del cubo (ri-aggiungi origin)
  const lx = local.x + origin.x;
  const ly = local.y + origin.y;
  const lz = local.z + origin.z;
  // Test AABB nel frame locale
  return lx >= fx - 1e-6 && lx <= tx + 1e-6
      && ly >= fy - 1e-6 && ly <= ty + 1e-6
      && lz >= fz - 1e-6 && lz <= tz + 1e-6;
}

// ===== UV sampling per bit =====
const FACE_NAMES = ['north','south','east','west','up','down'];

// Dato un bit nella griglia world-bit-space, e i dati elemento,
// calcola la faccia più esterna e campiona la UV corrispondente.
// Per elementi ruotati, ricava le coordinate locali proiettando indietro.

function sampleBitColor(wx, wy, wz, el, elRot, mat, scale, x0, y0, z0) {
  const texImg = mat.texImg;
  const faces = el.faces;
  if (!texImg || !faces) return { hex: mat.hex, lab: mat.lab };

  // Dimensioni dell'elemento in bit
  const efx = Math.min(el.from[0],el.to[0]);
  const efy = Math.min(el.from[1],el.to[1]);
  const efz = Math.min(el.from[2],el.to[2]);
  const etx = Math.max(el.from[0],el.to[0]);
  const ety = Math.max(el.from[1],el.to[1]);
  const etz = Math.max(el.from[2],el.to[2]);
  const bW = Math.max(1, Math.round((etx-efx)*scale));
  const bH = Math.max(1, Math.round((ety-efy)*scale));
  const bD = Math.max(1, Math.round((etz-efz)*scale));

  let lx, ly, lz; // coordinate locali nel cubo (indice bit, 0-based)

  if (elRot) {
    // Proietta il centro del voxel world-bit nel frame locale dell'elemento
    // Centro del voxel in coordinate BB
    const P_bb = {
      x: (wx + 0.5) / scale + x0,
      y: (wy + 0.5) / scale + y0,
      z: (wz + 0.5) / scale + z0,
    };
    const { Rt, origin } = elRot;
    const rel   = { x: P_bb.x-origin.x, y: P_bb.y-origin.y, z: P_bb.z-origin.z };
    const local = matVec(Rt, rel);
    const lx_bb = local.x + origin.x;
    const ly_bb = local.y + origin.y;
    const lz_bb = local.z + origin.z;
    // Converti in indice bit locale
    lx = Math.round((lx_bb - efx) * scale - 0.5);
    ly = Math.round((ly_bb - efy) * scale - 0.5);
    lz = Math.round((lz_bb - efz) * scale - 0.5);
  } else {
    // Asse-allineato: coordinate dirette
    const bx0 = Math.round((efx - x0) * scale);
    const by0 = Math.round((efy - y0) * scale);
    const bz0 = Math.round((efz - z0) * scale);
    lx = wx - bx0;
    ly = wy - by0;
    lz = wz - bz0;
  }

  lx = Math.min(bW-1, Math.max(0, lx));
  ly = Math.min(bH-1, Math.max(0, ly));
  lz = Math.min(bD-1, Math.max(0, lz));

  // Faccia più esterna: quella con distanza minima dal bordo
  const distToFace = {
    down:  ly,
    up:    bH-1-ly,
    west:  lx,
    east:  bW-1-lx,
    north: lz,
    south: bD-1-lz,
  };
  const face = Object.entries(distToFace).sort((a,b)=>a[1]-b[1])[0][0];

  const faceData = faces[face];
  if (!faceData || !faceData.uv) return { hex: mat.hex, lab: mat.lab };

  const [u1,v1,u2,v2] = faceData.uv;
  const nu1=u1/16, nv1=v1/16, nu2=u2/16, nv2=v2/16;

  let tu, tv;
  switch(face) {
    case 'up':    tu=(lx+0.5)/bW;   tv=(lz+0.5)/bD;   break;
    case 'down':  tu=(lx+0.5)/bW;   tv=1-(lz+0.5)/bD; break;
    case 'north': tu=1-(lx+0.5)/bW; tv=1-(ly+0.5)/bH; break;
    case 'south': tu=(lx+0.5)/bW;   tv=1-(ly+0.5)/bH; break;
    case 'east':  tu=1-(lz+0.5)/bD; tv=1-(ly+0.5)/bH; break;
    case 'west':  tu=(lz+0.5)/bD;   tv=1-(ly+0.5)/bH; break;
    default:      tu=0.5; tv=0.5;
  }

  const u = Math.min(1, Math.max(0, nu1 + tu*(nu2-nu1)));
  const v = Math.min(1, Math.max(0, nv1 + tv*(nv2-nv1)));
  const col = sampleUV(texImg, u, v);
  return col || { hex: mat.hex, lab: mat.lab };
}

// ===== Voxelization =====
btnGenerate.addEventListener('click', async () => {
  if (!rawModel) return;
  clearError();
  btnGenerate.disabled = true;
  btnGenerate.textContent = 'Elaborazione…';
  try { await buildVoxels(); }
  catch(e) { showError('Errore: '+e.message); console.error(e); }
  btnGenerate.disabled = false;
  btnGenerate.textContent = 'Genera schematica →';
});

const FALLBACK_PALETTE = [
  '#4d96ff','#ff6b6b','#6bcb77','#ffd93d','#c77dff',
  '#ff9f1c','#2ec4b6','#e71d36','#aaaaaa','#4a4e69',
];

async function buildVoxels() {
  const els = getAllElements(rawModel);
  if (!els.length) { showError('Nessun cubo trovato.'); return; }

  await loadTextures(rawModel);

  const bounds = getBBBounds(rawModel);
  const {x0,y0,z0} = bounds;
  const nBlocks = parseInt(scaleBlocksEl.value)||1;
  const maxSide = Math.max(bounds.w, bounds.h, bounds.d);
  const scale   = (nBlocks*16) / maxSide;

  const W = Math.max(1, Math.round(bounds.w*scale));
  const H = Math.max(1, Math.round(bounds.h*scale));
  const D = Math.max(1, Math.round(bounds.d*scale));

  const voxGrid = [];
  const colGrid = [];
  for (let y=0;y<H;y++) {
    voxGrid[y]=[]; colGrid[y]=[];
    for (let z=0;z<D;z++) {
      voxGrid[y][z] = new Int32Array(W);
      colGrid[y][z] = new Array(W).fill(null);
    }
  }

  materials = [];
  const matKeyMap = {};

  function getMatIdx(el) {
    let texIdx = null;
    if (el.faces) {
      for (const f of Object.values(el.faces)) {
        if (f && f.texture !== undefined && f.texture !== null && f.texture !== -1) {
          texIdx = f.texture; break;
        }
      }
    }
    const key = texIdx !== null ? 'tex:'+texIdx : 'col:'+(el.color||0);
    if (matKeyMap[key] !== undefined) return matKeyMap[key];
    const idx = materials.length;
    matKeyMap[key] = idx;

    let hex, lab, name, dataUrl = null;
    if (texIdx !== null && rawModel.textures && rawModel.textures[texIdx]) {
      const tex = rawModel.textures[texIdx];
      name = tex.name || ('tex'+texIdx);
      let src = tex.source || tex.data || '';
      if (src && !src.startsWith('data:')) src='data:image/png;base64,'+src;
      dataUrl = src || null;
      if (texImages[texIdx]) {
        const offC = document.createElement('canvas');
        const d = imageToData(texImages[texIdx], offC);
        const avg = averageColor(d);
        hex=avg.hex; lab=avg.lab;
      } else { hex='#888888'; lab=rgbToLab(136,136,136); }
    } else {
      const c = FALLBACK_PALETTE[(el.color||0) % FALLBACK_PALETTE.length];
      hex=c; const rgb=hexToRgb(c); lab=rgbToLab(rgb.r,rgb.g,rgb.b);
      name='Colore '+(el.color||0);
    }
    materials.push({ name, hex, lab, dataUrl, texImg: texImages[texIdx]||null });
    return idx;
  }

  for (const el of els) {
    const matIdx = getMatIdx(el) + 1;
    const mat    = materials[matIdx-1];
    const elRot  = buildElementRotation(el); // null se non ruotato

    // Bounds dell'elemento in coordinate BB (non-ruotate, usate per il test locale)
    const efx = Math.min(el.from[0],el.to[0]);
    const efy = Math.min(el.from[1],el.to[1]);
    const efz = Math.min(el.from[2],el.to[2]);
    const etx = Math.max(el.from[0],el.to[0]);
    const ety = Math.max(el.from[1],el.to[1]);
    const etz = Math.max(el.from[2],el.to[2]);

    if (!elRot) {
      // ---- AXIS-ALIGNED: iterazione diretta ----
      const bx0 = Math.max(0, Math.floor((efx-x0)*scale));
      const bx1 = Math.min(W,  Math.ceil((etx-x0)*scale));
      const by0 = Math.max(0, Math.floor((efy-y0)*scale));
      const by1 = Math.min(H,  Math.ceil((ety-y0)*scale));
      const bz0 = Math.max(0, Math.floor((efz-z0)*scale));
      const bz1 = Math.min(D,  Math.ceil((etz-z0)*scale));

      for (let y=by0;y<by1;y++) {
        for (let z=bz0;z<bz1;z++) {
          for (let x=bx0;x<bx1;x++) {
            if (voxGrid[y][z][x]) continue;
            voxGrid[y][z][x] = matIdx;
            colGrid[y][z][x] = sampleBitColor(x,y,z, el,null,mat, scale,x0,y0,z0);
          }
        }
      }
    } else {
      // ---- RUOTATO: calcola AABB dei vertici trasformati per iterazione ----
      const corners = getWorldCorners(el);
      let wx0=Infinity,wy0=Infinity,wz0=Infinity,wx1=-Infinity,wy1=-Infinity,wz1=-Infinity;
      for (const c of corners) {
        wx0=Math.min(wx0,c.x); wy0=Math.min(wy0,c.y); wz0=Math.min(wz0,c.z);
        wx1=Math.max(wx1,c.x); wy1=Math.max(wy1,c.y); wz1=Math.max(wz1,c.z);
      }
      // Converti in bit-coords e aggiungi 1 bit di padding
      const bx0 = Math.max(0, Math.floor((wx0-x0)*scale)-1);
      const bx1 = Math.min(W,  Math.ceil((wx1-x0)*scale)+1);
      const by0 = Math.max(0, Math.floor((wy0-y0)*scale)-1);
      const by1 = Math.min(H,  Math.ceil((wy1-y0)*scale)+1);
      const bz0 = Math.max(0, Math.floor((wz0-z0)*scale)-1);
      const bz1 = Math.min(D,  Math.ceil((wz1-z0)*scale)+1);

      for (let y=by0;y<by1;y++) {
        for (let z=bz0;z<bz1;z++) {
          for (let x=bx0;x<bx1;x++) {
            if (voxGrid[y][z][x]) continue;
            // Centro del voxel in coordinate BB
            const P_bb = {
              x: (x+0.5)/scale + x0,
              y: (y+0.5)/scale + y0,
              z: (z+0.5)/scale + z0,
            };
            if (!pointInRotatedElement(P_bb, elRot)) continue;
            voxGrid[y][z][x] = matIdx;
            colGrid[y][z][x] = sampleBitColor(x,y,z, el,elRot,mat, scale,x0,y0,z0);
          }
        }
      }
    }
  }

  voxels      = voxGrid;
  voxelColors = colGrid;
  dims = {w:W, h:H, d:D};
  axis = 'y';
  currentLayer = 0;

  let totalBits=0;
  for (let y=0;y<H;y++) for(let z=0;z<D;z++) for(let x=0;x<W;x++) if(voxGrid[y][z][x]) totalBits++;

  statsRow.innerHTML = [
    [W+'×'+H+'×'+D, 'Dimensioni (bit)'],
    [Math.ceil(W/16)+'×'+Math.ceil(H/16)+'×'+Math.ceil(D/16), 'Blocchi C&B'],
    [totalBits.toLocaleString('it'), 'Bit pieni'],
    [els.length, 'Cubi sorgente'],
  ].map(([v,l])=>`<div class="stat"><div class="val">${v}</div><div class="lbl">${l}</div></div>`).join('');

  document.querySelectorAll('#axisToggle button').forEach(b=>b.classList.toggle('active',b.dataset.ax==='y'));

  const colorSugCache = new Map();
  function getSuggestions(hex, lab) {
    if (!palette||!palette.length) return [];
    if (colorSugCache.has(hex)) return colorSugCache.get(hex);
    const s = findClosestBlocks(lab, palette, 4);
    colorSugCache.set(hex, s);
    return s;
  }

  buildMaterialsGrid(getSuggestions);
  buildHighlightSelect();
  refreshSlider();
  secViewer.style.display = 'block';
  secViewer.scrollIntoView({behavior:'smooth', block:'nearest'});
  drawLayer();
}

// ===== Materials grid =====
function buildMaterialsGrid(getSuggestions) {
  materialsGrid.innerHTML = '';
  materials.forEach((mat,i) => {
    const card = document.createElement('div');
    card.className = 'mat-card';
    card.dataset.matIdx = i;

    const thumbHtml = mat.dataUrl
      ? `<img src="${mat.dataUrl}" alt="${mat.name}" class="mat-thumb">`
      : `<div class="mat-thumb mat-thumb--color" style="background:${mat.hex}"></div>`;

    const sugs = getSuggestions(mat.hex, mat.lab);
    const sugHtml = sugs.length
      ? `<div class="mat-suggestions">
           <div class="mat-sug-label">Blocchi suggeriti:</div>
           <div class="mat-sug-list">
             ${sugs.map(s=>`
               <div class="mat-sug-item ${s.chiselable===false?'mat-sug-item--notchisel':''}">
                 <div class="mat-sug-swatch" style="background:${s.hex}"></div>
                 <span class="mat-sug-id">${s.id||s.shortId||'?'}</span>
                 <span class="mat-sug-dist">${Math.round(s.dist)}</span>
               </div>`).join('')}
           </div>
         </div>`
      : `<div class="mat-no-palette">Carica una palette per i suggerimenti</div>`;

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
      ${sugHtml}`;

    card.addEventListener('click', () => {
      const active = card.classList.toggle('mat-card--active');
      highlightSel.value = active ? String(i+1) : '';
      document.querySelectorAll('.mat-card').forEach(c=>{ if(c!==card) c.classList.remove('mat-card--active'); });
      drawLayer();
    });
    materialsGrid.appendChild(card);
  });
}

function buildHighlightSelect() {
  highlightSel.innerHTML = '<option value="">— tutti —</option>';
  materials.forEach((mat,i)=>{
    const o=document.createElement('option');
    o.value=String(i+1); o.textContent=`#${i+1} ${mat.name}`;
    highlightSel.appendChild(o);
  });
}

highlightSel.addEventListener('change', () => {
  document.querySelectorAll('.mat-card').forEach(c=>c.classList.remove('mat-card--active'));
  const v=highlightSel.value;
  if(v){ const c=materialsGrid.children[parseInt(v)-1]; if(c) c.classList.add('mat-card--active'); }
  drawLayer();
});

// ===== Axis =====
axisToggle.addEventListener('click', e=>{
  const btn=e.target.closest('button'); if(!btn||!voxels) return;
  axis=btn.dataset.ax; currentLayer=0;
  document.querySelectorAll('#axisToggle button').forEach(b=>b.classList.toggle('active',b.dataset.ax===axis));
  refreshSlider(); drawLayer();
});

// ===== Layer nav =====
function layerCount() { if(!voxels)return 0; return axis==='y'?dims.h:axis==='x'?dims.w:dims.d; }

function refreshSlider() {
  const lc=layerCount();
  layerSlider.max=Math.max(0,lc-1);
  currentLayer=Math.max(0,Math.min(currentLayer,lc-1));
  layerSlider.value=currentLayer;
  btnPrev.disabled=currentLayer===0;
  btnNext.disabled=currentLayer>=lc-1;
  layerCounter.textContent=(currentLayer+1)+' / '+lc;
}

layerSlider.addEventListener('input',()=>{currentLayer=parseInt(layerSlider.value);refreshSlider();drawLayer();});
btnPrev.addEventListener('click',()=>{if(currentLayer>0){currentLayer--;refreshSlider();drawLayer();}});
btnNext.addEventListener('click',()=>{if(currentLayer<layerCount()-1){currentLayer++;refreshSlider();drawLayer();}});
document.addEventListener('keydown',e=>{
  if(!voxels)return;
  if(e.key==='ArrowLeft'||e.key==='ArrowDown'){e.preventDefault();if(currentLayer>0){currentLayer--;refreshSlider();drawLayer();}}
  if(e.key==='ArrowRight'||e.key==='ArrowUp'){e.preventDefault();if(currentLayer<layerCount()-1){currentLayer++;refreshSlider();drawLayer();}}
});

// ===== Zoom =====
btnZoomIn.addEventListener('click',()=>{if(cellSize<40){cellSize=Math.min(40,cellSize+2);zoomLabel.textContent=cellSize+'px';if(voxels)drawLayer();}});
btnZoomOut.addEventListener('click',()=>{if(cellSize>4){cellSize=Math.max(4,cellSize-2);zoomLabel.textContent=cellSize+'px';if(voxels)drawLayer();}});

// ===== Draw =====
function getSlice(l) {
  const {w,h,d}=dims;
  if (axis==='y') return { rows:d, cols:w, getV:(r,c)=>voxels[l][r][c],      getC:(r,c)=>voxelColors[l][r][c] };
  if (axis==='x') return { rows:h, cols:d, getV:(r,c)=>voxels[h-1-r][c][l],  getC:(r,c)=>voxelColors[h-1-r][c][l] };
  return             { rows:h, cols:w, getV:(r,c)=>voxels[h-1-r][l][c],  getC:(r,c)=>voxelColors[h-1-r][l][c] };
}

function drawLayer() {
  if (!voxels) return;
  const {rows,cols,getV,getC} = getSlice(currentLayer);
  const cs = cellSize;
  const hilite = highlightSel ? parseInt(highlightSel.value)||0 : 0;

  canvas.width  = cols*cs;
  canvas.height = rows*cs;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  let bitsInLayer=0;
  for (let r=0;r<rows;r++) {
    for (let col=0;col<cols;col++) {
      const v = getV(r,col);
      const x=col*cs, y=r*cs;
      if (!v) {
        if (cs>=6) { ctx.strokeStyle='rgba(128,128,128,0.07)'; ctx.lineWidth=.5; ctx.strokeRect(x,y,cs,cs); }
        continue;
      }
      bitsInLayer++;
      const bitColor = getC(r,col);
      const hex = bitColor ? bitColor.hex : (materials[v-1]?.hex||'#888');

      if (hilite && v!==hilite) {
        ctx.fillStyle='rgba(128,128,128,0.12)';
        ctx.fillRect(x,y,cs,cs);
      } else {
        ctx.fillStyle=hex;
        ctx.fillRect(x,y,cs,cs);
        ctx.strokeStyle='rgba(0,0,0,0.1)';
        ctx.lineWidth=.5;
        ctx.strokeRect(x+.25,y+.25,cs-.5,cs-.5);
        if (cs>=20 && materials.length>1) {
          ctx.fillStyle='rgba(0,0,0,0.28)';
          ctx.font=`bold ${Math.floor(cs/3)}px monospace`;
          ctx.textAlign='center';
          ctx.textBaseline='middle';
          ctx.fillText(v, x+cs/2, y+cs/2);
        }
      }
    }
  }
  layerInfo.textContent=`Asse ${axis.toUpperCase()}, layer ${currentLayer+1} — ${bitsInLayer} bit`;
  refreshSlider();
}

// ===== Click su bit → tooltip blocco suggerito =====
canvas.addEventListener('click', e => {
  if (!voxels||!palette||!palette.length) return;
  const rect=canvas.getBoundingClientRect();
  const px=Math.floor((e.clientX-rect.left)*(canvas.width/rect.width)/cellSize);
  const py=Math.floor((e.clientY-rect.top)*(canvas.height/rect.height)/cellSize);
  const {rows,cols,getV,getC}=getSlice(currentLayer);
  if (px<0||px>=cols||py<0||py>=rows) return;
  const v=getV(py,px); if(!v) return;
  const bitColor=getC(py,px); if(!bitColor) return;
  const sugs=findClosestBlocks(bitColor.lab,palette,4);
  showBitTooltip(e.clientX,e.clientY,bitColor,sugs,v);
});

let tooltipEl=null;
function showBitTooltip(cx,cy,color,sugs,matIdx) {
  if(tooltipEl) tooltipEl.remove();
  tooltipEl=document.createElement('div');
  tooltipEl.className='bit-tooltip';
  tooltipEl.innerHTML=`
    <div class="bt-header">
      <div class="bt-swatch" style="background:${color.hex}"></div>
      <span>${color.hex}</span>
      <span class="bt-mat">mat #${matIdx}</span>
      <button class="bt-close">×</button>
    </div>
    <div class="bt-label">Blocchi per questo bit:</div>
    <div class="bt-list">
      ${sugs.map((s,i)=>`
        <div class="bt-item ${i===0?'bt-item--best':''}">
          <div class="bt-iswatch" style="background:${s.hex}"></div>
          <span class="bt-iid">${s.id||s.shortId||'?'}</span>
          <span class="bt-idist">${Math.round(s.dist)}</span>
        </div>`).join('')}
    </div>`;
  tooltipEl.style.cssText=`position:fixed;z-index:9999;left:${Math.min(cx+12,window.innerWidth-300)}px;top:${Math.max(8,cy-8)}px`;
  document.body.appendChild(tooltipEl);
  tooltipEl.querySelector('.bt-close').addEventListener('click',()=>tooltipEl.remove());
  setTimeout(()=>{ document.addEventListener('click',()=>tooltipEl?.remove(),{once:true}); },100);
}

// ===== Helpers =====
function showError(msg){errorBox.textContent=msg;errorBox.style.display='block';}
function clearError(){errorBox.style.display='none';}
