(() => {
  'use strict';

  /* ---------- formattazione numeri ---------- */
  const fmt = (n, dec = 2) => Number(n).toLocaleString('it-IT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: dec
  });

  /* ---------- menu mobile ---------- */
  const navToggle = document.getElementById('navToggle');
  const navLinks  = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
    navLinks.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        navLinks.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ==========================================================
     CONVERTITORE — 1 Oro = 100 Argenti = 10.000 Bronzi
     ========================================================== */
  const convInput  = document.getElementById('convInput');
  const convUnit   = document.getElementById('convUnit');
  const resOro     = document.getElementById('resOro');
  const resArgento = document.getElementById('resArgento');
  const resBronzo  = document.getElementById('resBronzo');

  function updateConverter() {
    const raw = parseFloat(convInput.value);
    const value = Number.isFinite(raw) ? raw : 0;
    let bronzi;
    switch (convUnit.value) {
      case 'oro':     bronzi = value * 10000; break;
      case 'argento': bronzi = value * 100;   break;
      default:        bronzi = value;         break;
    }
    resOro.textContent     = fmt(bronzi / 10000);
    resArgento.textContent = fmt(bronzi / 100);
    resBronzo.textContent  = fmt(bronzi);
  }

  if (convInput && convUnit) {
    convInput.addEventListener('input', updateConverter);
    convUnit.addEventListener('change', updateConverter);
    updateConverter();
  }

  /* ==========================================================
     CONTO RISPARMIO — 1% settimanale composto
     + mini-chart SVG + milestone table
     ========================================================== */
  const savePrincipal = document.getElementById('savePrincipal');
  const saveWeeks     = document.getElementById('saveWeeks');
  const saveWeeksVal  = document.getElementById('saveWeeksVal');
  const saveResult    = document.getElementById('saveResult');
  const saveGain      = document.getElementById('saveGain');
  const savingsChart  = document.getElementById('savingsChart');

  const MILESTONE_WEEKS = [4, 12, 26, 52];

  function drawSavingsChart(principal, weeks) {
    if (!savingsChart) return;
    const W = 380, H = 90, PAD = { t: 8, r: 8, b: 18, l: 8 };
    const iW = W - PAD.l - PAD.r, iH = H - PAD.t - PAD.b;
    const maxW = 52;
    const maxVal = principal * Math.pow(1.01, maxW);
    const minVal = principal;
    const range = maxVal - minVal || 1;

    const toX = w => PAD.l + (w / maxW) * iW;
    const toY = v => PAD.t + iH - ((v - minVal) / range) * iH;

    // sample every 2 weeks for performance
    const pts = [];
    for (let w = 0; w <= maxW; w += 1) {
      pts.push([toX(w), toY(principal * Math.pow(1.01, w))]);
    }

    const poly = pts.map(p => p.join(',')).join(' ');
    const area = `${poly} ${toX(maxW)},${toY(minVal)} ${toX(0)},${toY(minVal)}`;

    const cx = toX(weeks);
    const cy = toY(principal * Math.pow(1.01, weeks));

    savingsChart.setAttribute('viewBox', `0 0 ${W} ${H}`);
    savingsChart.innerHTML = `
      <polygon class="chart-area" points="${area}"/>
      <polyline class="chart-line" points="${poly}"/>
      <line class="chart-axis" x1="${PAD.l}" y1="${PAD.t+iH}" x2="${PAD.l+iW}" y2="${PAD.t+iH}"/>
      <text class="chart-tick" x="${PAD.l}" y="${H-2}">0</text>
      <text class="chart-tick" x="${toX(13)}" y="${H-2}">13 sett.</text>
      <text class="chart-tick" x="${toX(26)}" y="${H-2}">26</text>
      <text class="chart-tick" x="${toX(52)-4}" y="${H-2}" text-anchor="end">52</text>
      <circle class="chart-dot-current" cx="${cx}" cy="${cy}" r="4"/>
    `;
  }

  function updateMilestones(principal) {
    const container = document.getElementById('savingsMilestones');
    if (!container) return;
    const weeks = saveWeeks ? parseInt(saveWeeks.value, 10) : 0;
    container.innerHTML = MILESTONE_WEEKS.map(w => {
      const val = principal * Math.pow(1.01, w);
      const isCurrent = w === weeks;
      return `<div class="savings-milestone${isCurrent ? ' ms-current' : ''}">
        <span class="ms-week">Settimana ${w}</span>
        <span class="ms-val">${fmt(val)} Oro</span>
      </div>`;
    }).join('');
  }

  function updateSavings() {
    const rawP = parseFloat(savePrincipal.value);
    const principal = Number.isFinite(rawP) && rawP >= 0 ? rawP : 0;
    const weeks = parseInt(saveWeeks.value, 10) || 0;
    const total = principal * Math.pow(1.01, weeks);
    const gain  = total - principal;

    saveWeeksVal.textContent = weeks;
    saveResult.textContent   = fmt(total);
    saveGain.textContent     = `+${fmt(gain)}`;

    drawSavingsChart(principal, weeks);
    updateMilestones(principal);
  }

  if (savePrincipal && saveWeeks) {
    savePrincipal.addEventListener('input', updateSavings);
    saveWeeks.addEventListener('input', updateSavings);
    updateSavings();
  }

  /* ==========================================================
     SIMULATORE INVESTIMENTO — durata fissa
     + barre visuali comparative
     ========================================================== */
  const RATES = { 7: 0.10, 14: 0.20, 21: 0.35, 28: 0.50 };
  const DURATION_ORDER = [7, 14, 21, 28];

  const investAmount  = document.getElementById('investAmount');
  const durationPicker = document.getElementById('durationPicker');
  const investProfit  = document.getElementById('investProfit');
  const investTotal   = document.getElementById('investTotal');
  const investVisual  = document.getElementById('investVisual');
  let selectedDuration = 28;

  function updateInvestBars(amount) {
    if (!investVisual) return;
    DURATION_ORDER.forEach(days => {
      const col    = investVisual.querySelector(`[data-days="${days}"]`);
      if (!col) return;
      const profit    = amount * RATES[days];
      const profitEl  = col.querySelector('.invest-opt-profit');
      if (profitEl) profitEl.textContent = amount > 0 ? `+${fmt(profit, 2)} Oro` : '—';
      col.classList.toggle('is-active', days === selectedDuration);
    });
  }

  function updateInvestment() {
    const rawA = parseFloat(investAmount.value);
    const amount = Number.isFinite(rawA) && rawA >= 0 ? rawA : 0;
    const rate   = RATES[selectedDuration];
    const profit = amount * rate;
    const total  = amount + profit;

    investProfit.textContent = `+${fmt(profit)}`;
    investTotal.textContent  = fmt(total);
    updateInvestBars(amount);
  }

  if (durationPicker) {
    durationPicker.addEventListener('click', e => {
      const btn = e.target.closest('.duration-btn');
      if (!btn) return;
      durationPicker.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      selectedDuration = parseInt(btn.dataset.days, 10);
      updateInvestment();
    });
  }

  if (investVisual) {
    investVisual.addEventListener('click', e => {
      const col = e.target.closest('[data-days]');
      if (!col) return;
      selectedDuration = parseInt(col.dataset.days, 10);
      if (durationPicker) {
        durationPicker.querySelectorAll('.duration-btn').forEach(b => {
          b.classList.toggle('is-active', parseInt(b.dataset.days, 10) === selectedDuration);
        });
      }
      updateInvestment();
    });
  }

  if (investAmount) {
    investAmount.addEventListener('input', updateInvestment);
    updateInvestment();
  }

  /* ==========================================================
     CALCOLATORE PRESTITO
     ========================================================== */
  const loanAmount   = document.getElementById('loanAmount');
  const loanRate     = document.getElementById('loanRate');
  const loanRateVal  = document.getElementById('loanRateVal');
  const loanWeeks    = document.getElementById('loanWeeks');
  const loanWeeksVal = document.getElementById('loanWeeksVal');
  const loanInterest = document.getElementById('loanInterest');
  const loanTotal    = document.getElementById('loanTotal');
  const loanWeekly   = document.getElementById('loanWeekly');

  function updateLoan() {
    const rawA = parseFloat(loanAmount.value);
    const amount = Number.isFinite(rawA) && rawA >= 0 ? rawA : 0;
    const rate   = parseFloat(loanRate.value) / 100 || 0;
    const weeks  = parseInt(loanWeeks.value, 10) || 1;

    const interest = amount * rate * weeks;
    const total    = amount + interest;
    const weekly   = total / weeks;

    if (loanRateVal)  loanRateVal.textContent  = `${loanRate.value}%`;
    if (loanWeeksVal) loanWeeksVal.textContent  = weeks;
    if (loanInterest) loanInterest.textContent  = `+${fmt(interest)}`;
    if (loanTotal)    loanTotal.textContent     = fmt(total);
    if (loanWeekly)   loanWeekly.textContent    = fmt(weekly);
  }

  if (loanAmount && loanRate && loanWeeks) {
    loanAmount.addEventListener('input', updateLoan);
    loanRate.addEventListener('input', updateLoan);
    loanWeeks.addEventListener('input', updateLoan);
    updateLoan();
  }

  /* ==========================================================
     CICLO ECONOMICO — nodi cliccabili
     ========================================================== */
  const cycleSteps = [
    {
      title: 'Cittadini',
      desc: 'I cittadini di Eloria producono, commerciano e custodiscono il denaro che anima l\'economia del regno.'
    },
    {
      title: 'Depositi',
      desc: 'Affidando il proprio denaro al Grande Credito, i cittadini lo mettono al sicuro e lo fanno fruttare.'
    },
    {
      title: 'Il Grande Credito',
      desc: 'La banca raccoglie i depositi, li custodisce e li rende produttivi, mantenendo riserve sufficienti a ogni richiesta.'
    },
    {
      title: 'Crediti & Investimenti',
      desc: 'Parte del capitale viene concessa in prestito o investita, generando movimento nell\'economia del regno.'
    },
    {
      title: 'Attività Economiche',
      desc: 'Botteghe, costruzioni e spedizioni commerciali nascono e crescono grazie al capitale messo in circolo.'
    },
    {
      title: 'Profitti',
      desc: 'Le attività finanziate generano ricchezza — per i loro artefici, per i creditori, per il regno intero.'
    },
    {
      title: 'Rimborso',
      desc: 'Prestiti e investimenti tornano alla banca con interesse, pronti a compiere un nuovo giro del ciclo.'
    }
  ];

  const cycleNodes = document.querySelectorAll('.cycle-node');
  const cycleTitle = document.getElementById('cycleTitle');
  const cycleDesc  = document.getElementById('cycleDesc');
  let cycleTimer   = null;

  function setActiveStep(index) {
    cycleNodes.forEach(n => n.classList.remove('is-active'));
    const node = document.querySelector(`.cycle-node[data-step="${index}"]`);
    if (node) node.classList.add('is-active');
    if (cycleTitle && cycleSteps[index]) cycleTitle.textContent = cycleSteps[index].title;
    if (cycleDesc  && cycleSteps[index]) cycleDesc.textContent  = cycleSteps[index].desc;
  }

  if (cycleNodes.length) {
    let i = 0;
    setActiveStep(0);
    cycleTimer = setInterval(() => {
      i = (i + 1) % cycleSteps.length;
      setActiveStep(i);
    }, 3200);

    cycleNodes.forEach(node => {
      node.addEventListener('click', () => {
        if (cycleTimer) { clearInterval(cycleTimer); cycleTimer = null; }
        setActiveStep(parseInt(node.dataset.step, 10));
      });
      node.setAttribute('tabindex', '0');
      node.setAttribute('role', 'button');
      node.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); node.click(); }
      });
    });
  }
})();
