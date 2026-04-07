/**
 * Визуальные блоки в стиле отчёта Ростех (копия логики/текстов).
 * НЕ импортирует файлы из themes/rostech — дубликат для default PDF.
 */

function esc(v) {
    if (v == null) return '';
    return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function money(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return `${Math.round(n).toLocaleString('ru-RU')} руб.`;
}

function pickPositive(primary, fallback) {
    const p = Number(primary);
    if (Number.isFinite(p) && p > 0) return p;
    const f = Number(fallback);
    if (Number.isFinite(f) && f > 0) return f;
    return 0;
}

function isScheduleInitialLumpRow(row) {
    return Boolean(row && String(row.schedule_row_kind || '').toUpperCase() === 'INITIAL_LUMP');
}

function calculateAugNextYearEffectivenessPercent(monthlySchedule) {
    const schedule = Array.isArray(monthlySchedule)
        ? monthlySchedule
              .filter((row) => row && row.date)
              .slice()
              .sort((a, b) => new Date(a.date) - new Date(b.date))
        : [];
    if (!schedule.length) return { percent: null, startYear: null };

    const toDate = (value) => new Date(`${value}T00:00:00Z`);
    const toNum = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    };
    const first = schedule[0];
    const startDate = toDate(first.date);
    const endDate = new Date(Date.UTC(startDate.getUTCFullYear() + 1, 7, 1));
    const rows = schedule.filter((row) => toDate(row.date) <= endDate);
    if (!rows.length) return { percent: null, startYear: startDate.getUTCFullYear() };

    const monthsBetween = (from, to) =>
        (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
    const totalMonths = Math.max(monthsBetween(startDate, endDate) + 1, 1);

    const k0 =
        toNum(first.total_capital) -
        toNum(first.replenishment) -
        toNum(first.tax_deduction) -
        toNum(first.cofinancing);
    const kEnd = toNum(rows[rows.length - 1].total_capital);
    const replenishmentSum = rows.reduce((sum, row) => sum + toNum(row.replenishment), 0);
    const taxSum = rows.reduce((sum, row) => sum + toNum(row.tax_deduction), 0);
    const cofinancingSum = rows.reduce((sum, row) => sum + toNum(row.cofinancing), 0);
    const investmentIncome = kEnd - k0 - replenishmentSum - taxSum - cofinancingSum;

    const weightedReplenishments = rows.reduce((sum, row) => {
        const monthsLeft = Math.max(monthsBetween(toDate(row.date), endDate) + 1, 0);
        return sum + toNum(row.replenishment) * (monthsLeft / totalMonths);
    }, 0);
    const avgBase = k0 + weightedReplenishments;
    if (!(avgBase > 0)) return { percent: null, startYear: startDate.getUTCFullYear() };

    const totalEffectiveness = (investmentIncome + taxSum + cofinancingSum) / avgBase;
    return {
        percent: totalEffectiveness * 100,
        startYear: startDate.getUTCFullYear(),
    };
}

function extractPensionPlanFacts(monthlySchedule, fallback = {}) {
    const schedule = Array.isArray(monthlySchedule)
        ? monthlySchedule
              .filter((row) => row && row.date)
              .slice()
              .sort((a, b) => new Date(a.date) - new Date(b.date))
        : [];
    const toNum = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    };

    const first = schedule[0] || null;
    let initialFromSchedule = NaN;
    if (first && isScheduleInitialLumpRow(first)) {
        initialFromSchedule = toNum(first.replenishment);
    } else if (first) {
        initialFromSchedule =
            toNum(first.total_capital) -
            toNum(first.replenishment) -
            toNum(first.tax_deduction) -
            toNum(first.cofinancing);
    }
    const firstRegular = schedule.find((row) => row && row.date && !isScheduleInitialLumpRow(row)) || null;
    const monthlyFromSchedule = firstRegular ? toNum(firstRegular.replenishment) : NaN;

    const firstTaxRow = schedule.find((row) => toNum(row.tax_deduction) > 0) || null;
    const firstCofRow = schedule.find((row) => toNum(row.cofinancing) > 0) || null;
    const taxYear = firstTaxRow ? new Date(`${firstTaxRow.date}T00:00:00Z`).getUTCFullYear() : null;
    const cofinYear = firstCofRow ? new Date(`${firstCofRow.date}T00:00:00Z`).getUTCFullYear() : null;

    return {
        initialCapital: Number.isFinite(initialFromSchedule)
            ? initialFromSchedule
            : toNum(fallback.initialCapital),
        monthlyContribution: Number.isFinite(monthlyFromSchedule)
            ? monthlyFromSchedule
            : toNum(fallback.monthlyContribution),
        taxDeductionAmount: firstTaxRow ? toNum(firstTaxRow.tax_deduction) : toNum(fallback.taxDeductionAmount),
        taxDeductionYear: taxYear || fallback.taxDeductionYear || null,
        cofinancingAmount: firstCofRow ? toNum(firstCofRow.cofinancing) : toNum(fallback.cofinancingAmount),
        cofinancingYear: cofinYear || fallback.cofinancingYear || null,
    };
}

