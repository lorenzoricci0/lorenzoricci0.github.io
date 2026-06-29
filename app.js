// ===== State =====
let rawModel     = null;
let palette      = null;
let voxels       = null;   // voxels[y][z][x] = { matIdx (1-based), color: {hex,lab} }
let voxelColors  = null;   // parallel: voxelColors[y][z][x] = {hex, lab} per-bit color
let dims         = { w:0, h:0, d:0 };
let axis         = 'y';
let currentLayer = 0;
let cellSize     = 16;
let materials    = [];     // [ {name, hex, lab, dataUrl, texImg} ]
let texImages    = {};     // texIdx → HTMLImageElement

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
    const f=e.from||[0,0,0], t=e.to||[16,16,16];
    x0=Math.min(x0,f[0],t[0]); y0=Math.min(y0,f[1],t[1]); z0=Math.min(z0,f[2],t[2]);
    x1=Math.max(x1,f[0],t[0]); y1=Math.max(y1,f[1],t[1]); z1=Math.max(z1,f[2],t[2]);
  }
  return { x0,y0,z0, w:x1-x0, h:y1-y0, d:z1-z0 };
}

// ===== Load textures =====
async function loadTextures(model) {
  texImages = {};
  const textures = model.textures || [];
  for (let i = 0; i < textures.length; i++) {
    const tex = textures[i];
    let src = tex.source || tex.data || '';
    if (src && !src.startsWith('data:')) src = 'data:image/png;base64,' + src;
    if (!src) continue;
    try { texImages[i] = await loadImage(src); } catch(_) {}
  }
}

// ===== Build rotation matrix for a BB element =====
// BB rotation: { axis: "x"|"y"|"z", angle: degrees, origin: [x,y,z] }
function getElementTransform(el) {
  const rot = el.rotation;
  if (!rot || rot.angle === 0) return null;
  const axMap = { x: vec3(1,0,0), y: vec3(0,1,0), z: vec3(0,0,1) };
  const axVec = axMap[rot.axis] || vec3(0,1,0);
  const origin = vec3(rot.origin[0], rot.origin[1], rot.origin[2]);
  const R = rotMatrix(axVec, rot.angle);
  return { R, Rt: matTranspose(R), origin };
}

// ===== UV sampling for a bit =====
// Given element, its faces map (with UV coords), loaded texture images,
// the bit's world position, and which face is "most external":
// returns {hex, lab} color for that bit.
//
// BB UV format in faces: { uv: [u1,v1,u2,v2] } in texture pixel coords (0-16 range by default)
// We need to normalize by texture size.

const FACE_DIRS = {
  north: vec3( 0, 0,-1),
  south: vec3( 0, 0, 1),
  east:  vec3( 1, 0, 0),
  west:  vec3(-1, 0, 0),
  up:    vec3( 0, 1, 0),
  down:  vec3( 0,-1, 0),
};

// For a bit at local position (lx,ly,lz) inside the element (in bit coords 0..W, 0..H, 0..D),
// determine the most external face given element bit-dimensions (bW, bH, bD).
// Returns face name: 'north'|'south'|'east'|'west'|'up'|'down'
function mostExternalFace(lx, ly, lz, bW, bH, bD) {
  // Distance to each face (0 = on the face)
  const scores = {
    down:  ly,
    up:    bH - 1 - ly,
    west:  lx,
    east:  bW - 1 - lx,
    north: lz,
    south: bD - 1 - lz,
  };
  return Object.entries(scores).sort((a,b)=>a[1]-b[1])[0][0];
}

