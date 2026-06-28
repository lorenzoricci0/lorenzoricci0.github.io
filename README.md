# Chisel & Bits Schematic Viewer v2

Converti modelli Blockbench in schematiche layer per layer per la mod Chisel & Bits.

## File inclusi

- `index.html` — Viewer principale
- `palette-builder.html` — Tool per costruire la palette di blocchi
- `style.css` — Stili condivisi
- `color-utils.js` — Funzioni di conversione colore (RGB → LAB, matching)
- `app.js` — Logica del viewer
- `palette-builder.js` — Logica del palette builder

## Come usare

### 1. Costruisci la palette (una volta sola)

1. Apri `palette-builder.html`
2. Estrai le texture dal tuo modpack:
   - Vai in `.minecraft/resourcepacks/` oppure apri i `.jar` dei mod come ZIP
   - Copia i PNG da `assets/<modid>/textures/block/`
3. Trascina tutti i PNG nel Palette Builder
4. Scarica `palette.json`

> Il nome del file PNG diventa l'ID del blocco (es. `oak_planks.png` → `oak_planks`).
> Puoi caricare centinaia di PNG alla volta.

### 2. Genera la schematica

1. Apri `index.html`
2. Carica il tuo file `.bbmodel`
3. (Opzionale) Carica il `palette.json` per i suggerimenti sui blocchi
4. Imposta quanti blocchi C&B deve occupare il modello sull'asse più lungo
5. Clicca "Genera schematica"
6. Naviga i layer con le frecce o il cursore
7. Clicca un materiale nel pannello per evidenziarlo nel viewer

## Come funziona il matching dei colori

Il tool usa la distanza **CIE L\*a\*b\*** (Delta E) per confrontare colori — molto più accurata
della semplice distanza RGB perché corrisponde meglio alla percezione umana.

Per ogni texture del `.bbmodel` viene calcolato il **colore medio** (campionato a 16×16 px,
ignorando i pixel trasparenti), poi vengono trovati i 4 blocchi più vicini nella palette.

Il numero accanto a ogni blocco suggerito è la distanza LAB: più è bassa, più il colore è simile.

## Pubblicazione

Sono file statici: funzionano con qualsiasi hosting.

- **GitHub Pages**: crea un repo, metti i file nella root o in `/docs`, attiva Pages nelle impostazioni
- **Netlify**: trascina la cartella su app.netlify.com
- **Vercel**: `vercel deploy` oppure import da GitHub

Non serve nessun backend o server Node — tutto gira nel browser.