function calculateOwnFundsFromSchedule(monthlySchedule, fallbackOwnFunds = 0) {
    const schedule = Array.isArray(monthlySchedule)
        ? monthlySchedule
              .filter((row) => row && row.date)
              .slice()
              .sort((a, b) => new Date(a.date) - new Date(b.date))
        : [];
    if (!schedule.length) return Number(fallbackOwnFunds) || 0;

    const toNum = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    };
    const first = schedule[0];
    const initialFromSchedule =
        toNum(first.total_capital) -
        toNum(first.replenishment) -
        toNum(first.tax_deduction) -
        toNum(first.cofinancing);
    const replenishmentSum = schedule.reduce((sum, row) => sum + toNum(row.replenishment), 0);
    return Math.max(initialFromSchedule + replenishmentSum, 0);
}

/** Как в buildRostechInvestmentPagesHtml */
const DISCLAIMER_SHORT =
    'Финансовый план не является коммерческим предложением или договором,\nносит исключительно информационный характер.';

const SCHEDULE_INTRO =
    'Это Ваш график достижения целей. Обратите внимание, что в реальности цифры будут отличаться от тех, что Вы видите в таблице. Точно посчитать будущее очень и очень сложно. Но если составлять финансовый план хотя бы раз в год и корректировать его с учетом новых данных по доходностям, инфляции, стоимости цели, то достижение целей становится гораздо более вероятным!';

/**
 * Площадной график в цветах как на макете Ростех (синяя линия, зелёная цель).
 * data — тот же формат, что у buildProjectionSeries в buildGoalPagesHtml.
 */
