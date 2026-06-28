// ===== Color Utils =====
// Conversioni RGB ↔ LAB (CIE L*a*b*) per distanza percettiva accurata

function rgbToXyz(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  return {
    x: (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047,
    y: (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.00000,
    z: (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883,
  };
}

function xyzToLab(x, y, z) {
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return {
    L: 116 * f(y) - 16,
    a: 500 * (f(x) - f(y)),
    b: 200 * (f(y) - f(z)),
  };
}

function rgbToLab(r, g, b) {
  const xyz = rgbToXyz(r, g, b);
  return xyzToLab(xyz.x, xyz.y, xyz.z);
}

// Distanza CIE76 (abbastanza buona per questo uso)
function labDistance(a, b) {
  return Math.sqrt(
    Math.pow(a.L - b.L, 2) +
    Math.pow(a.a - b.a, 2) +
    Math.pow(a.b - b.b, 2)
  );
}

// Calcola colore medio di un ImageData (ignora pixel trasparenti)
function averageColor(imageData) {
  const d = imageData.data;
  let rSum = 0, gSum = 0, bSum = 0, count = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a < 128) continue; // ignora pixel trasparenti
    rSum += d[i];
    gSum += d[i + 1];
    bSum += d[i + 2];
    count++;
  }
  if (count === 0) return { r: 128, g: 128, b: 128, hex: '#808080', lab: rgbToLab(128, 128, 128) };
  const r = Math.round(rSum / count);
  const g = Math.round(gSum / count);
  const b = Math.round(bSum / count);
  return { r, g, b, hex: rgbToHex(r, g, b), lab: rgbToLab(r, g, b) };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex) {
  const c = hex.replace('#', '');
  return {
    r: parseInt(c.substring(0, 2), 16),
    g: parseInt(c.substring(2, 4), 16),
    b: parseInt(c.substring(4, 6), 16),
  };
}

// Dato un colore LAB e una palette di blocchi [{id, hex, lab}],
// restituisce i top N più vicini
function findClosestBlocks(targetLab, palette, n = 4) {
  return palette
    .map(block => ({ ...block, dist: labDistance(targetLab, block.lab) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, n);
}

// Carica un'immagine e restituisce ImageData tramite canvas offscreen
function imageToData(img, canvas) {
  const size = 16; // ricampiona a 16x16 per velocità
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size);
}

// Legge una texture PNG embedded in base64 dal bbmodel e restituisce colore medio
function extractTextureColor(base64, canvas) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const data = imageToData(img, canvas);
      resolve(averageColor(data));
    };
    img.onerror = reject;
    // base64 può avere o no il prefisso data:
    if (base64.startsWith('data:')) {
      img.src = base64;
    } else {
      img.src = 'data:image/png;base64,' + base64;
    }
  });
}
