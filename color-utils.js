// ===== Color Utils =====

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
  return { L: 116 * f(y) - 16, a: 500 * (f(x) - f(y)), b: 200 * (f(y) - f(z)) };
}

function rgbToLab(r, g, b) {
  return xyzToLab(...Object.values(rgbToXyz(r, g, b)));
}

function labDistance(a, b) {
  return Math.sqrt((a.L-b.L)**2 + (a.a-b.a)**2 + (a.b-b.b)**2);
}

function rgbToHex(r, g, b) {
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

function hexToRgb(hex) {
  const c = hex.replace('#','');
  return { r: parseInt(c.slice(0,2),16), g: parseInt(c.slice(2,4),16), b: parseInt(c.slice(4,6),16) };
}

function averageColor(imageData) {
  const d = imageData.data;
  let rS=0,gS=0,bS=0,n=0;
  for (let i=0;i<d.length;i+=4) {
    if (d[i+3]<128) continue;
    rS+=d[i]; gS+=d[i+1]; bS+=d[i+2]; n++;
  }
  if (!n) return { r:128,g:128,b:128,hex:'#808080',lab:rgbToLab(128,128,128) };
  const r=Math.round(rS/n), g=Math.round(gS/n), b=Math.round(bS/n);
  return { r, g, b, hex:rgbToHex(r,g,b), lab:rgbToLab(r,g,b) };
}

function imageToData(img, canvas) {
  canvas.width=16; canvas.height=16;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,16,16);
  ctx.drawImage(img,0,0,16,16);
  return ctx.getImageData(0,0,16,16);
}

function extractTextureColor(base64, canvas) {
  return new Promise((res,rej) => {
    const img=new Image();
    img.onload=()=>res(averageColor(imageToData(img,canvas)));
    img.onerror=rej;
    img.src=base64.startsWith('data:') ? base64 : 'data:image/png;base64,'+base64;
  });
}

function findClosestBlocks(targetLab, palette, n=4) {
  return palette
    .map(b => ({...b, dist: labDistance(targetLab, b.lab)}))
    .sort((a,b) => a.dist-b.dist)
    .slice(0,n);
}

// ===== Vec3 / Matrix helpers =====
function vec3(x,y,z){ return {x,y,z}; }
function vadd(a,b){ return {x:a.x+b.x, y:a.y+b.y, z:a.z+b.z}; }
function vsub(a,b){ return {x:a.x-b.x, y:a.y-b.y, z:a.z-b.z}; }
function vscale(v,s){ return {x:v.x*s, y:v.y*s, z:v.z*s}; }
function vdot(a,b){ return a.x*b.x + a.y*b.y + a.z*b.z; }

// Rotation matrix around axis (normalized) by angle degrees
function rotMatrix(axis, deg) {
  const r = deg * Math.PI / 180;
  const c = Math.cos(r), s = Math.sin(r), t = 1-c;
  const {x,y,z} = axis;
  return [
    [t*x*x+c,   t*x*y-s*z, t*x*z+s*y],
    [t*x*y+s*z, t*y*y+c,   t*y*z-s*x],
    [t*x*z-s*y, t*y*z+s*x, t*z*z+c  ],
  ];
}

function matVec(m, v) {
  return {
    x: m[0][0]*v.x + m[0][1]*v.y + m[0][2]*v.z,
    y: m[1][0]*v.x + m[1][1]*v.y + m[1][2]*v.z,
    z: m[2][0]*v.x + m[2][1]*v.y + m[2][2]*v.z,
  };
}

// ===== OBB point-in test =====
// Given a point p, OBB center, half-extents he, and rotation matrix R:
// transform p to OBB local space and check against he
function pointInOBB(p, center, he, R) {
  const local = matVec(R, vsub(p, center));
  return Math.abs(local.x) <= he.x + 1e-6
      && Math.abs(local.y) <= he.y + 1e-6
      && Math.abs(local.z) <= he.z + 1e-6;
}

// Transpose of rotation matrix (= inverse for orthogonal matrices)
function matTranspose(m) {
  return [[m[0][0],m[1][0],m[2][0]],[m[0][1],m[1][1],m[2][1]],[m[0][2],m[1][2],m[2][2]]];
}

// ===== UV sampling =====
// Sample pixel at (u,v) in [0,1]^2 from a loaded HTMLImageElement
// using an offscreen canvas. Returns {r,g,b,hex,lab}.
const _uvCanvas = document.createElement('canvas');
const _uvCtx = _uvCanvas.getContext('2d', {willReadFrequently: true});
const _texCache = new Map(); // src → ImageData

function getTexImageData(img) {
  if (_texCache.has(img.src)) return _texCache.get(img.src);
  _uvCanvas.width = img.naturalWidth || 16;
  _uvCanvas.height = img.naturalHeight || 16;
  _uvCtx.clearRect(0,0,_uvCanvas.width,_uvCanvas.height);
  _uvCtx.drawImage(img,0,0);
  const data = _uvCtx.getImageData(0,0,_uvCanvas.width,_uvCanvas.height);
  _texCache.set(img.src, data);
  return data;
}

function sampleUV(img, u, v) {
  const data = getTexImageData(img);
  const W = data.width, H = data.height;
  // clamp, use first 16x16 square of the texture (block textures are square)
  const pu = Math.min(W-1, Math.max(0, Math.floor(u * W)));
  const pv = Math.min(H-1, Math.max(0, Math.floor(v * H)));
  const i = (pv * W + pu) * 4;
  const r = data.data[i], g = data.data[i+1], b = data.data[i+2], a = data.data[i+3];
  if (a < 128) return null; // transparent
  return { r, g, b, hex: rgbToHex(r,g,b), lab: rgbToLab(r,g,b) };
}

// Load an image from a data-URL, return HTMLImageElement
function loadImage(src) {
  return new Promise((res,rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}