function buildRostechLikeAreaChartSvg(data, options = {}) {
    const width = options.width ?? 520;
    const height = options.height ?? 150;
    const paddingLeft = 40;
    const paddingRight = 18;
    const paddingTop = 16;
    const paddingBottom = 32;
    const accentColor = '#5B7FFF';
    const targetColor = '#00B074';
    const gridColor = 'rgba(148,163,184,0.45)';
    const labelColor = '#475569';
    const axisUnitColor = '#64748b';
    const gid = `rostFill_${Math.random().toString(36).slice(2, 11)}`;

    if (!Array.isArray(data) || data.length < 2) {
        return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#94a3b8" font-size="11">Нет данных для графика</text></svg>`;
    }

    const maxY = Math.max(...data.map((d) => Number(d.value) || 0), 1);
    const minY = 0;
    const x0 = paddingLeft;
    const x1 = width - paddingRight;
    const y0 = paddingTop;
    const y1 = height - paddingBottom;

    const mapX = (i) => {
        const maxIndex = data.length - 1;
        const t = maxIndex === 0 ? 0 : i / maxIndex;
        return x0 + t * (x1 - x0);
    };
    const mapY = (v) => {
        const t = (Number(v) - minY) / (maxY - minY || 1);
        return y1 - t * (y1 - y0);
    };

    const pts = data.map((d, i) => ({ x: mapX(i), y: mapY(d.value) }));
    const areaPath =
        `M ${pts[0].x} ${y1} ` + pts.map((p) => `L ${p.x} ${p.y}`).join(' ') + ` L ${pts[pts.length - 1].x} ${y1} Z`;
    const linePath = `M ${pts.map((p) => `${p.x} ${p.y}`).join(' L ')}`;

    const target = Number(data[0]?.target ?? 0) || 0;
    const targetY = mapY(target);
    const targetPath = `M ${x0} ${targetY} L ${x1} ${targetY}`;

    const gridCount = 4;
    const gridYs = Array.from({ length: gridCount + 1 }).map((_, i) => y0 + ((y1 - y0) * i) / gridCount);
    const grid = gridYs
        .map((gy) => `<line x1="${x0}" y1="${gy}" x2="${x1}" y2="${gy}" stroke="${gridColor}" stroke-width="1" stroke-dasharray="4 4" />`)
        .join('\n');

    const lastMonth = data[data.length - 1]?.month ?? data.length - 1;
    const step = 12;
    const labelY = height - 8;
    const mCandidates = new Set([0]);
    for (let m = 0; m <= lastMonth; m += step) mCandidates.add(m);
    mCandidates.add(lastMonth);
    const startDate = new Date();
    startDate.setDate(1);
    const dateFmt = new Intl.DateTimeFormat('ru-RU', { month: 'short', year: '2-digit' });
    const xLabels = [];
    for (const m of [...mCandidates].sort((a, b) => a - b)) {
        const idx = data.findIndex((d) => d.month === m);
        if (idx < 0) continue;
        const px = pts[idx]?.x;
        if (px == null) continue;
        const d = new Date(startDate);
        d.setMonth(d.getMonth() + m);
        const labelText = dateFmt.format(d).replace(/\s?г\./, '');
        xLabels.push(
            `<text x="${px}" y="${labelY}" text-anchor="middle" fill="${labelColor}" font-size="9">${esc(labelText)}</text>`
        );
    }

    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Прогноз накопления">
  <defs>
    <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.35" />
      <stop offset="100%" stop-color="${accentColor}" stop-opacity="0.04" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="transparent" />
  ${grid}
  <path d="${areaPath}" fill="url(#${gid})" stroke="none" />
  <path d="${linePath}" fill="none" stroke="${accentColor}" stroke-width="2.8" stroke-linecap="round" />
  <path d="${targetPath}" fill="none" stroke="${targetColor}" stroke-width="2" stroke-dasharray="6 4" />
  <text x="${x0}" y="${y0 - 2}" fill="${axisUnitColor}" font-size="10">₽</text>
  <g>${xLabels.join('\n')}</g>
  <g>
    <rect x="${x1 - 128}" y="${y0 - 6}" width="128" height="20" rx="10" fill="rgba(255,255,255,0.95)" stroke="rgba(148,163,184,0.5)" />
    <line x1="${x1 - 114}" y1="${y0 + 4}" x2="${x1 - 96}" y2="${y0 + 4}" stroke="${targetColor}" stroke-width="2.5" stroke-linecap="round" />
    <text x="${x1 - 90}" y="${y0 + 8}" fill="${labelColor}" font-size="9">Цель</text>
  </g>
</svg>`;
}

function buildRostechStyleAchievementBlock(goal, overallPlan) {
    const s = goal?.summary || {};
    const monthly = Number(s.monthly_replenishment ?? 0);
    const initial = Number(s.initial_capital ?? 0);
    const accumulationYieldPercent = Number(s.accumulation_yield_percent ?? 0);
    const totalCapitalEnd = Number(
        s.projected_capital_at_end ?? s.target_amount_future ?? s.projected_capital_at_retirement ?? 0
    );
    const taxBenefitsTotals =
        overallPlan?.tax_benefits?.totals || overallPlan?.summary?.tax_benefits_summary?.totals || {};
    const nextCalendarYear = new Date().getFullYear() + 1;
    const targetMonths = Number(s.target_months ?? s.term_months ?? 0);
    const deduction2026 = pickPositive(s.deduction_2026, taxBenefitsTotals.deduction_2026);
    const planFacts = extractPensionPlanFacts(goal?.details?.monthly_schedule, {
        initialCapital: initial,
        monthlyContribution: monthly,
        taxDeductionAmount: deduction2026,
        taxDeductionYear: nextCalendarYear,
        cofinancingAmount: pickPositive(s.cofinancing_2026, taxBenefitsTotals.cofinancing_2026),
        cofinancingYear: nextCalendarYear,
    });
    const ownFundsFallback = Math.max(initial + monthly * Math.max(targetMonths, 0), 0);
    const ownFundsForPlan = calculateOwnFundsFromSchedule(goal?.details?.monthly_schedule, ownFundsFallback);
    const incomeAndBenefitsForPlan = Math.max(totalCapitalEnd - ownFundsForPlan, 0);
    const totalPlanBase = Math.max(ownFundsForPlan, 1);
    const totalYieldPercent = Math.max((incomeAndBenefitsForPlan / totalPlanBase) * 100, 0);
    const maxPlanBarValue = Math.max(ownFundsForPlan, incomeAndBenefitsForPlan, totalCapitalEnd, 1);
    const ownFundsBarHeight = Math.max(18, Math.round((ownFundsForPlan / maxPlanBarValue) * 78));
    const incomeBarHeightFixed = Math.max(18, Math.round((incomeAndBenefitsForPlan / maxPlanBarValue) * 78));
    const totalBarHeight = Math.max(18, Math.round((totalCapitalEnd / maxPlanBarValue) * 78));
    const yearlyEffectiveness = calculateAugNextYearEffectivenessPercent(goal?.details?.monthly_schedule);
    const highlightedYieldPercent = Number.isFinite(yearlyEffectiveness.percent)
        ? yearlyEffectiveness.percent
        : totalYieldPercent;
    const yieldDisplay =
        Number.isFinite(accumulationYieldPercent) && accumulationYieldPercent > 0
            ? accumulationYieldPercent
            : highlightedYieldPercent;

    if (!Number.isFinite(totalCapitalEnd) || totalCapitalEnd <= 0) {
        return '';
    }

    const yieldStr = yieldDisplay.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

    return `
        <div style="font-size:10px;line-height:1.35;color:#0f172a;margin-top:8px;">
          <b>Предлагаемый план (фрагмент):</b><br/><br/>
          3. Как растёт капитал?<br/>
          <span style="margin-left:0;">• За счёт пополнения, софинансирования, инвестиционного дохода Вы накопите ${esc(money(totalCapitalEnd))}.</span>
        </div>
        <div style="margin-top:8px;font-size:10px;line-height:1.2;color:#0f172a;text-align:center;font-weight:700;">
          График достижения цели
        </div>
        <div style="position:relative;height:118px;margin-top:4px;border-bottom:1px solid #e2e8f0;">
          <div style="position:absolute;left:0;right:0;top:12px;border-top:1px dashed #e2e8f0;"></div>
          <div style="position:absolute;left:0;right:0;top:32px;border-top:1px dashed #e2e8f0;"></div>
          <div style="position:absolute;left:0;right:0;top:52px;border-top:1px dashed #e2e8f0;"></div>
          <div style="position:absolute;left:0;right:0;top:72px;border-top:1px dashed #e2e8f0;"></div>
          <div style="position:absolute;left:0;right:0;top:92px;border-top:1px dashed #e2e8f0;"></div>
          <div style="position:absolute;left:40px;bottom:0;width:88px;height:${ownFundsBarHeight}px;background:#9f9f9f;border-radius:3px 3px 0 0;"></div>
          <div style="position:absolute;left:144px;bottom:0;width:88px;height:${incomeBarHeightFixed}px;background:#000000;border-radius:3px 3px 0 0;"></div>
          <div style="position:absolute;left:248px;bottom:0;width:88px;height:${totalBarHeight}px;background:#722257;border-radius:3px 3px 0 0;"></div>
          <div style="position:absolute;left:40px;bottom:3px;width:88px;text-align:center;font-size:8px;color:#fff;line-height:1.05;">${esc(money(ownFundsForPlan))}</div>
          <div style="position:absolute;left:144px;bottom:3px;width:88px;text-align:center;font-size:8px;color:#fff;line-height:1.05;">${esc(money(incomeAndBenefitsForPlan))}</div>
          <div style="position:absolute;left:248px;bottom:3px;width:88px;text-align:center;font-size:8px;color:#fff;line-height:1.05;">${esc(money(totalCapitalEnd))}</div>
        </div>
        <div style="display:flex;justify-content:center;gap:10px;margin-top:5px;font-size:8px;color:#475569;line-height:1.15;flex-wrap:wrap;">
          <span><span style="display:inline-block;width:7px;height:7px;background:#9f9f9f;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>Собственные средства</span>
          <span><span style="display:inline-block;width:7px;height:7px;background:#000;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>Процентный доход, софинансирование, налоговые вычеты</span>
          <span><span style="display:inline-block;width:7px;height:7px;background:#722257;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>Итого капитал</span>
        </div>
        <div style="margin-top:8px;border:1px solid #8a2d69;border-radius:8px;padding:6px 8px;text-align:center;font-size:13px;line-height:1.15;color:#722257;font-weight:700;">
          Расчетная доходность Вашего плана на весь срок — ${esc(yieldStr)}% годовых
        </div>
        ${planFacts.taxDeductionAmount > 0 || planFacts.cofinancingAmount > 0 ? `<div style="margin-top:6px;font-size:9px;color:#64748b;line-height:1.3;">
          ${planFacts.cofinancingAmount > 0 ? `• Софинансирование (фрагмент плана): ${esc(money(planFacts.cofinancingAmount))}${planFacts.cofinancingYear ? ` (${planFacts.cofinancingYear})` : ''}<br/>` : ''}
          ${planFacts.taxDeductionAmount > 0 ? `• Налоговый вычет (фрагмент): ${esc(money(planFacts.taxDeductionAmount))}${planFacts.taxDeductionYear ? ` (${planFacts.taxDeductionYear})` : ''}` : ''}
        </div>` : ''}
        <div style="margin-top:8px;font-size:9px;line-height:1.35;color:#64748b;">
          ${esc(DISCLAIMER_SHORT).replace(/\n/g, '<br/>')}
        </div>
      `;
}

function formatMonthYearRu(value) {
    if (!value) return '—';
    const d = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return '—';
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${mm}.${yyyy} г.`;
}

