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

// ===== Logica chisel-able =====
// Strategia: escludiamo tutto ciò che SICURAMENTE non è un cubo pieno,
// usando pattern sul nome della texture. È più affidabile di una whitelist
// perché copre anche i mod che seguono le naming convention vanilla.

// Suffissi/pattern che indicano blocchi NON interi (non chisel-able)
const NON_FULL_PATTERNS = [
  // Forme non-cubiche vanilla e comuni nei mod
  '_slab', '_stairs', '_step',
  '_fence', '_fence_gate', '_wall',
  '_door', '_trapdoor',
  '_gate',
  '_rod', '_bar', '_chain',
  '_torch', '_torch_on', '_torch_off',
  '_candle', '_candle_cake',
  '_rail',
  '_lever',
  '_button',
  '_pressure_plate',
  '_carpet',
  '_flower_pot',
  // Piante, vegetazione, flora
  '_sapling', '_leaves', '_bush',
  '_flower', '_tulip', '_orchid', '_allium', '_bluet', '_daisy',
  '_mushroom_block',   // teniamo le top/side textures ma escludiamo stem
  '_mushroom_stem',
  '_fern', '_grass', '_seagrass', '_kelp', '_algae',
  '_vine', '_lily', '_pad',
  '_crop', '_wheat', '_carrot', '_potato', '_beetroot', '_melon_stem', '_pumpkin_stem',
  '_cactus',           // non full cube
  '_bamboo',
  '_sugar_cane',
  '_coral', '_coral_fan', '_coral_block', // i fan non sono cubi
  // Liquidi e gas
  'water', 'lava', 'fire', 'soul_fire',
  '_portal', '_gateway',
  // Entità / speciali
  '_banner', '_sign', '_hanging_sign',
  '_bed',
  '_skull', '_head',
  'shulker_box',
  '_chest',            // non full cube
  '_ender_chest',
  '_barrel',
  '_hopper',
  '_grindstone',
  '_anvil',            // forma non cubica
  '_bell',
  '_lantern',
  '_campfire',
  '_cauldron',
  '_composter',
  '_lectern',
  '_loom',
  '_stonecutter',
  '_cartography',
  '_smithing',
  '_brewing_stand',
  '_conduit',
  '_end_rod',
  '_lightning_rod',
  '_armor_stand',
  '_flower_vase',
  '_pot',
  // Texture di stati / overlay (non sono blocchi, sono layer)
  '_overlay', '_inner', '_outer',
  '_open', '_closed', '_top', '_bottom', '_side', '_front', '_back',
  // Queste sono PARTI di blocchi, non blocchi interi
  '_stem',             // es. melon_stem, mushroom_stem
  '_cross',            // molte piante usano _cross
  '_pane',             // glass pane — non full
  '_bars',
  // Liquidi stilizzati dei mod
  '_flow', '_still', '_flowing',
];

// Nomi esatti da escludere (senza underscore ambigui)
const NON_FULL_EXACT = new Set([
  'glass', 'tinted_glass',
  'ice',                  // può essere chisel-ato ma è trasparente → escludi
  'spawner',
  'barrier', 'bedrock',
  'air', 'cave_air', 'void_air',
  'command_block', 'chain_command_block', 'repeating_command_block',
  'structure_block', 'structure_void', 'jigsaw',
  'moving_piston', 'piston_head',
  'nether_portal', 'end_portal', 'end_gateway',
  'dragon_egg',           // forma non cubica
  'scaffolding',
  'pointed_dripstone',
  'snow',                 // layer, non full
  'powder_snow',
  'turtle_egg',
  'frogspawn',
  'pitcher_pod',
  'torchflower_crop',
]);

// Controlla se una texture (identificata dal suo rawName, cioè il filename senza .png)
// corrisponde a un blocco intero chisel-able.
function isChiselable(rawName) {
  // Match esatto
  if (NON_FULL_EXACT.has(rawName)) return false;

  // Pattern nel nome
  for (const pat of NON_FULL_PATTERNS) {
    if (rawName.includes(pat)) return false;
  }

  // Texture che iniziano con prefissi di blocchi non-cubici comuni nei mod
  if (rawName.startsWith('torch_')) return false;
  if (rawName.startsWith('fire_')) return false;
  if (rawName.startsWith('water_')) return false;
  if (rawName.startsWith('lava_')) return false;

  // Se ha "glass" nel nome (qualsiasi posizione) → trasparente → no
  if (rawName.includes('glass')) return false;

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
  const all = Object.values(palette);
  const total = all.length;
  const chiselCount = all.filter(b => b.chiselable).length;
  const notChisel = total - chiselCount;
  pbCount.innerHTML =
    `<strong>${total.toLocaleString('it')}</strong> texture trovate &nbsp;·&nbsp; ` +
    `<span class="count-ok">✓ ${chiselCount.toLocaleString('it')} chisel-able</span>` +
    (notChisel ? ` &nbsp;·&nbsp; <span class="count-no">${notChisel.toLocaleString('it')} escluse</span>` : '');

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
  const includeAll = document.getElementById('chkIncludeAll').checked;
  const all = Object.values(palette);
  const blocks = all
    .filter(b => includeAll || b.chiselable)
    .map(b => ({
      id:         b.id,
      shortId:    b.shortId,
      modid:      b.modid,
      hex:        b.hex,
      lab:        { L: +b.lab.L.toFixed(2), a: +b.lab.a.toFixed(2), b: +b.lab.b.toFixed(2) },
      chiselable: b.chiselable,
      isVanilla:  b.isVanilla,
    }));

  const skipped = all.length - blocks.length;
  const json = JSON.stringify({ version: 2, generated: new Date().toISOString(), totalBlocks: blocks.length, blocks }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'palette.json'; a.click();
  URL.revokeObjectURL(url);

  const btn = document.getElementById('btnExport');
  const orig = btn.textContent;
  btn.textContent = `✓ ${blocks.length.toLocaleString('it')} blocchi esportati${skipped ? ` (${skipped} non chisel-able esclusi)` : ''}`;
  setTimeout(() => { btn.textContent = orig; }, 3500);
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
