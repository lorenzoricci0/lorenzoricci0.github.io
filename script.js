(() => {
  'use strict';

  /* ---------- utilità di formattazione ---------- */
  const fmt = (n) => Number(n).toLocaleString('it-IT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  /* ---------- menu mobile ---------- */
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
    navLinks.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => {
        navLinks.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ==========================================================
     CONVERTITORE DI VALUTA — 1 Oro = 100 Argenti = 10.000 Bronzi
     ========================================================== */
  const convInput = document.getElementById('convInput');
  const convUnit = document.getElementById('convUnit');
  const resOro = document.getElementById('resOro');
  const resArgento = document.getElementById('resArgento');
  const resBronzo = document.getElementById('resBronzo');

  function updateConverter() {
    const raw = parseFloat(convInput.value);
    const value = Number.isFinite(raw) ? raw : 0;
    let bronzi;
    switch (convUnit.value) {
      case 'oro': bronzi = value * 10000; break;
      case 'argento': bronzi = value * 100; break;
      default: bronzi = value; break; // bronzo
    }
    resOro.textContent = fmt(bronzi / 10000);
    resArgento.textContent = fmt(bronzi / 100);
    resBronzo.textContent = fmt(bronzi);
  }

  if (convInput && convUnit) {
    convInput.addEventListener('input', updateConverter);
    convUnit.addEventListener('change', updateConverter);
    updateConverter();
  }

  /* ==========================================================
     CONTO RISPARMIO — interesse composto 1% settimanale
     C_n = C_0 * (1 + 0.01)^n
     ========================================================== */
  const savePrincipal = document.getElementById('savePrincipal');
  const saveWeeks = document.getElementById('saveWeeks');
  const saveWeeksVal = document.getElementById('saveWeeksVal');
  const saveResult = document.getElementById('saveResult');
  const saveGain = document.getElementById('saveGain');

  function updateSavings() {
    const rawP = parseFloat(savePrincipal.value);
    const principal = Number.isFinite(rawP) && rawP >= 0 ? rawP : 0;
    const weeks = parseInt(saveWeeks.value, 10) || 0;
    const total = principal * Math.pow(1.01, weeks);
    const gain = total - principal;

    saveWeeksVal.textContent = weeks;
    saveResult.textContent = fmt(total);
    saveGain.textContent = `+${fmt(gain)}`;
  }

  if (savePrincipal && saveWeeks) {
    savePrincipal.addEventListener('input', updateSavings);
    saveWeeks.addEventListener('input', updateSavings);
    updateSavings();
  }

  /* ==========================================================
     SIMULATORE D'INVESTIMENTO — durata fissa, rendimento fisso
     ========================================================== */
  const RATES = { 7: 0.10, 14: 0.20, 21: 0.35, 28: 0.50 };
  const investAmount = document.getElementById('investAmount');
  const durationPicker = document.getElementById('durationPicker');
  const investProfit = document.getElementById('investProfit');
  const investTotal = document.getElementById('investTotal');
  let selectedDuration = 28;

  function updateInvestment() {
    const rawA = parseFloat(investAmount.value);
    const amount = Number.isFinite(rawA) && rawA >= 0 ? rawA : 0;
    const rate = RATES[selectedDuration];
    const profit = amount * rate;
    const total = amount + profit;

    investProfit.textContent = `+${fmt(profit)}`;
    investTotal.textContent = fmt(total);
  }

  if (durationPicker) {
    durationPicker.addEventListener('click', (e) => {
      const btn = e.target.closest('.duration-btn');
      if (!btn) return;
      durationPicker.querySelectorAll('.duration-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      selectedDuration = parseInt(btn.dataset.days, 10);
      updateInvestment();
    });
  }
  if (investAmount) {
    investAmount.addEventListener('input', updateInvestment);
    updateInvestment();
  }

  /* ==========================================================
     CICLO ECONOMICO — nodi cliccabili con descrizione
     ========================================================== */
  const cycleSteps = [
    {
      title: 'Giocatori',
      desc: 'I cittadini di Eloria producono e possiedono il denaro che entra nel sistema economico del regno.'
    },
    {
      title: 'Depositi',
      desc: 'Il denaro lasciato in custodia al Grande Credito, tramite Conto Base o Conto Risparmio.'
    },
    {
      title: 'Banca',
      desc: 'Il Grande Credito raccoglie i depositi e li rende produttivi, mantenendo riserve sufficienti.'
    },
    {
      title: 'Prestiti / Investimenti',
      desc: 'Parte del capitale viene concessa in prestito o investita, generando movimento economico.'
    },
    {
      title: 'Attività economiche',
      desc: 'Negozi, costruzioni e progetti nascono o crescono grazie al capitale messo in circolo.'
    },
    {
      title: 'Profitti',
      desc: 'Le attività finanziate generano profitto, sia per chi le gestisce sia per la banca.'
    },
    {
      title: 'Rimborso',
      desc: 'Prestiti e investimenti tornano alla banca con interesse, pronti per un nuovo giro del ciclo.'
    }
  ];

  const cycleNodes = document.querySelectorAll('.cycle-node');
  const cycleTitle = document.getElementById('cycleTitle');
  const cycleDesc = document.getElementById('cycleDesc');
  let cycleTimer = null;

  function setActiveStep(index) {
    cycleNodes.forEach((n) => n.classList.remove('is-active'));
    const node = document.querySelector(`.cycle-node[data-step="${index}"]`);
    if (node) node.classList.add('is-active');
    if (cycleTitle && cycleDesc && cycleSteps[index]) {
      cycleTitle.textContent = cycleSteps[index].title;
      cycleDesc.textContent = cycleSteps[index].desc;
    }
  }

  function startCycleAutoplay() {
    let i = 0;
    setActiveStep(0);
    cycleTimer = setInterval(() => {
      i = (i + 1) % cycleSteps.length;
      setActiveStep(i);
    }, 3200);
  }

  if (cycleNodes.length) {
    cycleNodes.forEach((node) => {
      node.addEventListener('click', () => {
        if (cycleTimer) { clearInterval(cycleTimer); cycleTimer = null; }
        setActiveStep(parseInt(node.dataset.step, 10));
      });
      node.setAttribute('tabindex', '0');
      node.setAttribute('role', 'button');
      node.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          node.click();
        }
      });
    });
    startCycleAutoplay();
  }
})();