/** Внутренний HTML блока таблицы (без оболочки страницы) — копия структуры Ростех */
function buildMonthlyCashflowTableInner({ rows, isFirstPage, avatarSrc }) {
    const tableTop = isFirstPage ? 8 : 8;
    const rowCells = rows
        .map(
            (row) => `
            <div style="display:grid;grid-template-columns:72px 88px 82px 96px 100px;column-gap:12px;align-items:center;">
              <div style="font-size:9px;line-height:18px;color:#0f172a;white-space:nowrap;">${esc(formatMonthYearRu(row.date))}</div>
              <div style="font-size:9px;line-height:18px;color:#0f172a;white-space:nowrap;">${esc(money(row.replenishment || 0))}</div>
              <div style="font-size:9px;line-height:18px;color:#0f172a;white-space:nowrap;">${esc(money(row.tax_deduction || 0))}</div>
              <div style="font-size:9px;line-height:18px;color:#0f172a;white-space:nowrap;">${esc(money(row.cofinancing || 0))}</div>
              <div style="font-size:9px;line-height:18px;color:#0f172a;white-space:nowrap;">${esc(money(row.total_capital || 0))}</div>
            </div>
        `
        )
        .join('');

    return `
      <div style="margin-top:${tableTop}px;">
        <div style="font-size:15px;font-weight:700;line-height:1.2;color:#0f172a;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #5b6cff;">
          График достижения целей${isFirstPage ? '' : ' (продолжение)'}
        </div>
        ${
            isFirstPage
                ? `<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;">
          <div style="width:52px;height:58px;border-radius:8px;overflow:hidden;flex-shrink:0;border:1px solid #e2e8f0;">
            <img src="${esc(avatarSrc)}" alt="" style="width:100%;height:100%;object-fit:cover;" />
          </div>
          <div style="flex:1;padding:8px 10px;border:1px solid #e2e8f0;border-radius:10px;background:rgba(255,255,255,0.96);font-size:10px;line-height:1.35;color:#334155;">
            ${esc(SCHEDULE_INTRO)}
          </div>
        </div>`
                : ''
        }
        <div style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;background:#f8fafc;">
          <div style="padding:10px 12px;background:#f1f5f9;border-bottom:1px solid #e2e8f0;display:grid;grid-template-columns:72px 88px 82px 96px 100px;column-gap:12px;">
            <div style="font-size:9px;font-weight:700;color:#0f172a;">Дата</div>
            <div style="font-size:9px;font-weight:700;color:#0f172a;">Пополнение</div>
            <div style="font-size:9px;font-weight:700;color:#0f172a;">Налоговый вычет</div>
            <div style="font-size:9px;font-weight:700;color:#0f172a;">Софинансирование</div>
            <div style="font-size:9px;font-weight:700;color:#0f172a;">Итоговый капитал</div>
          </div>
          <div style="padding:8px 12px;display:flex;flex-direction:column;gap:0;">
            ${rowCells}
          </div>
        </div>
        <div style="margin-top:10px;font-size:9px;line-height:1.35;color:#64748b;">
          ${esc(DISCLAIMER_SHORT).replace(/\n/g, '<br/>')}
        </div>
      </div>
    `;
}

