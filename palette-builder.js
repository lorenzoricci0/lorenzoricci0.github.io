// ===== Palette Builder v3 — legge .jar direttamente dalla cartella .minecraft =====

const offscreenCanvas = document.getElementById('offscreen');
const folderInput     = document.getElementById('folderInput');
const secProgress     = document.getElementById('sec-progress');
const secResults      = document.getElementById('sec-results');
const secPick         = document.getElementById('sec-pick');
const progressBar     = document.getElementById('progressBar');
const progressStatus  = document.getElementById('progressStatus');
const progressLog     = document.getElementById('progressLog');
const textureGrid     = document.getElementById('textureGrid');
const pbCount         = document.getElementById('pbCount');
const pbSources       = document.getElementById('pbSources');
const pbSearch        = document.getElementById('pbSearch');
const chkChiselable   = document.getElementById('chkChiselable');
const chkVanillaOnly  = document.getElementById('chkVanillaOnly');
const btnExport       = document.getElementById('btnExport');
const btnReset        = document.getElementById('btnReset');

// Blocchi che non si possono chisel-are
const NON_CHISELABLE = new Set([
  'glass','tinted_glass','ice','packed_ice','blue_ice','frosted_ice',
  'barrier','bedrock','command_block','chain_command_block',
  'repeating_command_block','structure_block','jigsaw','structure_void',
  'moving_piston','piston_head','air','cave_air','void_air',
  'water','lava','fire','soul_fire','nether_portal','end_portal',
  'end_gateway','spawner',
]);
function isChiselable(id) {
  if (NON_CHISELABLE.has(id)) return false;
  if (id.includes('glass')) return false;
  if (id.includes('_door')) return false;
  if (id.includes('_trapdoor')) return false;
  if (id.includes('_banner')) return false;
  if (id.includes('_sign')) return false;
  if (id.includes('_bed')) return false;
  if (id.includes('_skull')) return false;
  if (id.includes('_head')) return false;
  if (id.includes('shulker_box')) return false;
  return true;
}

// Palette accumulata: id → {id, hex, lab, dataUrl, chiselable, source, modid}
let palette = {};
let sourcesFound = {};

// ===== Entry point =====
folderInput.addEventListener('change', async e => {
  const files = [...e.target.files];
  if (!files.length) return;

  palette = {};
  sourcesFound = {};
  textureGrid.innerHTML = '';

  secPick.style.display = 'none';
  secProgress.style.display = 'block';
  secResults.style.display = 'none';
  progressLog.innerHTML = '';

  try {
    await processMinecraftFolder(files);
  } catch (err) {
    logLine('❌ Errore: ' + err.message, 'error');
    console.error(err);
  }

  finalize();
});

// ===== Trova e processa i JAR =====
async function processMinecraftFolder(files) {
  // Trova tutti i .jar
  const jars = files.filter(f =>
    f.name.endsWith('.jar') &&
    (
      // versions/1.19.2/1.19.2.jar  → vanilla
      f.webkitRelativePath.includes('/versions/') ||
      // mods/qualcosa.jar           → mod
      f.webkitRelativePath.includes('/mods/')
    )
  );

  if (!jars.length) {
    logLine('⚠️ Nessun .jar trovato in versions/ o mods/. Assicurati di aver selezionato la cartella .minecraft corretta.', 'warn');
    return;
  }

  // Ordina: versione vanilla prima, poi mod
  jars.sort((a, b) => {
    const aV = a.webkitRelativePath.includes('/versions/');
    const bV = b.webkitRelativePath.includes('/versions/');
    if (aV && !bV) return -1;
    if (!aV && bV) return 1;
    return a.name.localeCompare(b.name);
  });

  // Filtra: per versions/, prendi solo i JAR che matchano il nome della cartella
  // (es. versions/1.19.2/1.19.2.jar, non i library)
  const filteredJars = jars.filter(f => {
    if (f.webkitRelativePath.includes('/versions/')) {
      const parts = f.webkitRelativePath.split('/');
      // struttura: .minecraft/versions/<ver>/<ver>.jar
      const jarName = parts[parts.length - 1];
      const folder  = parts[parts.length - 2];
      return jarName === folder + '.jar';
    }
    return true; // tutti i mod
  });

  logLine(`📦 Trovati ${filteredJars.length} JAR da elaborare (${jars.length - filteredJars.length} librerie ignorate)`);

  for (let i = 0; i < filteredJars.length; i++) {
    const jar = filteredJars[i];
    const isVanilla = jar.webkitRelativePath.includes('/versions/');
    const label = isVanilla ? '🟦 vanilla' : '🟩 mod';
    setProgress((i / filteredJars.length) * 100, `${label}: ${jar.name}`);
    logLine(`${label}: ${jar.name}`);

    try {
      await processJar(jar, isVanilla);
    } catch (err) {
      logLine(`  ⚠️ Saltato (${err.message})`, 'warn');
    }
  }

  setProgress(100, 'Completato');
}

