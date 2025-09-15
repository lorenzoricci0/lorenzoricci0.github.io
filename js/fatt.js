document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('numero');
  const btn = document.getElementById('btn-scomponi');
  const output = document.getElementById('risultato');

  if (!input || !btn || !output) {
    console.error('missing element: check ids in index.html');
    return;
  }

  function scomponi() {
    const valore = input.value.trim();
    const n0 = parseInt(valore, 10);

    if (!valore || isNaN(n0) || n0 < 2) {
      output.textContent = 'insert whole number greater than 1';
      return;
    }

    let n = n0;
    const fattori = [];
    let divisore = 2;

    while (n > 1) {
      if (n % divisore === 0) {
        fattori.push(divisore);
        n = n / divisore;
      } else {
        divisore++;
      }
      // Nota: per numeri enormi JavaScript può perdere precisione (Number limit).
    }

    output.textContent = `${n0} = ${fattori.join(' × ')}`;
    console.log('risultato:', output.textContent);
  }

  btn.addEventListener('click', scomponi);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') scomponi();
  });
});