function getMonthlyScheduleChunks(goal) {
    const scheduleRows = Array.isArray(goal?.details?.monthly_schedule)
        ? goal.details.monthly_schedule
              .filter((row) => row && row.date)
              .slice()
              .sort((a, b) => new Date(a.date) - new Date(b.date))
        : [];
    const firstPageRows = 22;
    const nextPageRows = 28;
    const chunks = [];
    if (scheduleRows.length) {
        chunks.push(scheduleRows.slice(0, firstPageRows));
        let offset = firstPageRows;
        while (offset < scheduleRows.length) {
            chunks.push(scheduleRows.slice(offset, offset + nextPageRows));
            offset += nextPageRows;
        }
    }
    return { scheduleRows, chunks };
}

function getMonthlyScheduleChunksFromRows(scheduleRows) {
    const rows = Array.isArray(scheduleRows)
        ? scheduleRows
              .filter((row) => row && row.date)
              .slice()
              .sort((a, b) => new Date(a.date) - new Date(b.date))
        : [];
    const firstPageRows = 22;
    const nextPageRows = 28;
    const chunks = [];
    if (rows.length) {
        chunks.push(rows.slice(0, firstPageRows));
        let offset = firstPageRows;
        while (offset < rows.length) {
            chunks.push(rows.slice(offset, offset + nextPageRows));
            offset += nextPageRows;
        }
    }
    return { scheduleRows: rows, chunks };
}

