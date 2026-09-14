come pubblicare un articolo
============================

metti in questa cartella un file `.md`, per esempio `serie-di-fourier.md`:

```
---
title: le serie di fourier
date: 2026-09-15
---

testo dell'articolo in markdown.

la matematica inline si scrive come $x^2 + y^2 = 1$, quella in blocco come:

$$
\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$
```

fai commit e push su `main`. una github action genera automaticamente
`posts/serie-di-fourier.html` e aggiorna l'elenco in home — non serve
altro.

il nome del file (senza `.md`) diventa l'indirizzo della pagina, quindi
usa nomi semplici, minuscoli, senza spazi o accenti.