// ===== Processa un singolo JAR =====
async function processJar(file, isVanilla) {
  const zip = await JSZip.loadAsync(file);

  // Cerca file in assets/*/textures/block/*.png
  const textureFiles = Object.keys(zip.files).filter(path =>
    path.match(/^assets\/[^/]+\/textures\/block\/[^/]+\.png$/) &&
    !zip.files[path].dir
  );

  if (!textureFiles.length) return;

  // Estrai modid dal percorso (assets/<modid>/textures/block/)
  const modids = new Set(textureFiles.map(p => p.split('/')[1]));
  modids.forEach(m => { sourcesFound[m] = (sourcesFound[m] || 0) + 1; });

  for (const texPath of textureFiles) {
    // ID = modid:block_name  (es. minecraft:stone, create:brass_block)
    const parts   = texPath.split('/');
    const modid   = parts[1];
    const rawName = parts[parts.length - 1].replace(/\.png$/, '');
    const fullId  = modid + ':' + rawName;

    // Skip duplicati (il primo trovato vince — vanilla ha priorità per ordine)
    if (palette[fullId]) continue;

    try {
      const blob    = await zip.files[texPath].async('blob');
      const dataUrl = await blobToDataUrl(blob);
      const color   = await colorFromDataUrl(dataUrl);

      palette[fullId] = {
        id:         fullId,
        shortId:    rawName,
        modid,
        hex:        color.hex,
        lab:        color.lab,
        dataUrl,
        chiselable: isChiselable(rawName),
        isVanilla,
      };

      // Aggiorna UI ogni 20 texture per non bloccare il thread
      if (Object.keys(palette).length % 20 === 0) {
        renderNewCards();
        await sleep(0);
      }
    } catch (_) {
      // Texture corrotta o incompatibile — skip silenzioso
    }
  }

  // Flush finale per questo jar
  renderNewCards();
  await sleep(0);
}

// ===== Rendering card incrementale =====
const renderedIds = new Set();

function renderNewCards() {
  for (const block of Object.values(palette)) {
    if (renderedIds.has(block.id)) continue;
    renderedIds.add(block.id);
    appendCard(block);
  }
  updateToolbar();
}

function appendCard(block) {
  const card = document.createElement('div');
  card.className = 'pb-card' + (block.chiselable ? '' : ' pb-card--notchisel');
  card.id = 'pbcard-' + CSS.escape(block.id);
  card.dataset.id = block.id;
  card.dataset.modid = block.modid;
  card.dataset.chiselable = block.chiselable ? '1' : '0';
  card.dataset.vanilla = block.isVanilla ? '1' : '0';

  card.innerHTML = `
    <div class="pb-card-img">
      <img src="${block.dataUrl}" alt="${block.id}" loading="lazy">
    </div>
    <div class="pb-card-body">
      <div class="pb-card-id" title="${block.id}">${block.shortId}</div>
      <div class="pb-card-modid">${block.modid}</div>
      <div class="pb-card-color">
        <div class="pb-swatch" style="background:${block.hex}"></div>
        <code>${block.hex}</code>
      </div>
      <div class="pb-card-tags">
        ${block.chiselable
          ? '<span class="tag tag--ok">chisel-able</span>'
          : '<span class="tag tag--no">non chisel-able</span>'}
        ${block.isVanilla ? '<span class="tag tag--vanilla">vanilla</span>' : ''}
      </div>
    </div>
  `;

  textureGrid.appendChild(card);
}

function updateToolbar() {
  const total = Object.keys(palette).length;
  pbCount.textContent = total.toLocaleString('it') + ' texture trovate';

  const srcList = Object.entries(sourcesFound)
    .sort((a,b) => b[1]-a[1])
    .slice(0, 6)
    .map(([id, n]) => `<span class="src-chip">${id} <em>${n}</em></span>`)
    .join('');
  pbSources.innerHTML = srcList;
}

// ===== Filtri =====
pbSearch.addEventListener('input', applyFilters);
chkChiselable.addEventListener('change', applyFilters);
chkVanillaOnly.addEventListener('change', applyFilters);

function applyFilters() {
  const q     = pbSearch.value.toLowerCase().trim();
  const onlyC = chkChiselable.checked;
  const onlyV = chkVanillaOnly.checked;

  document.querySelectorAll('.pb-card').forEach(card => {
    const id      = card.dataset.id.toLowerCase();
    const chisel  = card.dataset.chiselable === '1';
    const vanilla = card.dataset.vanilla === '1';
    const matchQ  = !q || id.includes(q);
    const matchC  = !onlyC || chisel;
    const matchV  = !onlyV || vanilla;
    card.style.display = matchQ && matchC && matchV ? '' : 'none';
  });
}

// ===== Finalize =====
function finalize() {
  secProgress.style.display = 'none';
  secResults.style.display = 'block';
  renderNewCards();
  updateToolbar();
}

// ===== Reset =====
btnReset.addEventListener('click', () => {
  palette = {};
  sourcesFound = {};
  renderedIds.clear();
  textureGrid.innerHTML = '';
  folderInput.value = '';
  secPick.style.display = 'block';
  secProgress.style.display = 'none';
  secResults.style.display = 'none';
});

// ===== Export =====
btnExport.addEventListener('click', () => {
  const blocks = Object.values(palette).map(b => ({
    id:         b.id,
    shortId:    b.shortId,
    modid:      b.modid,
    hex:        b.hex,
    lab:        { L: +b.lab.L.toFixed(2), a: +b.lab.a.toFixed(2), b: +b.lab.b.toFixed(2) },
    chiselable: b.chiselable,
    isVanilla:  b.isVanilla,
  }));

  const json = JSON.stringify({ version: 2, generated: new Date().toISOString(), blocks }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'palette.json'; a.click();
  URL.revokeObjectURL(url);
});

// ===== Utils =====
function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

function colorFromDataUrl(dataUrl) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { const d = imageToData(img, offscreenCanvas); res(averageColor(d)); };
    img.onerror = rej;
    img.src = dataUrl;
  });
}

function setProgress(pct, msg) {
  progressBar.style.width = pct + '%';
  progressStatus.textContent = msg;
}

function logLine(msg, type) {
  const div = document.createElement('div');
  div.className = 'log-line' + (type ? ' log-line--' + type : '');
  div.textContent = msg;
  progressLog.appendChild(div);
  progressLog.scrollTop = progressLog.scrollHeight;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
