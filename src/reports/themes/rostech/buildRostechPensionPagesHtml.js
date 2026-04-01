const path = require('path');
const { resolveGoalCardImageSrc } = require('../../summary/buildSummaryOverviewHtml');
const { resolveReportRasterRef } = require('../../../utils/reportRasterSrc');

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
    return `${Math.round(n).toLocaleString('ru-RU')} ₽`;
}

function moneyPerMonth(v) {
    const m = money(v);
    return m === '—' ? m : `${m}/мес.`;
}

function moneyWithPrecision(v, digits = 2) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return `${n.toLocaleString('ru-RU', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    })} ₽`;
}

function pickPositive(primary, fallback) {
    const p = Number(primary);
    if (Number.isFinite(p) && p > 0) return p;
    const f = Number(fallback);
    if (Number.isFinite(f) && f > 0) return f;
    return 0;
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
    const endDate = new Date(Date.UTC(startDate.getUTCFullYear() + 1, 7, 1)); // 1 August of next year
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
    const initialFromSchedule = first
        ? toNum(first.total_capital) -
          toNum(first.replenishment) -
          toNum(first.tax_deduction) -
          toNum(first.cofinancing)
        : NaN;
    const monthlyFromSchedule = first ? toNum(first.replenishment) : NaN;

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

function formatMonthYearRu(value) {
    if (!value) return '—';
    const d = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return '—';
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${mm}.${yyyy} г.`;
}

function buildMonthlyPlanBodyHtml({ rows, isFirstPage, avatarSrc }) {
    const tableTop = isFirstPage ? 210 : 80;
    const tableHeight = isFirstPage ? 510 : 640;
    const rowCells = rows
        .map(
            (row) => `
            <div style="display:grid;grid-template-columns:78px 96px 90px 104px 109px;column-gap:16px;align-items:center;">
              <div style="font-size:10px;line-height:20px;color:#000;white-space:nowrap;">${esc(formatMonthYearRu(row.date))}</div>
              <div style="font-size:10px;line-height:20px;color:#000;white-space:nowrap;">${esc(moneyPerMonth(row.replenishment || 0))}</div>
              <div style="font-size:10px;line-height:20px;color:#000;white-space:nowrap;">${esc(money(row.tax_deduction || 0))}</div>
              <div style="font-size:10px;line-height:20px;color:#000;white-space:nowrap;">${esc(money(row.cofinancing || 0))}</div>
              <div style="font-size:10px;line-height:20px;color:#000;white-space:nowrap;">${esc(money(row.total_capital || 0))}</div>
            </div>
        `
        )
        .join('');

    return `
      <div style="position:relative;width:535px;height:790px;background:#fff;">
        <div style="position:absolute;left:0;top:30px;font-size:18px;font-weight:400;line-height:20px;color:#000;">
          График достижения целей${isFirstPage ? '' : ' (продолжение)'}
        </div>
        ${
            isFirstPage
                ? `<div style="position:absolute;left:0;top:80px;width:535px;display:flex;align-items:flex-start;justify-content:space-between;">
          <div style="position:relative;width:60px;height:68px;border-radius:8px;background:linear-gradient(152.116deg, rgb(252, 237, 242) 0%, rgb(229, 239, 248) 120.41%);overflow:hidden;flex-shrink:0;">
            <img src="${esc(avatarSrc)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" />
          </div>
          <div style="flex:1;margin-left:17px;padding:10px 27px 10px 10px;border:1px solid #f1f1f1;border-radius:8px;">
            <div style="font-size:12px;line-height:15px;color:#000;">
              Это Ваш график достижения целей. Обратите внимание, что в реальности цифры будут отличаться от тех, что Вы видите в таблице. Точно посчитать будущее очень и очень сложно. Но если составлять финансовый план хотя бы раз в год и корректировать его с учетом новых данных по доходностям, инфляции, стоимости цели, то достижение целей становится гораздо более вероятным!
            </div>
          </div>
        </div>`
                : ''
        }
        <div style="position:absolute;left:0;top:${tableTop}px;width:535px;height:${tableHeight}px;">
          <svg viewBox="0 0 535 410" preserveAspectRatio="none" style="position:absolute;top:0;left:0;width:535px;height:${tableHeight}px;">
            <path d="M0 7.99999C0 3.58171 3.58172 0 8 0H527C531.418 0 535 3.58172 535 8V402C535 406.418 531.418 410 527 410H7.99999C3.58171 410 0 406.418 0 402V7.99999Z" fill="#F3F3F4"/>
          </svg>
          <div style="position:absolute;top:15px;left:20px;width:495px;display:grid;grid-template-columns:78px 96px 90px 104px 109px;column-gap:16px;">
            <div style="font-size:10px;font-weight:600;line-height:12px;color:#000;">Дата</div>
            <div style="font-size:10px;font-weight:600;line-height:12px;color:#000;">Пополнение</div>
            <div style="font-size:10px;font-weight:600;line-height:12px;color:#000;">Налоговый вычет</div>
            <div style="font-size:10px;font-weight:600;line-height:12px;color:#000;">Софинансирование</div>
            <div style="font-size:10px;font-weight:600;line-height:12px;color:#000;">Итоговый капитал</div>
          </div>
          <svg viewBox="0 0 495 1" preserveAspectRatio="none" style="position:absolute;top:45px;left:20px;width:495px;height:1px;">
            <line x1="0" y1="0.5" x2="495" y2="0.5" stroke="white"/>
          </svg>
          <div style="position:absolute;top:55px;left:20px;width:495px;display:flex;flex-direction:column;">
            ${rowCells}
          </div>
        </div>
      </div>
    `;
}

function buildShell({
    title,
    subtitle,
    bodyHtml,
    logoSrc,
    bgSrc,
    useBackground = false,
    footerText = 'НПФ Ростех • Госпенсия',
    footerLogoSrc = '',
    pagePaddingTop = 30,
    showTop = true,
}) {
    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: 595px 842px; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: 'DejaVu Sans', sans-serif; color: #212121; }
    .page {
      position: relative;
      width: 595px;
      height: 842px;
      overflow: hidden;
      background: #fff;
      padding: ${Number(pagePaddingTop)}px 30px 30px;
    }
    .bg {
      position: absolute;
      inset: 0;
      z-index: 0;
      background: #ffffff;
    }
    .bg img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0.16;
      filter: grayscale(100%);
    }
    .inner { position: relative; z-index: 1; }
    .top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 18px;
    }
    .h1 { font-size: 26px; line-height: 1.15; font-weight: 700; margin: 0; }
    .sub { margin-top: 6px; font-size: 14px; color: #4b5563; }
    .logo { height: 24px; width: auto; object-fit: contain; }
    .card {
      border: 1px solid #d7d7d7;
      border-radius: 12px;
      background: #fff;
      padding: 14px;
      margin-bottom: 12px;
    }
    .muted { font-size: 12px; color: #4b5563; }
    .pill {
      display: inline-block;
      border: 1px solid #722257;
      color: #722257;
      border-radius: 8px;
      padding: 8px 10px;
      font-weight: 700;
      font-size: 13px;
      margin-top: 10px;
    }
    .footer {
      position: absolute;
      left: 30px;
      right: 30px;
      bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
      font-size: 11px;
      color: #6b7280;
    }
    .footer__left {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
      max-width: 420px;
    }
    .footer__disclaimer {
      font-size: 10px;
      line-height: 1.25;
      color: #212121;
    }
    .footer__logo {
      height: 19px;
      width: auto;
      max-width: 120px;
      object-fit: contain;
      display: block;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="bg">${useBackground && bgSrc ? `<img src="${esc(bgSrc)}" alt="" />` : ''}</div>
    <div class="inner">
      ${
          showTop
              ? `<div class="top">
        <div>
          <h1 class="h1">${esc(title)}</h1>
          ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
        </div>
        ${logoSrc ? `<img class="logo" src="${esc(logoSrc)}" alt="" />` : ''}
      </div>`
              : ''
      }
      ${bodyHtml}
    </div>
    <div class="footer">
      <div class="footer__left">
        ${
            footerText
                ? `<div class="footer__disclaimer">${esc(footerText).replace(/\n/g, '<br/>')}</div>`
                : ''
        }
        ${footerLogoSrc ? `<img class="footer__logo" src="${esc(footerLogoSrc)}" alt="" />` : ''}
      </div>
      <div style="white-space:nowrap;">Страница PDF</div>
    </div>
  </div>
</body>
</html>`;
}

async function buildRostechPensionPagesHtml({ goal, clientName, options = {} }) {
    const root = path.join(__dirname, '../../../..');
    const inlineLocalAssets = Boolean(options.inlineLocalAssets);
    const logoFromSettings = options.logoSrc
        ? await resolveReportRasterRef(options.logoSrc, root, root, inlineLocalAssets)
        : '';
    const bgSrc = options.backgroundSrc
        ? await resolveReportRasterRef(options.backgroundSrc, root, root, inlineLocalAssets)
        : '';
    const cardImg = await resolveGoalCardImageSrc('PENSION', root, inlineLocalAssets, root);
    const rostechAvatar59Src = await resolveReportRasterRef(
        'assets/reports/rostech/pension-avatar-59-31-lite.webp',
        root,
        root,
        inlineLocalAssets
    );
    const rostechGoal59Src = await resolveReportRasterRef(
        'assets/reports/rostech/pension-goal-59-32-lite.webp',
        root,
        root,
        inlineLocalAssets
    );
    const rostechLogo59Src = await resolveReportRasterRef(
        'assets/reports/rostech/rostech-logo-59-51-lite.webp',
        root,
        root,
        inlineLocalAssets
    );
    const startPdsUrl = 'https://lk.rostecnpf.ru/new-contract/pds/';

    const s = goal?.summary || {};
    const yearsToPension = Number(goal?.details?.state_pension?.years_to_pension ?? 0);
    const retirementYear = Number(goal?.details?.state_pension?.retirement_year ?? 0);
    const currentReportYear = new Date().getFullYear();
    const monthly = Number(s.monthly_replenishment ?? 0);
    const initial = Number(s.initial_capital ?? 0);
    const inflationRate = Number(s.inflation_rate ?? 0);
    const targetPresent = Number(s.target_amount_initial ?? 0);
    const targetFuture = Number(s.target_amount_future ?? 0);
    const projectedPresent = Number(s.projected_pension_monthly_present ?? 0);
    const projectedFuture = Number(s.projected_pension_monthly_future ?? 0);
    const payoutYieldPercent = Number(s.payout_yield_percent ?? 0);
    const accumulationYieldPercent = Number(s.accumulation_yield_percent ?? 0);
    const statePensionMonthlyToday = Number(s.state_pension_monthly_today ?? projectedPresent ?? 0);
    const statePensionMonthlyFuture = Number(s.state_pension_monthly_future ?? projectedFuture ?? 0);
    const pensionGapToday = Math.max(targetPresent - statePensionMonthlyToday, 0);
    const pensionGapFuture = Math.max(targetFuture - statePensionMonthlyFuture, 0);
    const pensionGap = Number(s.pension_gap_future ?? 0);
    const totalCapital = Number(s.projected_capital_at_retirement ?? 0);
    const taxBenefit = Number(s.total_tax_benefit ?? 0);
    const cofin = Number(s.total_cofinancing ?? 0);
    const taxBenefitsTotals =
        options?.overallPlan?.tax_benefits?.totals ||
        options?.overallPlan?.summary?.tax_benefits_summary?.totals ||
        {};
    const deduction2026 = pickPositive(s.deduction_2026, taxBenefitsTotals.deduction_2026);
    const cofinancing2026 = pickPositive(s.cofinancing_2026, taxBenefitsTotals.cofinancing_2026);
    const nextCalendarYear = new Date().getFullYear() + 1;
    const targetMonths = Number(s.target_months ?? s.term_months ?? 0);
    const horizonYears = Number.isFinite(yearsToPension) && yearsToPension > 0
        ? yearsToPension
        : Number.isFinite(targetMonths) && targetMonths > 0
          ? Math.round(targetMonths / 12)
          : 0;

    const rawTitle = String(goal?.goal_name || 'Достойная пенсия').trim();
    const title = /госпенси/i.test(rawTitle) ? 'Достойная пенсия' : rawTitle;
    const displayRetirementYear =
        Number.isFinite(yearsToPension) && yearsToPension > 0
            ? currentReportYear + yearsToPension
            : Number.isFinite(retirementYear) && retirementYear > 0
              ? retirementYear
              : currentReportYear;
    const clientFirstName = String(clientName || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)[0] || 'Клиент';
    const commonIntro = `
      <div class="card">
        <div style="display:flex; gap:10px; align-items:flex-start;">
          <img src="${esc(rostechAvatar59Src || cardImg)}" alt="" style="width:60px;height:68px;object-fit:cover;border-radius:8px;" />
          <div style="font-size:13px;line-height:1.45; flex:1;">
            <b>${esc(title)}</b><br/>
            ${esc(clientName || 'Клиент')}, до пенсии ${Number.isFinite(yearsToPension) ? yearsToPension : '—'} лет.
            Я подготовила детальный план для формирования достойной пенсии.
          </div>
        </div>
      </div>
    `;
    const pensionIntroCard59290 = `
      <div style="display:flex;gap:12px;align-items:flex-start;margin-top:12px;">
        <img src="${esc(rostechAvatar59Src || cardImg)}" alt="" style="width:70px;height:80px;object-fit:cover;border-radius:10px;flex-shrink:0;" />
        <div style="flex:1;border:1px solid #e2e2e2;border-radius:12px;background:#fff;padding:10px 12px;">
          <div style="font-size:22px;line-height:1.25;color:#212121;font-weight:400;margin-bottom:8px;">Достойная пенсия</div>
          <div style="display:flex;gap:14px;align-items:flex-start;">
            <img src="${esc(rostechGoal59Src || cardImg)}" alt="" style="width:145px;height:82px;object-fit:cover;border-radius:10px;flex-shrink:0;" />
            <div style="font-size:13px;line-height:1.3;color:#424242;">
              ${esc(clientFirstName)}, Ваша будущая Достойная пенсия будет складываться из 2-х частей: Госпенсия и дополнительный доход, который мы с Вами планируем создать.<br/><br/>
              Давайте начнем с прогноза Госпенсии.
            </div>
          </div>
        </div>
      </div>
    `;
    const chartMaxStatePension = Math.max(statePensionMonthlyToday, statePensionMonthlyFuture, 1);
    const chartTodayBarHeight = Math.max(18, Math.round((statePensionMonthlyToday / chartMaxStatePension) * 70));
    const chartFutureBarHeight = Math.max(18, Math.round((statePensionMonthlyFuture / chartMaxStatePension) * 70));
    const ownFundsFallback = Math.max(initial + monthly * Math.max(targetMonths, 0), 0);
    const ownFundsForPlan = calculateOwnFundsFromSchedule(goal?.details?.monthly_schedule, ownFundsFallback);
    const incomeAndBenefitsForPlan = Math.max(totalCapital - ownFundsForPlan, 0);
    const totalPlanBase = Math.max(ownFundsForPlan, 1);
    const totalYieldPercent = Math.max((incomeAndBenefitsForPlan / totalPlanBase) * 100, 0);
    const maxPlanBarValue = Math.max(ownFundsForPlan, incomeAndBenefitsForPlan, totalCapital, 1);
    const ownFundsBarHeight = Math.max(20, Math.round((ownFundsForPlan / maxPlanBarValue) * 88));
    const incomeBarHeight = Math.max(20, Math.round((incomeAndBenefitsForPlan / maxPlanBarValue) * 88));
    const totalBarHeight = Math.max(20, Math.round((totalCapital / maxPlanBarValue) * 88));
    const yearlyEffectiveness = calculateAugNextYearEffectivenessPercent(goal?.details?.monthly_schedule);
    const highlightedYieldPercent = Number.isFinite(yearlyEffectiveness.percent)
        ? yearlyEffectiveness.percent
        : totalYieldPercent;
    const highlightedYieldYear = Number.isFinite(yearlyEffectiveness.startYear)
        ? yearlyEffectiveness.startYear
        : new Date().getFullYear();
    const payoutYieldMonthlyPercent = Number.isFinite(payoutYieldPercent)
        ? payoutYieldPercent / 12
        : 0;
    const additionalIncomeFuture = Math.max(totalCapital * ((Number.isFinite(payoutYieldPercent) ? payoutYieldPercent : 0) / 100 / 12), 0);
    const additionalIncomeToday = Math.max(pensionGapToday, 0);
    const planFacts = extractPensionPlanFacts(goal?.details?.monthly_schedule, {
        initialCapital: initial,
        monthlyContribution: monthly,
        taxDeductionAmount: deduction2026,
        taxDeductionYear: nextCalendarYear,
        cofinancingAmount: cofinancing2026,
        cofinancingYear: nextCalendarYear,
    });
    const currentIncomeMonthly = pickPositive(
        goal?.client?.avg_monthly_income ??
            goal?.avg_monthly_income ??
            s.avg_monthly_income ??
            options?.overallPlan?.avg_monthly_income,
        110000
    );
    const yearsForMethodology = Number.isFinite(yearsToPension) && yearsToPension > 0 ? yearsToPension : 20;
    const inflationRateForMethodology = Number.isFinite(inflationRate) && inflationRate > 0 ? inflationRate : 5.6;
    const inflationMultiplier = Math.pow(1 + inflationRateForMethodology / 100, yearsForMethodology);
    const fixedPaymentCurrent = pickPositive(
        s.fixed_payment_current ?? s.state_pension_fixed_payment_current ?? goal?.details?.state_pension?.fixed_payment_current,
        9584
    );
    const fixedPaymentFuture = pickPositive(
        s.fixed_payment_future ?? s.state_pension_fixed_payment_future ?? goal?.details?.state_pension?.fixed_payment_future,
        fixedPaymentCurrent * inflationMultiplier
    );
    const ipkForecast = pickPositive(
        s.ipk_forecast ?? s.state_pension_ipk_forecast ?? goal?.details?.state_pension?.ipk_forecast,
        0
    );
    const totalIpk = pickPositive(
        s.total_ipk ??
            s.ipk_total ??
            s.state_pension_ipk_total ??
            goal?.details?.state_pension?.total_ipk ??
            goal?.details?.state_pension?.ipk_total,
        169
    );
    const ipkPerYearRaw =
        Number.isFinite(yearsToPension) && yearsToPension > 0
            ? ipkForecast / yearsToPension
            : pickPositive(s.ipk_per_year ?? s.state_pension_ipk_per_year ?? goal?.details?.state_pension?.ipk_per_year, 4.4);
    const ipkPerYear = Math.round(ipkPerYearRaw * 10) / 10;
    const ipkCostCurrent = pickPositive(
        s.ipk_cost_current ??
            s.point_cost_today ??
            s.state_pension_ipk_cost_current ??
            goal?.details?.state_pension?.ipk_cost_current ??
            goal?.details?.state_pension?.point_cost_today,
        156.76
    );
    const ipkCostFuture = pickPositive(
        s.ipk_cost_future ??
            s.point_cost_future ??
            s.state_pension_ipk_cost_future ??
            goal?.details?.state_pension?.ipk_cost_future ??
            goal?.details?.state_pension?.point_cost_future,
        ipkCostCurrent * inflationMultiplier
    );
    const statePensionFormulaFuture = Math.max(fixedPaymentFuture + totalIpk * ipkCostFuture, 0);
    const methodPensionToday = Math.max(statePensionFormulaFuture / inflationMultiplier, 0);
    const methodAdditionalIncomeNeeded = Math.max(targetPresent - methodPensionToday, 0);
    const methodChartMax = Math.max(targetPresent, methodPensionToday, methodAdditionalIncomeNeeded, 1);
    const methodBarMaxHeight = 61;
    const methodBarMinHeight = 16;
    const methodTargetBarHeight = Math.max(methodBarMinHeight, Math.round((targetPresent / methodChartMax) * methodBarMaxHeight));
    const methodStateBarHeight = Math.max(methodBarMinHeight, Math.round((methodPensionToday / methodChartMax) * methodBarMaxHeight));
    const methodGapBarHeight = Math.max(methodBarMinHeight, Math.round((methodAdditionalIncomeNeeded / methodChartMax) * methodBarMaxHeight));

    // 15 кадров по заданным node-id (офлайн-версия без зависимостей от Figma URLs).
    return [
        // 59:28
        buildShell({
            title: 'Ваш финансовый план',
            subtitle: '',
            logoSrc: rostechLogo59Src || logoFromSettings,
            bgSrc,
            useBackground: false,
            footerText:
                'Финансовый план не является коммерческим предложением или договором,\nносит исключительно информационный характер.',
            footerLogoSrc: rostechLogo59Src || logoFromSettings || '',
            bodyHtml: `
              <div style="display:flex;gap:10px;align-items:flex-start;">
                <img src="${esc(rostechAvatar59Src || cardImg)}" alt="" style="width:60px;height:68px;object-fit:cover;border-radius:8px;flex-shrink:0;" />
                <div style="flex:1;min-width:0;background:#fff;border:1px solid #f1f1f1;border-radius:10px;padding:10px;">
                  <div style="font-size:13px;line-height:14px;color:#212121;">
                    Я подготовила детальный план для достижения вашей финансовой цели.<br/><br/>
                    Ваш текущий доход — ${esc(money(currentIncomeMonthly))}/мес. после вычета НДФЛ.<br/><br/>
                    Ваша финансовая цель:
                  </div>
                  <div style="display:flex;gap:24px;align-items:flex-start;margin-top:12px;">
                    <img src="${esc(rostechGoal59Src || cardImg)}" alt="" style="width:120px;height:70px;object-fit:cover;border-radius:8px;flex-shrink:0;" />
                    <div style="font-size:13px;line-height:14px;color:#212121;">
                      <b>1. ${esc(title)}</b><br/><br/>
                      Старт выплат — ${displayRetirementYear} г.<br/>
                      Желаемая пенсия — ${esc(moneyPerMonth(targetPresent))}
                    </div>
                  </div>
                </div>
              </div>
              <div style="position:relative;border:1px solid #8a2d69;border-radius:12px;padding:34px 20px 14px;background:#fff;margin-top:40px;">
                <div style="position:absolute;left:0;right:0;top:-1px;height:1px;">
                  <div style="position:absolute;left:0;top:0;width:138px;height:1px;background:#8a2d69;"></div>
                  <div style="position:absolute;right:0;top:0;width:138px;height:1px;background:#8a2d69;"></div>
                </div>
                <div style="position:absolute;left:50%;top:-11px;transform:translateX(-50%);background:#fff;padding:0 12px;font-size:16px;font-weight:700;line-height:1.1;">
                  Рост стоимости цели с учетом инфляции
                </div>

                <div style="display:flex;justify-content:space-evenly;align-items:flex-end;gap:38px;padding-top:8px;">
                  <div style="width:190px;text-align:center;">
                    <div style="font-size:16px;font-weight:400;line-height:18px;">${esc(moneyPerMonth(targetPresent))}</div>
                    <div style="height:62px;width:53px;background:#8f8f8c;margin:8px auto 0;"></div>
                    <div style="margin-top:12px;font-size:14px;line-height:16px;color:#212121;">Желаемая пенсия<br/>в сегодняшних деньгах</div>
                  </div>
                  <div style="width:220px;text-align:center;">
                    <div style="font-size:16px;font-weight:400;line-height:18px;">${esc(moneyPerMonth(projectedFuture))}</div>
                    <div style="height:104px;width:53px;background:#722257;margin:8px auto 0;"></div>
                    <div style="margin-top:12px;font-size:14px;line-height:16px;color:#212121;">Желаемая пенсия в ${displayRetirementYear} г.<br/>с учетом инфляции 5,6% в год</div>
                  </div>
                </div>
              </div>
            `,
        }),
        // 59:285
        buildShell({
            title: 'Достойная пенсия',
            subtitle: 'Прогноз Госпенсии',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 14,
            bodyHtml: `
              <div style="margin-top:4px;">${pensionIntroCard59290}</div>
              <div style="font-size:14px;line-height:1.25;font-weight:700;color:#212121;margin:12px 0 8px;">Прогноз Госпенсии</div>
              <div class="card" style="margin-bottom:14px;">
                <div style="font-size:13px;line-height:1.5;">
                  С учетом Вашего возраста и зарплаты, по моему прогнозу Вы будете получать <b>${esc(moneyPerMonth(statePensionMonthlyToday))}</b> в сегодняшних деньгах,
                  а с учетом инфляции эта сумма составит <b>${esc(moneyPerMonth(statePensionMonthlyFuture))}</b>.<br/><br/>
                  Более подробную методику расчета я добавила на стр. 7.
                </div>
              </div>
              <div class="card" style="border-color:#a95b8d;margin-top:0;margin-bottom:14px;">
                <div style="display:flex;justify-content:space-between;gap:24px;align-items:flex-end;">
                  <div style="flex:1;text-align:center;">
                    <div style="font-size:18px;font-weight:700;line-height:1.2;">${esc(moneyPerMonth(statePensionMonthlyToday))}</div>
                    <div style="height:${chartTodayBarHeight}px;width:48px;background:#000000;margin:10px auto 0;"></div>
                    <div class="muted" style="margin-top:10px;">Прогноз госпенсии в<br/>сегодняшних деньгах</div>
                  </div>
                  <div style="flex:1;text-align:center;">
                    <div style="font-size:18px;font-weight:700;line-height:1.2;">${esc(moneyPerMonth(statePensionMonthlyFuture))}</div>
                    <div style="height:${chartFutureBarHeight}px;width:48px;background:#722257;margin:10px auto 0;"></div>
                    <div class="muted" style="margin-top:10px;">Прогноз госпенсии в ${Number.isFinite(retirementYear) && retirementYear > 0 ? retirementYear : 'будущем'} г.<br/>с учетом инфляции ${esc(Number.isFinite(inflationRate) && inflationRate > 0 ? `${inflationRate.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%` : '—')}</div>
                  </div>
                </div>
              </div>
              <div style="margin-top:0;font-size:13px;line-height:1.45;color:#212121;">
                Как видите, для достойной пенсии не хватает ${esc(moneyPerMonth(pensionGapToday))} в сегодняшних деньгах,
                а с учетом инфляции нужно создать план для получения дополнительного ежемесячного дохода в размере ${esc(moneyPerMonth(pensionGapFuture))}.
              </div>
            `,
        }),
        // 59:132
        buildShell({
            title: 'Предлагаемый план',
            subtitle: 'График формирования пенсионного капитала',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 16,
            bodyHtml: `
              <div style="display:flex;gap:10px;align-items:flex-start;">
                <img src="${esc(rostechAvatar59Src || cardImg)}" alt="" style="width:56px;height:64px;object-fit:cover;border-radius:10px;flex-shrink:0;" />
                <div style="flex:1;border:1px solid #e2e2e2;border-radius:10px;background:#fff;padding:8px 10px;">
                  <div style="font-size:12px;line-height:1.25;color:#424242;">
                    Итак, я добавила в план создание дополнительного ежемесячного дохода - ${esc(moneyPerMonth(pensionGapToday))} в сегодняшних деньгах
                  </div>
                  <div style="display:flex;gap:10px;align-items:flex-start;margin-top:6px;">
                    <img src="${esc(rostechGoal59Src || cardImg)}" alt="" style="width:100px;height:58px;object-fit:cover;border-radius:8px;flex-shrink:0;filter:grayscale(100%);" />
                    <div style="font-size:12px;line-height:1.28;color:#424242;">
                      Дата достижения — ${displayRetirementYear} г.<br/><br/>
                      Дополнительный ежемесячный доход с учетом инфляции (${esc(Number.isFinite(inflationRate) && inflationRate > 0 ? `${inflationRate.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%` : '5,6%')}) - ${esc(moneyPerMonth(pensionGapFuture))}
                    </div>
                  </div>
                </div>
              </div>
              <div style="font-size:11px;line-height:1.33;color:#212121;margin-top:10px;">
                <b>Предлагаемый план:</b><br/>
                <br/>
                1. Заключить договор долгосрочных сбережений (ПДС) в АО «НПФ «Ростех».<br/>
                Плюсы:<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;• Государство будет добавлять до 36 000 ₽/год в течение 10 лет.<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;• Налоговые вычеты (до 22% в год со взносов в пределах 400 000 ₽).<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;• Капитал застрахован (до 2,8 млн ₽).<br/>
                <br/>
                2. Дальнейшие шаги:<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;• Внести первоначальный капитал - ${esc(money(planFacts.initialCapital))}.<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;• В следующие месяцы пополнять по ${esc(money(planFacts.monthlyContribution))}.<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;• Получить ${esc(money(planFacts.cofinancingAmount))} в ${planFacts.cofinancingYear || nextCalendarYear} году от государства.<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;• В ${planFacts.taxDeductionYear || nextCalendarYear} г. подать на налоговый вычет ${esc(moneyWithPrecision(planFacts.taxDeductionAmount, 2))} (рассчитан по ставке 13% НДФЛ).<br/>
                <span style="color:#722257;font-weight:700;">&nbsp;&nbsp;&nbsp;&nbsp;• Прогнозируемая доходность с учетом софинансирования, налогового вычета, доходности от инвестиций за ${highlightedYieldYear} год - ${esc(highlightedYieldPercent.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}% годовых.</span><br/>
                &nbsp;&nbsp;&nbsp;&nbsp;• Актуализировать финансовый план через 6 мес.<br/>
                <br/>
                3. Как растет капитал?<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;• За счет пополнения, софинансирования, инвестиционного дохода Вы накопите ${esc(money(totalCapital))}.<br/>
                В нашем плане мы учитываем, что Вы, выйдя на пенсию в ${displayRetirementYear} году, накопленный капитал разместите на депозитах и/или в облигациях и будете получать ежемесячный доход в виде процентов. Сейчас средняя ставка по депозитам в банках 13,86%, но в нашем плане мы закладываем доходность в ${displayRetirementYear} г. в размере ${esc((Number.isFinite(payoutYieldPercent) ? payoutYieldPercent : 12).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }))}% годовых или ${esc((Number.isFinite(payoutYieldMonthlyPercent) ? payoutYieldMonthlyPercent : 1).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }))}% в месяц, что по нашему плану и будет равно ${esc(moneyPerMonth(projectedFuture))}.
              </div>
              <div style="margin-top:12px;font-size:10px;line-height:1.15;color:#212121;text-align:center;font-weight:700;">
                График формирования пенсионного<br/>капитала с учетом пополнения:
              </div>
              <div style="position:relative;height:138px;margin-top:6px;border-bottom:1px solid #d9d9d9;">
                <div style="position:absolute;left:0;right:0;top:16px;border-top:1px dashed #d9d9d9;"></div>
                <div style="position:absolute;left:0;right:0;top:36px;border-top:1px dashed #d9d9d9;"></div>
                <div style="position:absolute;left:0;right:0;top:56px;border-top:1px dashed #d9d9d9;"></div>
                <div style="position:absolute;left:0;right:0;top:76px;border-top:1px dashed #d9d9d9;"></div>
                <div style="position:absolute;left:0;right:0;top:96px;border-top:1px dashed #d9d9d9;"></div>
                <div style="position:absolute;left:0;right:0;top:116px;border-top:1px dashed #d9d9d9;"></div>
                <div style="position:absolute;left:62px;bottom:0;width:102px;height:${ownFundsBarHeight}px;background:#9f9f9f;border-radius:3px 3px 0 0;"></div>
                <div style="position:absolute;left:172px;bottom:0;width:102px;height:${incomeBarHeight}px;background:#000000;border-radius:3px 3px 0 0;"></div>
                <div style="position:absolute;left:282px;bottom:0;width:102px;height:${totalBarHeight}px;background:#722257;border-radius:3px 3px 0 0;"></div>
                <div style="position:absolute;left:62px;bottom:4px;width:102px;text-align:center;font-size:10px;color:#fff;">${esc(money(ownFundsForPlan))}</div>
                <div style="position:absolute;left:172px;bottom:4px;width:102px;text-align:center;font-size:10px;color:#fff;">${esc(money(incomeAndBenefitsForPlan))}</div>
                <div style="position:absolute;left:282px;bottom:4px;width:102px;text-align:center;font-size:10px;color:#fff;">${esc(money(totalCapital))}</div>
              </div>
              <div style="display:flex;justify-content:center;gap:14px;margin-top:6px;font-size:10px;color:#424242;line-height:1.2;">
                <span><span style="display:inline-block;width:8px;height:8px;background:#9f9f9f;border-radius:2px;vertical-align:middle;margin-right:5px;"></span>Собственные средства</span>
                <span><span style="display:inline-block;width:8px;height:8px;background:#000000;border-radius:2px;vertical-align:middle;margin-right:5px;"></span>Процентный доход, софинансирование, вычеты</span>
                <span><span style="display:inline-block;width:8px;height:8px;background:#722257;border-radius:2px;vertical-align:middle;margin-right:5px;"></span>Итого капитал</span>
              </div>
              <div style="margin-top:12px;border:1px solid #8a2d69;border-radius:8px;padding:6px 10px;text-align:center;font-size:16px;line-height:1.15;color:#722257;font-weight:700;">
                Расчетная доходность Вашего плана на весь срок - ${esc((Number.isFinite(accumulationYieldPercent) && accumulationYieldPercent > 0 ? accumulationYieldPercent : totalYieldPercent).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 2 }))}% годовых
              </div>
            `,
        }),
        // 59:397
        buildShell({
            title: 'Структура портфеля НПФ',
            subtitle: 'Консервативный профиль с контролем риска',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 18,
            bodyHtml: `
              <div style="display:flex;gap:8px;align-items:flex-start;">
                <img src="${esc(rostechAvatar59Src || cardImg)}" alt="" style="width:56px;height:66px;object-fit:cover;border-radius:9px;flex-shrink:0;" />
                <div style="flex:1;border:1px solid #dddddd;border-radius:10px;background:#fff;padding:8px 10px;">
                  <div style="font-size:11px;line-height:1.25;color:#2f2f2f;">
                    Хотела бы отметить, что государство следит за структурой инвестирования Ваших средств.
                    Вот усредненный портфель, куда НПФ может вкладывать Ваши деньги:
                  </div>
                  <div style="border:1px solid #9f3e76;border-radius:10px;background:#fff;padding:8px 10px;margin-top:8px;margin-bottom:8px;">
                    <div style="display:flex;gap:12px;align-items:center;">
                      <div style="width:112px;height:112px;border-radius:50%;flex-shrink:0;background:
                        conic-gradient(
                          #7e2a67 0% 14%,
                          #a1167f 14% 45%,
                          #1f2025 45% 62%,
                          #b8aab8 62% 80%,
                          #eff2f5 80% 94%,
                          #f8f8f8 94% 100%
                        ); border:1px solid #ececec;">
                      </div>
                      <div style="display:grid;grid-template-columns:1fr 1fr;column-gap:14px;row-gap:4px;flex:1;min-width:0;font-size:11px;line-height:1.2;color:#353535;">
                        <div><span style="display:inline-block;width:7px;height:7px;background:#7e2a67;border-radius:50%;margin-right:6px;vertical-align:middle;"></span>Банковские депозиты</div>
                        <div><span style="display:inline-block;width:7px;height:7px;background:#eff2f5;border-radius:50%;margin-right:6px;vertical-align:middle;"></span>ОФЗ</div>
                        <div><span style="display:inline-block;width:7px;height:7px;background:#a1167f;border-radius:50%;margin-right:6px;vertical-align:middle;"></span>Корпоративные облигации А+</div>
                        <div><span style="display:inline-block;width:7px;height:7px;background:#b9b9b9;border-radius:50%;margin-right:6px;vertical-align:middle;"></span>Муниципальные облигации Ф+</div>
                        <div><span style="display:inline-block;width:7px;height:7px;background:#1f2025;border-radius:50%;margin-right:6px;vertical-align:middle;"></span>Акции</div>
                        <div><span style="display:inline-block;width:7px;height:7px;background:#f8f8f8;border:1px solid #dedede;border-radius:50%;margin-right:6px;vertical-align:middle;"></span>Наличные</div>
                      </div>
                    </div>
                    <div style="margin-top:8px;font-size:13px;line-height:1.15;color:#3a3a3a;">
                      Прогнозируемый доход - ${esc((Number.isFinite(accumulationYieldPercent) && accumulationYieldPercent > 0 ? accumulationYieldPercent : totalYieldPercent).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))}%
                    </div>
                  </div>
                  <div style="font-size:11px;line-height:1.24;color:#343434;">
                    Как видите, доля рисковых активов (акций) не более 7%.<br/>
                    Это позволяет снизить риски потерь при инвестировании. В 2025 году НПФ Ростех заработал своим клиентам на ДДС в среднем 19% годовых.<br/>
                    Итак, если Вы начнете пополнять капитал на ${esc(money(planFacts.monthlyContribution))} в этом году, и будете индексировать пополнение на величину инфляции, то за счет процентов Вы накопите ${esc(money(totalCapital))} к моменту выхода на пенсию.
                  </div>
                  <div style="margin-top:8px;border-radius:9px;overflow:hidden;height:92px;background:#f0f0f0;">
                    <img src="${esc(rostechGoal59Src || cardImg)}" alt="" style="width:100%;height:100%;object-fit:cover;filter:grayscale(100%);" />
                  </div>
                  <div style="margin-top:8px;font-size:10px;line-height:1.2;color:#343434;">
                    По закону Вы сможете забрать весь капитал, если срок накоплений составил 15 лет
                    или Вы достигли 55 (Ж) 60 (М), в зависимости от того, что наступило раньше.
                  </div>

                  <div style="margin-top:8px;border:1px solid #dddddd;border-radius:10px;background:#fff;padding:7px 8px;">
                    <div style="border:1px solid #9f3e76;border-radius:10px;padding:6px 8px;text-align:center;font-size:13px;line-height:1.2;font-weight:700;color:#7e2a67;">
                      Дополнительный ежемесячный доход = ${esc(money(totalCapital))} x ${esc((Number.isFinite(payoutYieldMonthlyPercent) ? payoutYieldMonthlyPercent : 1).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }))}% = ${esc(moneyPerMonth(additionalIncomeFuture))}
                    </div>
                    <div style="margin-top:6px;font-size:11px;line-height:1.2;font-weight:700;color:#212121;">
                      С учетом заложенной инфляции ${esc(Number.isFinite(inflationRate) && inflationRate > 0 ? `${inflationRate.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}` : '5,6')}%/год,
                      это эквивалентно ${esc(moneyPerMonth(additionalIncomeToday))} сегодня.
                    </div>

                    <div style="margin-top:6px;border:1px solid #e4e4e4;border-radius:10px;padding:5px;background:#f9f9f9;">
                      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid #ebebeb;border-radius:8px;overflow:hidden;background:#fff;">
                        <div style="padding:6px 7px;font-size:9px;color:#666;border-right:1px solid #efefef;border-bottom:1px solid #efefef;">Тип дохода</div>
                        <div style="padding:6px 7px;font-size:9px;color:#666;border-right:1px solid #efefef;border-bottom:1px solid #efefef;">В сегодняшних деньгах</div>
                        <div style="padding:6px 7px;font-size:9px;color:#666;border-bottom:1px solid #efefef;">С учетом инфляции</div>

                        <div style="padding:6px 7px;font-size:12px;line-height:1.2;color:#2d2d2d;border-right:1px solid #efefef;">Госпенсия<br/>Дополнительный доход</div>
                        <div style="padding:6px 7px;font-size:12px;line-height:1.2;color:#2d2d2d;border-right:1px solid #efefef;">${esc(moneyPerMonth(statePensionMonthlyToday))}<br/>${esc(moneyPerMonth(additionalIncomeToday))}</div>
                        <div style="padding:6px 7px;font-size:12px;line-height:1.2;color:#2d2d2d;">${esc(moneyPerMonth(statePensionMonthlyFuture))}<br/>${esc(moneyPerMonth(additionalIncomeFuture))}</div>

                        <div style="padding:6px 7px;font-size:12px;font-weight:700;color:#2d2d2d;border-top:1px solid #efefef;border-right:1px solid #efefef;">Итого:</div>
                        <div style="padding:6px 7px;font-size:12px;font-weight:700;color:#2d2d2d;border-top:1px solid #efefef;border-right:1px solid #efefef;">${esc(moneyPerMonth(targetPresent))}</div>
                        <div style="padding:6px 7px;font-size:12px;font-weight:700;color:#2d2d2d;border-top:1px solid #efefef;">${esc(moneyPerMonth(projectedFuture))}</div>
                      </div>
                    </div>
                    <div style="display:flex;justify-content:center;margin-top:6px;">
                      <a href="${esc(startPdsUrl)}" style="display:inline-block;background:#7f1f67;color:#fff;border-radius:12px;padding:5px 22px;font-size:14px;line-height:1;font-weight:700;text-decoration:none;">
                        Начать
                      </a>
                    </div>
                    <div style="margin-top:6px;font-size:8px;color:#555;line-height:1.15;">
                      Финансовый план не является коммерческим предложением или договором, носит исключительно информационный характер.
                    </div>
                  </div>
                </div>
              </div>
            `,
        }),
        // 59:314
        buildShell({
            title: 'Методика расчета Госпенсии',
            subtitle: 'Фиксированная выплата + ИПК × стоимость ИПК',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            bodyHtml: `
              <div style="position:relative;height:770px;width:535px;background:#ffffff;">
                <div style="position:absolute;left:0;top:30px;display:flex;gap:10px;width:535px;">
                  <div style="position:relative;width:60px;height:68px;border-radius:8px;overflow:hidden;flex-shrink:0;background:linear-gradient(152.116deg, rgb(252, 237, 242) 0%, rgb(229, 239, 248) 120.41%);">
                    <img src="${esc(rostechAvatar59Src || cardImg)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:8px;" />
                  </div>
                  <div style="flex:1;border:1px solid #f1f1f1;border-radius:8px;padding:10px;background:#fff;">
                    <div style="font-size:13px;line-height:14px;color:#212121;">
                      А самое приятное то, что государство помогает Вам создавать свой капитал.
                    </div>
                  </div>
                </div>

                <div style="position:absolute;left:0;top:110px;font-size:13px;line-height:14px;color:#000;">
                  Ваш доход - ${esc(moneyPerMonth(currentIncomeMonthly))}
                </div>

                <div style="position:absolute;left:0;top:136px;width:456px;font-size:13px;line-height:14px;color:#000;">
                  В соответствии с федеральным законом № 75-ФЗ «О негосударственных пенсионных фондах», государство обязуется добавлять ежегодно 50 коп. на каждый Ваш рубль, но не более 36 000 ₽ в год из расчета всех сумм пополнений в течение предыдущего года. И так на протяжении 10 лет.
                </div>

                <div style="position:absolute;left:0;top:230px;width:535px;">
                  <div style="height:110px;background:#f3f3f4;border-radius:8px;position:relative;">
                    <div style="position:absolute;left:50%;top:20px;transform:translateX(-50%);font-size:16px;line-height:14px;font-weight:700;color:#722257;">План по софинансированию</div>
                    <div style="position:absolute;left:20px;top:54px;display:flex;flex-direction:column;gap:8px;font-size:14px;line-height:14px;color:#000;">
                      <div>Софинансирование за ${nextCalendarYear} г. - ${esc(money(cofinancing2026))}</div>
                      <div>Всего софинансирование - ${esc(money(cofin))}</div>
                    </div>
                  </div>
                </div>

                <div style="position:absolute;left:0;top:360px;width:499px;font-size:13px;line-height:14px;color:#000;">
                  Но и это еще не все. Государство дает возможность получить налоговые вычеты.<br/>
                  В соответствии со статьей НК РФ № 56 Вы имеете право получать возврат налогов на доходы физического лица.
                </div>

                <div style="position:absolute;left:0;top:422px;width:535px;">
                  <div style="height:110px;background:#f3f3f4;border-radius:8px;position:relative;">
                    <div style="position:absolute;left:50%;top:20px;transform:translateX(-50%);font-size:16px;line-height:14px;font-weight:700;color:#722257;">Налоговое планирование</div>
                    <div style="position:absolute;left:20px;top:54px;display:flex;flex-direction:column;gap:8px;font-size:14px;line-height:14px;color:#000;">
                      <div>Налоговый вычет за ${nextCalendarYear} г. - ${esc(money(deduction2026))}</div>
                      <div>Всего налоговых вычетов за весь срок - ${esc(money(taxBenefit))}</div>
                    </div>
                  </div>
                </div>

                <div style="position:absolute;left:0;top:552px;width:535px;">
                  <div style="height:33px;background:#722257;border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:center;">
                    <div style="font-size:16px;line-height:14px;font-weight:600;color:#fff;">Резюме</div>
                  </div>
                  <div style="height:205px;background:#f3f3f4;border-radius:0 0 8px 8px;padding:12px 20px 20px;">
                    <div style="font-size:14px;line-height:14px;color:#000;font-weight:600;margin-bottom:8px;">Цель: ${esc(title)} - ${esc(moneyPerMonth(targetPresent))}</div>
                    <div style="font-size:14px;line-height:14px;color:#000;margin-bottom:8px;">Дата - ${Number.isFinite(retirementYear) && retirementYear > 0 ? retirementYear : '—'} г.</div>
                    <div style="font-size:14px;line-height:14px;color:#000;margin-bottom:8px;">Первоначальный капитал - ${esc(money(initial))}</div>
                    <div style="font-size:14px;line-height:14px;color:#000;margin-bottom:8px;">Пополнение капитала - ${esc(moneyPerMonth(monthly))}</div>
                    <div style="font-size:14px;line-height:14px;color:#000;margin-bottom:8px;">Всего софинансирование - ${esc(money(cofin))}</div>
                    <div style="font-size:14px;line-height:14px;color:#000;margin-bottom:8px;">Всего налоговых вычетов - ${esc(money(taxBenefit))}</div>
                    <div style="height:1px;background:#722257;margin:12px 0;"></div>
                    <div style="font-size:15px;line-height:16px;font-weight:700;color:#000;">Прогноз по итоговому капиталу - ${esc(money(totalCapital))}</div>
                  </div>
                </div>
              </div>
            `,
        }),
        // 59:methodology (страница 7)
        buildShell({
            title: 'Методика расчета Госпенсии',
            subtitle: 'Фиксированная выплата + ИПК × стоимость ИПК',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            bodyHtml: `
              <div style="position:relative;width:535px;height:790px;background:#ffffff;">
                <div style="position:absolute;left:0;top:30px;width:535px;display:flex;gap:10px;align-items:flex-start;">
                  <div style="width:60px;height:68px;flex-shrink:0;border-radius:8px;background:linear-gradient(152.116deg, rgb(252, 237, 242) 0%, rgb(229, 239, 248) 120.41%);overflow:hidden;">
                    <img src="${esc(rostechAvatar59Src || cardImg)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" />
                  </div>
                  <div style="flex:1;min-width:0;border:1px solid #f1f1f1;border-radius:8px;padding:10px;background:#fff;">
                    <div style="font-size:13px;line-height:14px;color:#212121;margin-bottom:12px;">Достойная пенсия</div>
                    <div style="display:flex;gap:16px;align-items:flex-start;">
                      <div style="width:120px;height:70px;flex-shrink:0;border-radius:8px;overflow:hidden;">
                        <img src="${esc(rostechGoal59Src || cardImg)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" />
                      </div>
                      <div style="font-size:13px;line-height:14px;color:#212121;flex:1;">
                        ${esc(clientFirstName)}, здесь я подробно описываю методику расчета Вашей будущей Госпенсии.
                      </div>
                    </div>
                  </div>
                </div>

                <div style="position:absolute;left:0;top:166px;font-weight:600;font-size:13px;line-height:14px;color:#000;">Прогноз Госпенсии</div>
                <div style="position:absolute;left:0;top:188px;font-size:13px;line-height:14px;color:#212121;">Как рассчитывается Госпенсия?</div>

                <div style="position:absolute;left:0;top:214px;background:#722257;border-radius:8px;padding:10px;width:fit-content;max-width:535px;">
                  <div style="font-size:14px;line-height:13px;color:#fff;">Госпенсия = Фиксированная выплата + (ИПК × стоимость ИПК)</div>
                </div>

                <div style="position:absolute;left:0;top:259px;width:535px;font-size:13px;line-height:14px;color:#212121;">
                  <div style="margin-bottom:3px;"><b>1. Фиксированная выплата</b></div>
                  <div style="margin-bottom:3px;">
                    Фиксированная выплата составляет ${esc(money(fixedPaymentCurrent))} в месяц. Каждый год ее индексируют с учетом инфляции.
                    Если инфляция будет в среднем ${esc(inflationRateForMethodology.toLocaleString('ru-RU', { maximumFractionDigits: 2 }))}% в год, то через ${yearsForMethodology} лет эта часть Госпенсии вырастет до ${esc(moneyPerMonth(fixedPaymentFuture))}.
                  </div>
                  <div style="margin-top:3px;margin-bottom:3px;"><b>2. Индивидуальный Пенсионный Коэффициент (ИПК)</b></div>
                  <div style="margin-bottom:3px;">Вам начисляется каждый год определенное количество ИПК за взносы Вашего работодателя в Социальный Фонд России.</div>
                  <div style="margin-bottom:3px;">Чем больше стаж и зарплата — тем больше накопите ИПК.</div>
                  <ul style="margin-left:19.5px;margin-bottom:3px;">
                    <li style="line-height:14px;">При Вашей зарплате ${esc(moneyPerMonth(currentIncomeMonthly))} за год начисляется ~${esc(ipkPerYear.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))} ИПК.</li>
                    <li style="line-height:14px;">К пенсии у Вас может накопиться ${esc(totalIpk.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }))} ИПК.</li>
                  </ul>
                  <div style="margin-top:3px;margin-bottom:3px;"><b>Сколько стоит ИПК?</b></div>
                  <div style="margin-bottom:3px;">Стоимость ИПК государство индексирует на величину инфляции.</div>
                  <div style="margin-bottom:3px;">Стоимость одного ИПК в ${nextCalendarYear} году — ${esc(ipkCostCurrent.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))} ₽.</div>
                  <div style="margin-bottom:3px;">Если инфляция ${esc(inflationRateForMethodology.toLocaleString('ru-RU', { maximumFractionDigits: 2 }))}% в год, то через ${yearsForMethodology} лет 1 балл = ${esc(ipkCostFuture.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))} ₽.</div>
                </div>

                <div style="position:absolute;left:0;top:535px;font-size:13px;line-height:14px;color:#212121;">Таким образом прогноз Вашей Госпенсии выглядит вот так:</div>

                <div style="position:absolute;left:0;top:561px;background:#722257;border-radius:8px;padding:10px;width:fit-content;max-width:535px;">
                  <div style="font-size:14px;line-height:13px;color:#fff;">
                    Ваша госпенсия = ${esc(money(fixedPaymentFuture))} + (${esc(totalIpk.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }))} ИПК × ${esc(ipkCostFuture.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }))} ₽) = ${esc(moneyPerMonth(statePensionFormulaFuture))}
                  </div>
                </div>

                <div style="position:absolute;left:0;top:606px;width:535px;font-size:13px;line-height:14px;color:#212121;">
                  Но! Из-за инфляции ${esc(money(statePensionFormulaFuture))} через ${yearsForMethodology} лет — это как ~${esc(money(methodPensionToday))} сегодня, а Ваша цель - ${esc(money(targetPresent))}.
                  Таким образом нам нужно создать дополнительный доход в размере ${esc(moneyPerMonth(methodAdditionalIncomeNeeded))}.
                </div>

                <div style="position:absolute;left:0;top:659px;width:535px;height:137px;">
                  <svg viewBox="0 0 535 137" preserveAspectRatio="none" style="position:absolute;top:0;left:0;width:100%;height:100%;">
                    <path d="M8 0.5H527C531.142 0.5 534.5 3.85786 534.5 8V129C534.5 133.142 531.142 136.5 527 136.5H8C3.85787 136.5 0.5 133.142 0.5 129V8L0.509766 7.61426C0.704061 3.77915 3.77915 0.704063 7.61426 0.509766L8 0.5Z" stroke="#722257" fill="none"/>
                  </svg>
                  <div style="position:absolute;left:100px;bottom:0;display:flex;flex-direction:column;align-items:center;gap:4px;width:110px;">
                    <div style="font-size:12px;line-height:13px;color:#212121;white-space:nowrap;margin-bottom:2px;">${esc(moneyPerMonth(targetPresent))}</div>
                    <div style="width:49px;height:${methodTargetBarHeight}px;background:#000;border-radius:4px 4px 0 0;"></div>
                    <div style="font-size:12px;line-height:13px;color:#212121;text-align:center;max-width:130px;">Желаемая<br/>пенсия</div>
                  </div>
                  <div style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;width:120px;">
                    <div style="font-size:12px;line-height:13px;color:#212121;white-space:nowrap;margin-bottom:2px;">${esc(moneyPerMonth(methodPensionToday))}</div>
                    <div style="width:49px;height:${methodStateBarHeight}px;background:#722257;border-radius:4px 4px 0 0;"></div>
                    <div style="font-size:12px;line-height:13px;color:#212121;text-align:center;max-width:130px;">Прогноз<br/>Госпенсии</div>
                  </div>
                  <div style="position:absolute;left:325px;bottom:0;display:flex;flex-direction:column;align-items:center;gap:4px;width:150px;">
                    <div style="font-size:12px;line-height:13px;color:#212121;white-space:nowrap;margin-bottom:2px;">${esc(moneyPerMonth(methodAdditionalIncomeNeeded))}</div>
                    <div style="width:49px;height:${methodGapBarHeight}px;background:#8f8f8c;border-radius:4px 4px 0 0;"></div>
                    <div style="font-size:12px;line-height:13px;color:#212121;text-align:center;max-width:130px;">Необходимый<br/>дополнительный<br/>доход</div>
                  </div>
                </div>
              </div>
            `,
        }),
        // 59:657
        buildShell({
            title: 'Важная Информация. Инфляция',
            subtitle: '',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            bodyHtml: `
              <div style="position:relative;width:535px;height:790px;background:#fff;">
                <div style="position:absolute;left:0;top:30px;font-size:18px;font-weight:400;line-height:20px;color:#212121;">
                  Важная Информация. Инфляция
                </div>

                <div style="position:absolute;left:0;top:80px;width:535px;display:flex;gap:17px;align-items:flex-start;">
                  <div style="width:60px;height:68px;flex-shrink:0;border-radius:8px;background:linear-gradient(152.116deg, rgb(252, 237, 242) 0%, rgb(229, 239, 248) 120.41%);overflow:hidden;border:1px solid #f1f1f1;">
                    <img src="${esc(rostechAvatar59Src || cardImg)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" />
                  </div>
                  <div style="flex:1;border:1px solid #f1f1f1;border-radius:8px;padding:10px 27px 10px 10px;">
                    <div style="font-size:13px;line-height:14px;color:#212121;">
                      Как Вы можете видеть на графике ниже, ставка по депозитам коррелирует с наблюдаемой инфляцией Росстата. Я считаю, что в ближайшем будущем тренд сменится на снижение инфляции, а значит и начнут снижаться ставки по депозитам. Поэтому в моих расчетах инфляция и доходность зависят от срока достижения цели.
                    </div>
                  </div>
                </div>

                <div style="position:absolute;left:50%;top:235px;transform:translateX(-50%);font-size:16px;font-weight:400;line-height:18px;color:#212121;">
                  Годовая инфляция
                </div>

                <div style="position:absolute;left:0;top:273px;width:524px;height:170px;display:flex;gap:4px;">
                  <div style="display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end;width:34px;height:170px;padding-right:4px;font-size:8px;line-height:13px;color:#212121;">
                    <span>18,00</span><span>16,00</span><span>14,00</span><span>12,00</span><span>10,00</span><span>8,00</span><span>6,00</span><span>4,00</span><span>2,00</span><span>0,00</span>
                  </div>
                  <div style="position:relative;flex:1;height:170px;">
                    <div style="position:absolute;top:6px;left:0;width:100%;height:154px;background-image:repeating-linear-gradient(to top,#c4c4c4 0px,#c4c4c4 1px,transparent 1px,transparent 17px);"></div>
                    <svg viewBox="0 0 460 160" preserveAspectRatio="none" style="position:absolute;top:14px;left:2px;width:460px;height:140px;">
                      <path d="M0 106L7 102H13H19L22 106H36L46 102L53 95C53 92 55 89 60 95C65 101 74 102 78 102L86 95L92 83L98 79H115L120 83L131 18L147 1L157 18L161 28V38L180 43H187L199 53V61H208H223L230 118L238 123L242 134H252L260 118L258 112L271 95H291L304 83L310 70L322 61L329 70L340 61L397 90L418 100" stroke="#722257" stroke-width="1.5" fill="none"/>
                      <path d="M0 118L115 81L143 1L217 101L326 32L354 65L421 100" stroke="#21282B" stroke-width="1.5" fill="none"/>
                      <path d="M418 100L456 117" stroke="#722257" stroke-width="1.5" fill="none" stroke-dasharray="3 3"/>
                      <path d="M421 100L458 118" stroke="#21282B" stroke-width="1.5" fill="none" stroke-dasharray="3 3"/>
                    </svg>
                    <div style="position:absolute;bottom:0;left:27px;display:flex;gap:6px;align-items:center;">
                      ${['2016г.','2017г.','2018г.','июл.21','сен.21','нояб.21','янв.22','мар.22','май 22','июл.22','сен.22','нояб.22','янв.23','мар.23','май 23','июл.23','сен.23','нояб.23','янв.24','мар.24','май 24','июл.24','2025г.','2030г.','2035г.'].map((x)=>`<span style="font-size:8px;line-height:13px;color:#212121;white-space:nowrap;writing-mode:vertical-rl;transform:rotate(180deg);text-align:right;width:13px;">${x}</span>`).join('')}
                    </div>
                  </div>
                </div>

                <div style="position:absolute;left:0;top:495px;display:flex;gap:60px;">
                  <div style="display:flex;flex-direction:column;gap:0;">
                    <div style="display:flex;gap:8px;align-items:center;min-height:14px;"><span style="width:28.5px;height:1px;background:#722257;display:inline-block;"></span><span style="font-size:8px;line-height:14px;color:#212121;">годовая инфляция в зависимости от времени</span></div>
                    <div style="display:flex;gap:8px;align-items:center;min-height:14px;"><span style="width:28.5px;height:1px;background:#21282B;display:inline-block;"></span><span style="font-size:8px;line-height:14px;color:#212121;">средняя максимальная ставка по вкладам</span></div>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:0;">
                    <div style="display:flex;gap:8px;align-items:center;min-height:14px;"><span style="width:28.5px;height:1px;display:inline-block;background:repeating-linear-gradient(to right,#722257 0px,#722257 2px,transparent 2px,transparent 4px);"></span><span style="font-size:8px;line-height:14px;color:#212121;">прогноз годовой инфляции</span></div>
                    <div style="display:flex;gap:8px;align-items:center;min-height:14px;"><span style="width:28.5px;height:1px;display:inline-block;background:repeating-linear-gradient(to right,#21282B 0px,#21282B 2px,transparent 2px,transparent 4px);"></span><span style="font-size:8px;line-height:14px;color:#212121;">прогноз доходности депозитов</span></div>
                  </div>
                </div>

                <div style="position:absolute;left:0;top:553px;font-size:12px;line-height:15px;color:#212121;">
                  Поэтому мы рекомендуем использовать следующие значения инфляции:
                </div>

                <div style="position:absolute;left:0;top:588px;width:535px;">
                  <table style="width:100%;border-collapse:collapse;background:#F3F3F4;border-radius:8px;overflow:hidden;">
                    <thead>
                      <tr>
                        <th style="font-size:10px;line-height:20px;font-weight:400;color:#212121;text-align:left;padding:10px 10px 10px 20px;border-bottom:1px solid #fff;">Срок цели</th>
                        <th style="font-size:10px;line-height:20px;font-weight:400;color:#212121;text-align:left;padding:10px;border-bottom:1px solid #fff;">Прогнозное значение инфляции</th>
                        <th style="font-size:10px;line-height:20px;font-weight:400;color:#212121;text-align:left;padding:10px;border-bottom:1px solid #fff;">Доходность капитала</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${[
                          ['До 1 года', '10%', '16%'],
                          ['От 1 года до 2 лет', '9,5%', '14%'],
                          ['От 2 лет до 3 лет', '8,5%', '14%'],
                          ['От 3 лет до 5 лет', '7,4%', '12%'],
                          ['От 5 лет до 10 лет', '5,7%', '10%'],
                          ['От 10 лет', '5,7%', '10%'],
                      ]
                          .map(
                              (row, idx) => `<tr style="${idx < 5 ? 'border-bottom:1px solid #fff;' : ''}">
                        <td style="font-size:8px;line-height:14px;font-weight:400;color:#212121;padding:10px 10px 10px 20px;">${row[0]}</td>
                        <td style="font-size:8px;line-height:14px;font-weight:400;color:#212121;padding:10px;">${row[1]}</td>
                        <td style="font-size:8px;line-height:14px;font-weight:400;color:#212121;padding:10px;">${row[2]}</td>
                      </tr>`
                          )
                          .join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            `,
        }),
        // 59:1303
        buildShell({
            title: 'Декларация о рисках программы долгосрочных сбережений (ПДС)',
            subtitle: '',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            bodyHtml: `
              <div style="position:relative;width:535px;height:770px;">
                <div style="position:absolute;top:30px;left:0;width:368px;font-size:18px;line-height:20px;color:#212121;">
                  Декларация о рисках программы долгосрочных сбережений (ПДС)
                </div>
                <div style="position:absolute;top:100px;left:0;background:#722257;color:#fff;padding:12px;border-radius:8px 8px 0 0;font-size:16px;line-height:1.2;">
                  1. Инфляционный риск
                </div>
                <div style="position:absolute;top:143px;left:0;width:535px;border:1px solid #722257;border-radius:0 8px 8px 8px;padding:16px 12px;font-size:12px;line-height:1.24;color:#212121;">
                  <p style="font-size:14px;margin-bottom:12px;">Суть риска:</p>
                  <p style="margin-bottom:12px;">В финансовом плане учтен прогноз по инфляции, однако фактическая инфляция может оказаться выше или ниже запланированной. Это создает следующие риски:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>Если инфляция выше ожидаемой: снижение реальной доходности инвестиций, уменьшение покупательной способности сбережений, рост расходов сверх запланированного бюджета.</li>
                    <li>Если инфляция ниже ожидаемой: возможное избыточное накопление ликвидности в одной цели и недофинансирование других целей.</li>
                  </ul>
                  <p style="font-size:14px;margin-bottom:12px;">Меры снижения риска:</p>
                  <p style="margin-bottom:12px;">Регулярный пересмотр финансового плана (раз в полгода) с корректировкой:</p>
                  <ul style="padding-left:24px;margin:0;">
                    <li>Прогноза инфляции с учетом актуальных данных.</li>
                    <li>Стоимости цели.</li>
                    <li>Индексации пополнения.</li>
                  </ul>
                </div>
              </div>
            `,
        }),
        // 59:1335
        buildShell({
            title: '2. Риск банкротства НПФ',
            subtitle: '',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            bodyHtml: `
              <div style="position:relative;width:535px;height:770px;">
                <div style="position:absolute;top:30px;left:0;background:#722257;color:#fff;padding:12px;border-radius:8px 8px 0 0;font-size:16px;line-height:1.2;">
                  2. Риск банкротства НПФ
                </div>
                <div style="position:absolute;top:73px;left:0;width:535px;border:1px solid #722257;border-radius:0 8px 8px 8px;padding:16px 12px;font-size:12px;line-height:1.24;color:#212121;">
                  <p style="font-size:14px;margin-bottom:12px;">Суть риска:</p>
                  <p style="margin-bottom:12px;">НПФ — это организация, управляющая пенсионными накоплениями и выплатами клиентов. Теоретически существует риск его банкротства, что может привести к:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>Заморозке или задержке выплат пенсионных накоплений.</li>
                    <li>Потере капитала.</li>
                    <li>Частичной потере инвестиционного дохода (если фонд работал с высокорисковыми активами).</li>
                    <li>Необходимости перевода пенсионных прав в другой фонд (если ЦБ отзывает лицензию).</li>
                  </ul>
                  <p style="font-size:14px;margin-bottom:12px;">Факторы, снижающие вероятность риска:</p>
                  <p style="margin-bottom:12px;">1. Жесткий государственный контроль:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>ЦБ РФ регулирует деятельность НПФ, устанавливает требования к капиталу и инвестиционным портфелям.</li>
                    <li>Обязательное размещение резервов в консервативные активы (гособлигации, высоконадежные корпоративные облигации).</li>
                    <li>Система гарантирования пенсионных накоплений.</li>
                  </ul>
                  <p style="margin-bottom:12px;">2. Система гарантирования пенсионных накоплений:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>Агентство по страхованию вкладов (АСВ) гарантирует возврат до 2,8 млн руб. в случае отзыва лицензии у НПФ.</li>
                    <li>Если накопления превышают эту сумму, остаток может быть восстановлен в другом фонде.</li>
                  </ul>
                  <p style="margin-bottom:12px;">3. Ограничения на рискованные инвестиции:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>НПФ не могут вкладывать средства в высокорисковые активы (акции с низкой ликвидностью, криптовалюты, производные инструменты).</li>
                    <li>Основная часть портфеля — ОФЗ, корпоративные облигации 1-2 эшелона, банковские депозиты.</li>
                  </ul>
                  <p style="font-size:14px;margin-bottom:12px;">Меры снижения риска:</p>
                  <ul style="padding-left:24px;margin:0;">
                    <li>Выбор НПФ с высоким рейтингом надежности (по данным ЦБ, рейтинговых агентств).</li>
                    <li>Контроль за изменениями в регулировании (новые законы, требования ЦБ).</li>
                    <li>Открытие нескольких счетов ПДС в разных фондах.</li>
                  </ul>
                </div>
              </div>
            `,
        }),
        // 59:1419
        buildShell({
            title: '3. Риск дефолта государства по облигациям федерального займа (ОФЗ)',
            subtitle: '',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            bodyHtml: `
              <div style="position:relative;width:535px;height:770px;">
                <div style="position:absolute;top:30px;left:0;background:#722257;color:#fff;padding:10px 12px;border-radius:8px 8px 0 0;font-size:16px;line-height:1.2;">
                  3. Риск дефолта государства<br/>по облигациям федерального займа (ОФЗ)
                </div>
                <div style="position:absolute;top:88px;left:0;width:535px;border:1px solid #722257;border-radius:0 8px 8px 8px;padding:16px 12px;font-size:12px;line-height:1.1;color:#212121;">
                  <p style="font-size:14px;margin-bottom:12px;">Суть риска:</p>
                  <p style="margin-bottom:12px;">Дефолт по ОФЗ — это отказ Министерства финансов РФ исполнять обязательства по выплате купонного дохода или погашению номинала облигаций.</p>
                  <p style="font-size:14px;margin-bottom:12px;">Факторы, влияющие на вероятность дефолта:</p>
                  <p style="margin-bottom:12px;">1. Уровень госдолга:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>Отношение госдолга к ВВП России (~20% в 2024 г.) существенно ниже критических уровней (для сравнения: США — ~120%, Япония — ~260%).</li></ul>
                  <p style="margin-bottom:12px;">2. Платежеспособность государства:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>Основные источники погашения: нефтегазовые доходы, налоговые поступления.</li><li>Наличие золотовалютных резервов.</li></ul>
                  <p style="margin-bottom:12px;">3. Ограничения на рискованные инвестиции:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>НПФ не могут вкладывать средства в высокорисковые активы (акции с низкой ликвидностью, криптовалюты, производные инструменты).</li><li>Основная часть портфеля — ОФЗ, корпоративные облигации 1-2 эшелона, банковские депозиты.</li></ul>
                  <p style="font-size:14px;margin-bottom:12px;">Факторы снижения риска:</p>
                  <p style="margin-bottom:12px;">1. Суверенная денежная эмиссия:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>Россия выпускает ОФЗ в национальной валюте (рубли).</li><li>Технически может всегда напечатать деньги для погашения долга (риск — гиперинфляция, но не дефолт).</li></ul>
                  <p style="margin-bottom:12px;">2. Структура держателей ОФЗ:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>Основные владельцы — российские банки, НПФ, страховые компании и ЦБ РФ (>70%).</li><li>Низкая зависимость от иностранных кредиторов.</li></ul>
                  <p style="margin-bottom:12px;">3. Политические факторы:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>Дефолт разрушит доверие к финансовой системе.</li><li>Власти будут любой ценой избегать формального дефолта.</li></ul>
                  <p style="font-size:14px;margin-bottom:12px;">Вывод:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>Вероятность дефолта: Минимальная.</li><li>Основная защита: Фактическая невозможность дефолта в национальной валюте при сохранении контроля над денежной эмиссией.</li></ul>
                  <p style="margin:0;">Для российских инвесторов ОФЗ остаются инструментом с максимальной надежностью в рублевом сегменте. Альтернативы с сопоставимым уровнем защиты капитала отсутствуют (депозиты в банках считаются чуть менее надежными, чем ОФЗ).</p>
                </div>
              </div>
            `,
        }),
        // 59:1363
        buildShell({
            title: '4. Риски инвестирования в акции российских компаний',
            subtitle: '',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            bodyHtml: `
              <div style="position:relative;width:535px;height:770px;">
                <div style="position:absolute;top:30px;left:0;background:#722257;color:#fff;padding:12px;border-radius:8px 8px 0 0;font-size:16px;line-height:1.2;">
                  4. Риски инвестирования<br/>в акции российских компаний
                </div>
                <div style="position:absolute;top:92px;left:0;width:535px;border:1px solid #722257;border-radius:0 8px 8px 8px;padding:16px 12px;font-size:12px;line-height:1.24;color:#212121;">
                  <p style="font-size:14px;margin-bottom:12px;">Суть риска:</p>
                  <p style="margin-bottom:12px;">НПФ могут вкладывать средства в акции только в пределах, установленных Банком России.</p>
                  <p style="margin-bottom:12px;">Основные риски:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>Рыночная волатильность — стоимость акций может резко снижаться из-за экономических кризисов, санкций или ухудшения финансовых показателей компаний.</li>
                    <li>Ограниченная диверсификация — из-за регуляторных ограничений НПФ не могут свободно распределять активы между разными секторами.</li>
                    <li>Низкая ликвидность отдельных бумаг — некоторые акции могут быть труднореализуемыми при необходимости срочного выхода.</li>
                  </ul>
                  <p style="font-size:14px;margin-bottom:12px;">Факторы, снижающие риск:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>Жесткие требования ЦБ — НПФ могут вкладывать только в акции крупных и ликвидных компаний (голубые фишки, индекс МосБиржи).</li></ul>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>Лимиты на долю акций — обычно не более 7% портфеля, что ограничивает потенциальные потери.</li></ul>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>Диверсификация портфеля акций — инвестирование в акции разных компаний из различных секторов экономики (финансы, нефтегаз, IT, потребительские товары и др.).</li></ul>
                  <p style="font-size:14px;margin-bottom:12px;">Вывод:</p>
                  <p style="margin:0;">НПФ при инвестировании в акции компаний применяют комплексный подход к управлению рисками, сочетая диверсификацию, строгий отбор эмитентов, соблюдение регуляторных ограничений и использование защитных стратегий. Основная цель — минимизировать потери при рыночных колебаниях, обеспечивая при этом долгосрочный рост пенсионных накоплений. За счет консервативной инвестиционной политики и контроля со стороны Банка России НПФ снижают вероятность значительных убытков, сохраняя баланс между доходностью и надежностью.</p>
                </div>
              </div>
            `,
        }),
        // 59:1391
        buildShell({
            title: '5. Риски инвестирования НПФ в корпоративные облигации',
            subtitle: '',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            bodyHtml: `
              <div style="position:relative;width:535px;height:770px;">
                <div style="position:absolute;top:30px;left:0;background:#722257;color:#fff;padding:12px;border-radius:8px 8px 0 0;font-size:16px;line-height:1.2;">
                  5. Риски инвестирования НПФ<br/>в корпоративные облигации
                </div>
                <div style="position:absolute;top:92px;left:0;width:535px;border:1px solid #722257;border-radius:0 8px 8px 8px;padding:16px 12px;font-size:12px;line-height:1.24;color:#212121;">
                  <p style="font-size:14px;margin-bottom:12px;">Основные риски:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>Кредитный риск — вероятность дефолта эмитента и невыплаты купонов/номинала.</li>
                    <li>Риск ликвидности — сложность продажи бумаг без потери стоимости.</li>
                    <li>Процентный риск — снижение рыночной цены облигаций при росте ключевой ставки.</li>
                  </ul>
                  <p style="font-size:14px;margin-bottom:12px;">Факторы снижения рисков НПФ:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>Отбор эмитентов с высоким кредитным рейтингом.</li>
                    <li>Диверсификация по секторам/эмитентам.</li>
                    <li>Контроль дюрации (сроков погашения).</li>
                    <li>Соблюдение нормативов ЦБ РФ.</li>
                    <li>Мониторинг ликвидности и макроэкономической ситуации.</li>
                  </ul>
                  <p style="font-size:14px;margin-bottom:12px;">Вывод:</p>
                  <p style="margin:0;">НПФ минимизируют риски за счет консервативного подхода и регулирования, сохраняя баланс между доходностью и надежностью.</p>
                </div>
              </div>
            `,
        }),
        ...(() => {
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
            } else {
                chunks.push([{ date: null, replenishment: 0, tax_deduction: 0, cofinancing: 0, total_capital: 0 }]);
            }

            return chunks.map((chunk, idx) =>
                buildShell({
                    title: 'График достижения целей',
                    subtitle: '',
                    logoSrc: logoFromSettings,
                    bgSrc,
                    showTop: false,
                    pagePaddingTop: 0,
                    bodyHtml: buildMonthlyPlanBodyHtml({
                        rows: chunk,
                        isFirstPage: idx === 0,
                        avatarSrc: rostechAvatar59Src || cardImg,
                    }),
                })
            );
        })(),
    ];
}

module.exports = { buildRostechPensionPagesHtml };