// Compute UV coordinate for a bit on a given face of the element.
// lx,ly,lz = local bit index; bW,bH,bD = element size in bits; face = face name
// Returns {u,v} in [0,1] referencing the texture.
function bitFaceUV(face, lx, ly, lz, bW, bH, bD, faceData) {
  if (!faceData || !faceData.uv) return {u:0.5, v:0.5};
  const [u1,v1,u2,v2] = faceData.uv;
  // Normalized UV region [0,1]
  const nu1 = u1/16, nv1 = v1/16, nu2 = u2/16, nv2 = v2/16;

  // Local t values (0..1) along the face axes
  let tx, ty;
  switch(face) {
    case 'up':    tx = (lx+0.5)/bW; ty = (lz+0.5)/bD; break;
    case 'down':  tx = (lx+0.5)/bW; ty = 1-(lz+0.5)/bD; break;
    case 'north': tx = 1-(lx+0.5)/bW; ty = 1-(ly+0.5)/bH; break;
    case 'south': tx = (lx+0.5)/bW; ty = 1-(ly+0.5)/bH; break;
    case 'east':  tx = 1-(lz+0.5)/bD; ty = 1-(ly+0.5)/bH; break;
    case 'west':  tx = (lz+0.5)/bD; ty = 1-(ly+0.5)/bH; break;
    default:      tx=0.5; ty=0.5;
  }
  // Map into the UV region
  const u = nu1 + tx*(nu2-nu1);
  const v = nv1 + ty*(nv2-nv1);
  return { u: Math.min(1,Math.max(0,u)), v: Math.min(1,Math.max(0,v)) };
}