function buildAggregatedMonthlyScheduleByGoals(goals) {
    const list = Array.isArray(goals) ? goals : [];
    const byMonth = new Map();
    const toNum = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    };

    for (const goal of list) {
        const rows = Array.isArray(goal?.details?.monthly_schedule)
            ? goal.details.monthly_schedule
            : [];
        for (const row of rows) {
            if (!row?.date) continue;
            const key = String(row.date);
            if (!byMonth.has(key)) {
                byMonth.set(key, {
                    date: key,
                    replenishment: 0,
                    tax_deduction: 0,
                    cofinancing: 0,
                    total_capital: 0,
                });
            }
            const agg = byMonth.get(key);
            agg.replenishment += toNum(row.replenishment);
            agg.tax_deduction += toNum(row.tax_deduction);
            agg.cofinancing += toNum(row.cofinancing);
            agg.total_capital += toNum(row.total_capital);
        }
    }

    return [...byMonth.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
}

module.exports = {
    buildRostechLikeAreaChartSvg,
    buildRostechStyleAchievementBlock,
    buildMonthlyCashflowTableInner,
    getMonthlyScheduleChunks,
    getMonthlyScheduleChunksFromRows,
    buildAggregatedMonthlyScheduleByGoals,
    DISCLAIMER_SHORT,
    SCHEDULE_INTRO,
};