// ===== Voxelization with OBB support =====
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
  const blocks = parseInt(scaleBlocksEl.value)||1;
  const maxSide = Math.max(bounds.w, bounds.h, bounds.d);
  const scale = (blocks*16) / maxSide;

  const W = Math.max(1, Math.round(bounds.w*scale));
  const H = Math.max(1, Math.round(bounds.h*scale));
  const D = Math.max(1, Math.round(bounds.d*scale));

  // voxGrid[y][z][x] = matIdx (1-based, 0=empty)
  const voxGrid = [];
  // colGrid[y][z][x] = {hex, lab} — per-bit color sampled from texture
  const colGrid = [];
  for (let y=0;y<H;y++) {
    voxGrid[y]=[]; colGrid[y]=[];
    for (let z=0;z<D;z++) {
      voxGrid[y][z] = new Int32Array(W);
      colGrid[y][z] = new Array(W).fill(null);
    }
  }

  // Build materials list
  materials = [];
  const matKeyMap = {};

  function getMatIdx(el) {
    // Primary key: first texture index found on any face
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
      // We'll compute avg color from the image we already loaded
      if (texImages[texIdx]) {
        const offC = document.createElement('canvas');
        const d = imageToData(texImages[texIdx], offC);
        const avg = averageColor(d);
        hex=avg.hex; lab=avg.lab;
      } else { hex='#888'; lab=rgbToLab(136,136,136); }
    } else {
      const c = FALLBACK_PALETTE[(el.color||0) % FALLBACK_PALETTE.length];
      hex=c; const rgb=hexToRgb(c); lab=rgbToLab(rgb.r,rgb.g,rgb.b);
      name='Colore '+(el.color||0);
    }
    materials.push({ name, hex, lab, dataUrl, texImg: texImages[texIdx]||null });
    return idx;
  }

  // Voxelize each element
  for (const el of els) {
    const matIdx = getMatIdx(el) + 1;
    const mat = materials[matIdx-1];
    const transform = getElementTransform(el);

    // Element bounds in BB units
    const fx = Math.min(el.from[0],el.to[0]);
    const fy = Math.min(el.from[1],el.to[1]);
    const fz = Math.min(el.from[2],el.to[2]);
    const tx = Math.max(el.from[0],el.to[0]);
    const ty = Math.max(el.from[1],el.to[1]);
    const tz = Math.max(el.from[2],el.to[2]);

    // Convert to bit coords (offset by model origin)
    const bx0 = Math.max(0, Math.floor((fx-x0)*scale));
    const bx1 = Math.min(W,  Math.ceil((tx-x0)*scale));
    const by0 = Math.max(0, Math.floor((fy-y0)*scale));
    const by1 = Math.min(H,  Math.ceil((ty-y0)*scale));
    const bz0 = Math.max(0, Math.floor((fz-z0)*scale));
    const bz1 = Math.min(D,  Math.ceil((tz-z0)*scale));

    // Element size in bits
    const bW = bx1-bx0, bH = by1-by0, bD = bz1-bz0;
    if (bW<=0||bH<=0||bD<=0) continue;

    if (!transform) {
      // ---- AXIS-ALIGNED: fast path ----
      for (let y=by0;y<by1;y++) {
        for (let z=bz0;z<bz1;z++) {
          for (let x=bx0;x<bx1;x++) {
            if (voxGrid[y][z][x]) continue;
            voxGrid[y][z][x] = matIdx;
            // Sample per-bit color
            const lx=x-bx0, ly=y-by0, lz=z-bz0;
            const face = mostExternalFace(lx,ly,lz,bW,bH,bD);
            const faceData = el.faces && el.faces[face];
            const texImg = mat.texImg;
            if (texImg && faceData) {
              const {u,v} = bitFaceUV(face,lx,ly,lz,bW,bH,bD,faceData);
              const col = sampleUV(texImg, u, v);
              colGrid[y][z][x] = col || { hex: mat.hex, lab: mat.lab };
            } else {
              colGrid[y][z][x] = { hex: mat.hex, lab: mat.lab };
            }
          }
        }
      }
    } else {
      // ---- ROTATED: OBB test ----
      // Center of element in BB units (world space)
      const cx = (fx+tx)/2, cy = (fy+ty)/2, cz = (fz+tz)/2;
      const center = vec3(
        (cx-x0)*scale,
        (cy-y0)*scale,
        (cz-z0)*scale,
      );
      const he = vec3(bW/2, bH/2, bD/2);
      const { R, Rt, origin } = transform;
      // Origin in bit coords
      const originBit = vec3(
        (origin.x-x0)*scale,
        (origin.y-y0)*scale,
        (origin.z-z0)*scale,
      );

      // AABB of the rotated box for iteration bounds
      // (just use padded bounding box of the original)
      const pad = Math.ceil(Math.max(bW,bH,bD) * 0.5 * (Math.SQRT2-1)) + 1;
      const ix0 = Math.max(0, bx0-pad), ix1 = Math.min(W, bx1+pad);
      const iy0 = Math.max(0, by0-pad), iy1 = Math.min(H, by1+pad);
      const iz0 = Math.max(0, bz0-pad), iz1 = Math.min(D, bz1+pad);

      for (let y=iy0;y<iy1;y++) {
        for (let z=iz0;z<iz1;z++) {
          for (let x=ix0;x<ix1;x++) {
            if (voxGrid[y][z][x]) continue;
            // Center of this voxel in bit coords
            const p = vec3(x+0.5, y+0.5, z+0.5);
            if (!pointInOBB(p, center, he, Rt)) continue;
            voxGrid[y][z][x] = matIdx;

            // For UV sampling in rotated case: approximate local coords
            // by projecting back to element local frame
            const local = matVec(Rt, vsub(p, center));
            const lx = Math.round(local.x + bW/2 - 0.5);
            const ly = Math.round(local.y + bH/2 - 0.5);
            const lz = Math.round(local.z + bD/2 - 0.5);
            const clx = Math.min(bW-1, Math.max(0, lx));
            const cly = Math.min(bH-1, Math.max(0, ly));
            const clz = Math.min(bD-1, Math.max(0, lz));

            const face = mostExternalFace(clx,cly,clz,bW,bH,bD);
            const faceData = el.faces && el.faces[face];
            const texImg = mat.texImg;
            if (texImg && faceData) {
              const {u,v} = bitFaceUV(face,clx,cly,clz,bW,bH,bD,faceData);
              const col = sampleUV(texImg, u, v);
              colGrid[y][z][x] = col || { hex: mat.hex, lab: mat.lab };
            } else {
              colGrid[y][z][x] = { hex: mat.hex, lab: mat.lab };
            }
          }
        }
      }
    }
  }

  // ===== Now compute per-bit block suggestions from palette =====
  // Build a unique-color → suggestions map to avoid re-computing the same color
  const colorSugCache = new Map();
  function getSuggestions(colorHex, colorLab) {
    if (!palette || !palette.length) return [];
    const k = colorHex;
    if (colorSugCache.has(k)) return colorSugCache.get(k);
    const s = findClosestBlocks(colorLab, palette, 4);
    colorSugCache.set(k, s);
    return s;
  }

  // Attach suggestions to each non-null colGrid entry
  // (stored in voxels struct for access during draw)
  voxels = voxGrid;
  voxelColors = colGrid;
  dims = {w:W, h:H, d:D};
  axis = 'y';
  currentLayer = 0;

  // Stats
  let totalBits=0;
  for (let y=0;y<H;y++) for (let z=0;z<D;z++) for (let x=0;x<W;x++) if(voxGrid[y][z][x]) totalBits++;

  statsRow.innerHTML = [
    [W+'×'+H+'×'+D, 'Dimensioni (bit)'],
    [Math.ceil(W/16)+'×'+Math.ceil(H/16)+'×'+Math.ceil(D/16), 'Blocchi C&B'],
    [totalBits.toLocaleString('it'), 'Bit pieni'],
    [els.length, 'Cubi sorgente'],
  ].map(([v,l])=>`<div class="stat"><div class="val">${v}</div><div class="lbl">${l}</div></div>`).join('');

  document.querySelectorAll('#axisToggle button').forEach(b=>b.classList.toggle('active',b.dataset.ax==='y'));

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
  materials.forEach((mat, i) => {
    const card = document.createElement('div');
    card.className = 'mat-card';
    card.dataset.matIdx = i;

    const thumbHtml = mat.dataUrl
      ? `<img src="${mat.dataUrl}" alt="${mat.name}" class="mat-thumb">`
      : `<div class="mat-thumb mat-thumb--color" style="background:${mat.hex}"></div>`;

    const sugs = getSuggestions(mat.hex, mat.lab);
    const sugHtml = sugs.length
      ? `<div class="mat-suggestions">
           <div class="mat-sug-label">Blocchi suggeriti (media texture):</div>
           <div class="mat-sug-list">
             ${sugs.map(s=>`
               <div class="mat-sug-item ${s.chiselable===false?'mat-sug-item--notchisel':''}">
                 <div class="mat-sug-swatch" style="background:${s.hex}" title="${s.hex}"></div>
                 <span class="mat-sug-id">${s.id||s.shortId||'?'}</span>
                 <span class="mat-sug-dist">${Math.round(s.dist)}</span>
                 ${s.chiselable===false?'<span class="tag tag--no-sm">✗</span>':''}
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
      document.querySelectorAll('.mat-card').forEach(c => { if(c!==card) c.classList.remove('mat-card--active'); });
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
  if (v) { const c=materialsGrid.children[parseInt(v)-1]; if(c) c.classList.add('mat-card--active'); }
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
  if (axis==='y') return {
    rows:d, cols:w,
    getV:(r,c)=>voxels[l][r][c],
    getC:(r,c)=>voxelColors[l][r][c],
  };
  if (axis==='x') return {
    rows:h, cols:d,
    getV:(r,c)=>voxels[h-1-r][c][l],
    getC:(r,c)=>voxelColors[h-1-r][c][l],
  };
  return {
    rows:h, cols:w,
    getV:(r,c)=>voxels[h-1-r][l][c],
    getC:(r,c)=>voxelColors[h-1-r][l][c],
  };
}

function drawLayer() {
  if (!voxels) return;
  const {rows,cols,getV,getC} = getSlice(currentLayer);
  const c = cellSize;
  const hilite = highlightSel ? parseInt(highlightSel.value)||0 : 0;

  canvas.width  = cols*c;
  canvas.height = rows*c;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  let bitsInLayer=0;
  for (let r=0;r<rows;r++) {
    for (let col=0;col<cols;col++) {
      const v = getV(r,col);
      const x=col*c, y=r*c;
      if (!v) {
        if (c>=6) { ctx.strokeStyle='rgba(128,128,128,0.07)'; ctx.lineWidth=.5; ctx.strokeRect(x,y,c,c); }
        continue;
      }
      bitsInLayer++;

      // Use per-bit color from UV sampling
      const bitColor = getC(r,col);
      const hex = bitColor ? bitColor.hex : (materials[v-1]?.hex || '#888');

      if (hilite && v!==hilite) {
        ctx.fillStyle='rgba(128,128,128,0.12)';
        ctx.fillRect(x,y,c,c);
      } else {
        ctx.fillStyle=hex;
        ctx.fillRect(x,y,c,c);
        ctx.strokeStyle='rgba(0,0,0,0.1)';
        ctx.lineWidth=.5;
        ctx.strokeRect(x+.25,y+.25,c-.5,c-.5);
        if (c>=20 && materials.length>1) {
          ctx.fillStyle='rgba(0,0,0,0.3)';
          ctx.font=`bold ${Math.max(8,Math.floor(c/3))}px monospace`;
          ctx.textAlign='center';
          ctx.textBaseline='middle';
          ctx.fillText(v, x+c/2, y+c/2);
        }
      }
    }
  }

  layerInfo.textContent=`Asse ${axis.toUpperCase()}, layer ${currentLayer+1} — ${bitsInLayer} bit`;
  refreshSlider();
}

// Tooltip per vedere il blocco suggerito cliccando un bit
canvas.addEventListener('click', e => {
  if (!voxels || !palette || !palette.length) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const px = Math.floor((e.clientX - rect.left) * scaleX / cellSize);
  const py = Math.floor((e.clientY - rect.top)  * scaleY / cellSize);
  const {rows,cols,getV,getC} = getSlice(currentLayer);
  if (px<0||px>=cols||py<0||py>=rows) return;
  const v = getV(py,px);
  if (!v) return;
  const bitColor = getC(py,px);
  if (!bitColor) return;
  const sugs = findClosestBlocks(bitColor.lab, palette, 4);
  showBitTooltip(e.clientX, e.clientY, bitColor, sugs, v);
});

// ===== Bit tooltip =====
let tooltipEl = null;
function showBitTooltip(cx, cy, color, sugs, matIdx) {
  if (tooltipEl) tooltipEl.remove();
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'bit-tooltip';
  tooltipEl.innerHTML = `
    <div class="bt-header">
      <div class="bt-swatch" style="background:${color.hex}"></div>
      <span>${color.hex}</span>
      <span class="bt-mat">materiale #${matIdx}</span>
      <button class="bt-close">×</button>
    </div>
    <div class="bt-label">Blocchi più vicini per questo bit:</div>
    <div class="bt-list">
      ${sugs.map((s,i)=>`
        <div class="bt-item ${i===0?'bt-item--best':''}">
          <div class="bt-iswatch" style="background:${s.hex}"></div>
          <span class="bt-iid">${s.id||s.shortId||'?'}</span>
          <span class="bt-idist">${Math.round(s.dist)}</span>
        </div>`).join('')}
    </div>`;
  tooltipEl.style.cssText = `position:fixed;z-index:9999;left:${cx+12}px;top:${cy-8}px`;
  document.body.appendChild(tooltipEl);
  tooltipEl.querySelector('.bt-close').addEventListener('click', ()=>tooltipEl.remove());
  // Auto-remove on next canvas click or outside click
  setTimeout(()=>{ document.addEventListener('click', ()=>tooltipEl?.remove(), {once:true}); }, 100);
}

// ===== Helpers =====
function showError(msg) { errorBox.textContent=msg; errorBox.style.display='block'; }
function clearError()   { errorBox.style.display='none'; }
