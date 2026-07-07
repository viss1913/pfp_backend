const path = require('path');
const { resolveGoalCardImageSrc } = require('../../summary/buildSummaryOverviewHtml');
const { resolveReportRasterRef } = require('../../../utils/reportRasterSrc');
const { resolveRostechStyleReportBranding } = require('./rostechStyleReportBranding');

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
    if (!Number.isFinite(n)) return 'тАФ';
    return `${Math.round(n).toLocaleString('ru-RU')} ╤А╤Г╨▒.`;
}

function moneyPerMonth(v) {
    const m = money(v);
    return m === 'тАФ' ? m : `${m}/╨╝╨╡╤Б.`;
}

function moneyWithPrecision(v, digits = 2) {
    const n = Number(v);
    if (!Number.isFinite(n)) return 'тАФ';
    return `${n.toLocaleString('ru-RU', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    })} ╤А╤Г╨▒.`;
}

function getCofinancingRateTextByIncome(monthlyIncome) {
    const income = Number(monthlyIncome);
    if (!Number.isFinite(income) || income <= 0) return '50 ╨║╨╛╨┐.';
    if (income < 80000) return '1 ╤А╤Г╨▒.';
    if (income <= 150000) return '50 ╨║╨╛╨┐.';
    return '25 ╨║╨╛╨┐.';
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
        toNum(first.cofinancing);
    const kEnd = toNum(rows[rows.length - 1].total_capital);
    const replenishmentSum = rows.reduce((sum, row) => sum + toNum(row.replenishment), 0);
    const taxSum = rows.reduce((sum, row) => sum + toNum(row.tax_deduction), 0);
    const cofinancingSum = rows.reduce((sum, row) => sum + toNum(row.cofinancing), 0);
    const investmentIncome = kEnd - k0 - replenishmentSum - cofinancingSum;

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

function isScheduleInitialLumpRow(row) {
    return Boolean(row && String(row.schedule_row_kind || '').toUpperCase() === 'INITIAL_LUMP');
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
        toNum(first.cofinancing);
    const replenishmentSum = schedule.reduce((sum, row) => sum + toNum(row.replenishment), 0);
    return Math.max(initialFromSchedule + replenishmentSum, 0);
}

function formatMonthYearRu(value) {
    if (!value) return 'тАФ';
    const d = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return 'тАФ';
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    return `${mm}.${yyyy} ╨│.`;
}

function buildMonthlyPlanBodyHtml({ rows, isFirstPage, avatarSrc }) {
    const tableTop = isFirstPage ? 210 : 80;
    const tableHeight = isFirstPage ? 510 : 640;
    const rowCells = rows
        .map(
            (row) => `
            <div style="display:grid;grid-template-columns:78px 96px 90px 104px 109px;column-gap:16px;align-items:center;">
              <div style="font-size:10px;line-height:20px;color:#000;white-space:nowrap;">${esc(formatMonthYearRu(row.date))}</div>
              <div style="font-size:10px;line-height:20px;color:#000;white-space:nowrap;">${esc(money(row.replenishment || 0))}</div>
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
          ╨У╤А╨░╤Д╨╕╨║ ╨┤╨╛╤Б╤В╨╕╨╢╨╡╨╜╨╕╤П ╤Ж╨╡╨╗╨╡╨╣${isFirstPage ? '' : ' (╨┐╤А╨╛╨┤╨╛╨╗╨╢╨╡╨╜╨╕╨╡)'}
        </div>
        ${
            isFirstPage
                ? `<div style="position:absolute;left:0;top:80px;width:535px;display:flex;align-items:flex-start;justify-content:space-between;">
          <div style="position:relative;width:60px;height:68px;border-radius:8px;background:linear-gradient(152.116deg, rgb(252, 237, 242) 0%, rgb(229, 239, 248) 120.41%);overflow:hidden;flex-shrink:0;">
            <img src="${esc(avatarSrc)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" />
          </div>
          <div style="flex:1;margin-left:17px;padding:10px 27px 10px 10px;border:1px solid #f1f1f1;border-radius:8px;">
            <div style="font-size:12px;line-height:15px;color:#000;">
              ╨н╤В╨╛ ╨Т╨░╤И ╨│╤А╨░╤Д╨╕╨║ ╨┤╨╛╤Б╤В╨╕╨╢╨╡╨╜╨╕╤П ╤Ж╨╡╨╗╨╡╨╣. ╨Ю╨▒╤А╨░╤В╨╕╤В╨╡ ╨▓╨╜╨╕╨╝╨░╨╜╨╕╨╡, ╤З╤В╨╛ ╨▓ ╤А╨╡╨░╨╗╤М╨╜╨╛╤Б╤В╨╕ ╤Ж╨╕╤Д╤А╤Л ╨▒╤Г╨┤╤Г╤В ╨╛╤В╨╗╨╕╤З╨░╤В╤М╤Б╤П ╨╛╤В ╤В╨╡╤Е, ╤З╤В╨╛ ╨Т╤Л ╨▓╨╕╨┤╨╕╤В╨╡ ╨▓ ╤В╨░╨▒╨╗╨╕╤Ж╨╡. ╨в╨╛╤З╨╜╨╛ ╨┐╨╛╤Б╤З╨╕╤В╨░╤В╤М ╨▒╤Г╨┤╤Г╤Й╨╡╨╡ ╨╛╤З╨╡╨╜╤М ╨╕ ╨╛╤З╨╡╨╜╤М ╤Б╨╗╨╛╨╢╨╜╨╛. ╨Э╨╛ ╨╡╤Б╨╗╨╕ ╤Б╨╛╤Б╤В╨░╨▓╨╗╤П╤В╤М ╤Д╨╕╨╜╨░╨╜╤Б╨╛╨▓╤Л╨╣ ╨┐╨╗╨░╨╜ ╤Е╨╛╤В╤П ╨▒╤Л ╤А╨░╨╖ ╨▓ ╨│╨╛╨┤ ╨╕ ╨║╨╛╤А╤А╨╡╨║╤В╨╕╤А╨╛╨▓╨░╤В╤М ╨╡╨│╨╛ ╤Б ╤Г╤З╨╡╤В╨╛╨╝ ╨╜╨╛╨▓╤Л╤Е ╨┤╨░╨╜╨╜╤Л╤Е ╨┐╨╛ ╨┤╨╛╤Е╨╛╨┤╨╜╨╛╤Б╤В╤П╨╝, ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╕, ╤Б╤В╨╛╨╕╨╝╨╛╤Б╤В╨╕ ╤Ж╨╡╨╗╨╕, ╤В╨╛ ╨┤╨╛╤Б╤В╨╕╨╢╨╡╨╜╨╕╨╡ ╤Ж╨╡╨╗╨╡╨╣ ╤Б╤В╨░╨╜╨╛╨▓╨╕╤В╤Б╤П ╨│╨╛╤А╨░╨╖╨┤╨╛ ╨▒╨╛╨╗╨╡╨╡ ╨▓╨╡╤А╨╛╤П╤В╨╜╤Л╨╝!
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
            <div style="font-size:10px;font-weight:600;line-height:12px;color:#000;">╨Ф╨░╤В╨░</div>
            <div style="font-size:10px;font-weight:600;line-height:12px;color:#000;">╨Я╨╛╨┐╨╛╨╗╨╜╨╡╨╜╨╕╨╡</div>
            <div style="font-size:10px;font-weight:600;line-height:12px;color:#000;">╨Э╨░╨╗╨╛╨│╨╛╨▓╤Л╨╣ ╨▓╤Л╤З╨╡╤В</div>
            <div style="font-size:10px;font-weight:600;line-height:12px;color:#000;">╨б╨╛╤Д╨╕╨╜╨░╨╜╤Б╨╕╤А╨╛╨▓╨░╨╜╨╕╨╡</div>
            <div style="font-size:10px;font-weight:600;line-height:12px;color:#000;">╨Ш╤В╨╛╨│╨╛╨▓╤Л╨╣ ╨║╨░╨┐╨╕╤В╨░╨╗</div>
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
    footerText = '╨Э╨Я╨д ╨а╨╛╤Б╤В╨╡╤Е тАв ╨У╨╛╤Б╨┐╨╡╨╜╤Б╨╕╤П',
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
      <div style="white-space:nowrap;">╨б╤В╤А╨░╨╜╨╕╤Ж╨░ PDF</div>
    </div>
  </div>
</body>
</html>`;
}

async function buildRostechPensionPagesHtmlLegacy({ goal, clientName, options = {} }) {
    const root = path.join(__dirname, '../../../..');
    const inlineLocalAssets = Boolean(options.inlineLocalAssets);
    const brand = resolveRostechStyleReportBranding(options.projectId);
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
    const rostechLogo59Src = brand.useRostechLogo
        ? await resolveReportRasterRef(
              'assets/reports/rostech/rostech-logo-59-51-lite.webp',
              root,
              root,
              inlineLocalAssets
          )
        : '';
    const tenantLogoSrc = rostechLogo59Src || logoFromSettings || '';
    const startPdsUrl = brand.startPdsUrl;
    const pageFooter = brand.footerPension;

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

    const rawTitle = String(goal?.goal_name || '╨Ф╨╛╤Б╤В╨╛╨╣╨╜╨░╤П ╨┐╨╡╨╜╤Б╨╕╤П').trim();
    const title = /╨│╨╛╤Б╨┐╨╡╨╜╤Б╨╕/i.test(rawTitle) ? '╨Ф╨╛╤Б╤В╨╛╨╣╨╜╨░╤П ╨┐╨╡╨╜╤Б╨╕╤П' : rawTitle;
    const displayRetirementYear =
        Number.isFinite(yearsToPension) && yearsToPension > 0
            ? currentReportYear + yearsToPension
            : Number.isFinite(retirementYear) && retirementYear > 0
              ? retirementYear
              : currentReportYear;
    const clientFirstName = String(clientName || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)[0] || '╨Ъ╨╗╨╕╨╡╨╜╤В';
    const commonIntro = `
      <div class="card">
        <div style="display:flex; gap:10px; align-items:flex-start;">
          <img src="${esc(rostechAvatar59Src || cardImg)}" alt="" style="width:60px;height:68px;object-fit:cover;border-radius:8px;" />
          <div style="font-size:13px;line-height:1.45; flex:1;">
            <b>${esc(title)}</b><br/>
            ${esc(clientName || '╨Ъ╨╗╨╕╨╡╨╜╤В')}, ╨┤╨╛ ╨┐╨╡╨╜╤Б╨╕╨╕ ${Number.isFinite(yearsToPension) ? yearsToPension : 'тАФ'} ╨╗╨╡╤В.
            ╨п ╨┐╨╛╨┤╨│╨╛╤В╨╛╨▓╨╕╨╗╨░ ╨┤╨╡╤В╨░╨╗╤М╨╜╤Л╨╣ ╨┐╨╗╨░╨╜ ╨┤╨╗╤П ╤Д╨╛╤А╨╝╨╕╤А╨╛╨▓╨░╨╜╨╕╤П ╨┤╨╛╤Б╤В╨╛╨╣╨╜╨╛╨╣ ╨┐╨╡╨╜╤Б╨╕╨╕.
          </div>
        </div>
      </div>
    `;
    const pensionIntroCard59290 = `
      <div style="display:flex;gap:12px;align-items:flex-start;margin-top:12px;">
        <img src="${esc(rostechAvatar59Src || cardImg)}" alt="" style="width:70px;height:80px;object-fit:cover;border-radius:10px;flex-shrink:0;" />
        <div style="flex:1;border:1px solid #e2e2e2;border-radius:12px;background:#fff;padding:10px 12px;">
          <div style="font-size:22px;line-height:1.25;color:#212121;font-weight:400;margin-bottom:8px;">╨Ф╨╛╤Б╤В╨╛╨╣╨╜╨░╤П ╨┐╨╡╨╜╤Б╨╕╤П</div>
          <div style="display:flex;gap:14px;align-items:flex-start;">
            <img src="${esc(rostechGoal59Src || cardImg)}" alt="" style="width:145px;height:82px;object-fit:cover;border-radius:10px;flex-shrink:0;" />
            <div style="font-size:13px;line-height:1.3;color:#424242;">
              ${esc(clientFirstName)}, ╨Т╨░╤И╨░ ╨▒╤Г╨┤╤Г╤Й╨░╤П ╨Ф╨╛╤Б╤В╨╛╨╣╨╜╨░╤П ╨┐╨╡╨╜╤Б╨╕╤П ╨▒╤Г╨┤╨╡╤В ╤Б╨║╨╗╨░╨┤╤Л╨▓╨░╤В╤М╤Б╤П ╨╕╨╖ 2-╤Е ╤З╨░╤Б╤В╨╡╨╣: ╨У╨╛╤Б╨┐╨╡╨╜╤Б╨╕╤П ╨╕ ╨┤╨╛╨┐╨╛╨╗╨╜╨╕╤В╨╡╨╗╤М╨╜╤Л╨╣ ╨┤╨╛╤Е╨╛╨┤, ╨║╨╛╤В╨╛╤А╤Л╨╣ ╨╝╤Л ╤Б ╨Т╨░╨╝╨╕ ╨┐╨╗╨░╨╜╨╕╤А╤Г╨╡╨╝ ╤Б╨╛╨╖╨┤╨░╤В╤М.<br/><br/>
              ╨Ф╨░╨▓╨░╨╣╤В╨╡ ╨╜╨░╤З╨╜╨╡╨╝ ╤Б ╨┐╤А╨╛╨│╨╜╨╛╨╖╨░ ╨У╨╛╤Б╨┐╨╡╨╜╤Б╨╕╨╕.
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
            options?.clientAvgMonthlyIncome ??
            options?.overallPlan?.avg_monthly_income,
        110000
    );
    const cofinancingRateText = getCofinancingRateTextByIncome(currentIncomeMonthly);
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

    // 15 ╨║╨░╨┤╤А╨╛╨▓ ╨┐╨╛ ╨╖╨░╨┤╨░╨╜╨╜╤Л╨╝ node-id (╨╛╤Д╨╗╨░╨╣╨╜-╨▓╨╡╤А╤Б╨╕╤П ╨▒╨╡╨╖ ╨╖╨░╨▓╨╕╤Б╨╕╨╝╨╛╤Б╤В╨╡╨╣ ╨╛╤В Figma URLs).
    return [
        // 59:28
        buildShell({
            title: '╨Т╨░╤И ╤Д╨╕╨╜╨░╨╜╤Б╨╛╨▓╤Л╨╣ ╨┐╨╗╨░╨╜',
            subtitle: '',
            logoSrc: tenantLogoSrc,
            bgSrc,
            useBackground: false,
            footerText:
                '╨д╨╕╨╜╨░╨╜╤Б╨╛╨▓╤Л╨╣ ╨┐╨╗╨░╨╜ ╨╜╨╡ ╤П╨▓╨╗╤П╨╡╤В╤Б╤П ╨║╨╛╨╝╨╝╨╡╤А╤З╨╡╤Б╨║╨╕╨╝ ╨┐╤А╨╡╨┤╨╗╨╛╨╢╨╡╨╜╨╕╨╡╨╝ ╨╕╨╗╨╕ ╨┤╨╛╨│╨╛╨▓╨╛╤А╨╛╨╝,\n╨╜╨╛╤Б╨╕╤В ╨╕╤Б╨║╨╗╤О╤З╨╕╤В╨╡╨╗╤М╨╜╨╛ ╨╕╨╜╤Д╨╛╤А╨╝╨░╤Ж╨╕╨╛╨╜╨╜╤Л╨╣ ╤Е╨░╤А╨░╨║╤В╨╡╤А.',
            footerLogoSrc: tenantLogoSrc,
            bodyHtml: `
              <div style="display:flex;gap:10px;align-items:flex-start;">
                <img src="${esc(rostechAvatar59Src || cardImg)}" alt="" style="width:60px;height:68px;object-fit:cover;border-radius:8px;flex-shrink:0;" />
                <div style="flex:1;min-width:0;background:#fff;border:1px solid #f1f1f1;border-radius:10px;padding:10px;">
                  <div style="font-size:13px;line-height:14px;color:#212121;">
                    ╨п ╨┐╨╛╨┤╨│╨╛╤В╨╛╨▓╨╕╨╗╨░ ╨┤╨╡╤В╨░╨╗╤М╨╜╤Л╨╣ ╨┐╨╗╨░╨╜ ╨┤╨╗╤П ╨┤╨╛╤Б╤В╨╕╨╢╨╡╨╜╨╕╤П ╨▓╨░╤И╨╡╨╣ ╤Д╨╕╨╜╨░╨╜╤Б╨╛╨▓╨╛╨╣ ╤Ж╨╡╨╗╨╕.<br/><br/>
                    ╨Т╨░╤И ╤В╨╡╨║╤Г╤Й╨╕╨╣ ╨┤╨╛╤Е╨╛╨┤ тАФ ${esc(money(currentIncomeMonthly))}/╨╝╨╡╤Б. ╨┐╨╛╤Б╨╗╨╡ ╨▓╤Л╤З╨╡╤В╨░ ╨Э╨Ф╨д╨Ы.<br/><br/>
                    ╨Т╨░╤И╨░ ╤Д╨╕╨╜╨░╨╜╤Б╨╛╨▓╨░╤П ╤Ж╨╡╨╗╤М:
                  </div>
                  <div style="display:flex;gap:24px;align-items:flex-start;margin-top:12px;">
                    <img src="${esc(rostechGoal59Src || cardImg)}" alt="" style="width:120px;height:70px;object-fit:cover;border-radius:8px;flex-shrink:0;" />
                    <div style="font-size:13px;line-height:14px;color:#212121;">
                      <b>1. ${esc(title)}</b><br/><br/>
                      ╨б╤В╨░╤А╤В ╨▓╤Л╨┐╨╗╨░╤В тАФ ${displayRetirementYear} ╨│.<br/>
                      ╨Ц╨╡╨╗╨░╨╡╨╝╨░╤П ╨┐╨╡╨╜╤Б╨╕╤П тАФ ${esc(moneyPerMonth(targetPresent))}
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
                  ╨а╨╛╤Б╤В ╤Б╤В╨╛╨╕╨╝╨╛╤Б╤В╨╕ ╤Ж╨╡╨╗╨╕ ╤Б ╤Г╤З╨╡╤В╨╛╨╝ ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╕
                </div>

                <div style="display:flex;justify-content:space-evenly;align-items:flex-end;gap:38px;padding-top:8px;">
                  <div style="width:190px;text-align:center;">
                    <div style="font-size:16px;font-weight:400;line-height:18px;">${esc(moneyPerMonth(targetPresent))}</div>
                    <div style="height:62px;width:53px;background:#8f8f8c;margin:8px auto 0;"></div>
                    <div style="margin-top:12px;font-size:14px;line-height:16px;color:#212121;">╨Ц╨╡╨╗╨░╨╡╨╝╨░╤П ╨┐╨╡╨╜╤Б╨╕╤П<br/>╨▓ ╤Б╨╡╨│╨╛╨┤╨╜╤П╤И╨╜╨╕╤Е ╨┤╨╡╨╜╤М╨│╨░╤Е</div>
                  </div>
                  <div style="width:220px;text-align:center;">
                    <div style="font-size:16px;font-weight:400;line-height:18px;">${esc(moneyPerMonth(projectedFuture))}</div>
                    <div style="height:104px;width:53px;background:#722257;margin:8px auto 0;"></div>
                    <div style="margin-top:12px;font-size:14px;line-height:16px;color:#212121;">╨Ц╨╡╨╗╨░╨╡╨╝╨░╤П ╨┐╨╡╨╜╤Б╨╕╤П ╨▓ ${displayRetirementYear} ╨│.<br/>╤Б ╤Г╤З╨╡╤В╨╛╨╝ ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╕ 5,6% ╨▓ ╨│╨╛╨┤</div>
                  </div>
                </div>
              </div>
            `,
        }),
        // 59:285
        buildShell({
            title: '╨Ф╨╛╤Б╤В╨╛╨╣╨╜╨░╤П ╨┐╨╡╨╜╤Б╨╕╤П',
            subtitle: '╨Я╤А╨╛╨│╨╜╨╛╨╖ ╨У╨╛╤Б╨┐╨╡╨╜╤Б╨╕╨╕',
            logoSrc: tenantLogoSrc,
            bgSrc,
            footerText: pageFooter,
            showTop: false,
            pagePaddingTop: 14,
            bodyHtml: `
              <div style="margin-top:4px;">${pensionIntroCard59290}</div>
              <div style="font-size:14px;line-height:1.25;font-weight:700;color:#212121;margin:12px 0 8px;">╨Я╤А╨╛╨│╨╜╨╛╨╖ ╨У╨╛╤Б╨┐╨╡╨╜╤Б╨╕╨╕</div>
              <div class="card" style="margin-bottom:14px;">
                <div style="font-size:13px;line-height:1.5;">
                  ╨б ╤Г╤З╨╡╤В╨╛╨╝ ╨Т╨░╤И╨╡╨│╨╛ ╨▓╨╛╨╖╤А╨░╤Б╤В╨░ ╨╕ ╨╖╨░╤А╨┐╨╗╨░╤В╤Л, ╨┐╨╛ ╨╝╨╛╨╡╨╝╤Г ╨┐╤А╨╛╨│╨╜╨╛╨╖╤Г ╨Т╤Л ╨▒╤Г╨┤╨╡╤В╨╡ ╨┐╨╛╨╗╤Г╤З╨░╤В╤М <b>${esc(moneyPerMonth(statePensionMonthlyToday))}</b> ╨▓ ╤Б╨╡╨│╨╛╨┤╨╜╤П╤И╨╜╨╕╤Е ╨┤╨╡╨╜╤М╨│╨░╤Е,
                  ╨░ ╤Б ╤Г╤З╨╡╤В╨╛╨╝ ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╕ ╤Н╤В╨░ ╤Б╤Г╨╝╨╝╨░ ╤Б╨╛╤Б╤В╨░╨▓╨╕╤В <b>${esc(moneyPerMonth(statePensionMonthlyFuture))}</b>.<br/><br/>
                  ╨С╨╛╨╗╨╡╨╡ ╨┐╨╛╨┤╤А╨╛╨▒╨╜╤Г╤О ╨╝╨╡╤В╨╛╨┤╨╕╨║╤Г ╤А╨░╤Б╤З╨╡╤В╨░ ╤П ╨┤╨╛╨▒╨░╨▓╨╕╨╗╨░ ╨╜╨░ ╤Б╤В╤А. 7.
                </div>
              </div>
              <div class="card" style="border-color:#a95b8d;margin-top:0;margin-bottom:14px;">
                <div style="display:flex;justify-content:space-between;gap:24px;align-items:flex-end;">
                  <div style="flex:1;text-align:center;">
                    <div style="font-size:18px;font-weight:700;line-height:1.2;">${esc(moneyPerMonth(statePensionMonthlyToday))}</div>
                    <div style="height:${chartTodayBarHeight}px;width:48px;background:#000000;margin:10px auto 0;"></div>
                    <div class="muted" style="margin-top:10px;">╨Я╤А╨╛╨│╨╜╨╛╨╖ ╨│╨╛╤Б╨┐╨╡╨╜╤Б╨╕╨╕ ╨▓<br/>╤Б╨╡╨│╨╛╨┤╨╜╤П╤И╨╜╨╕╤Е ╨┤╨╡╨╜╤М╨│╨░╤Е</div>
                  </div>
                  <div style="flex:1;text-align:center;">
                    <div style="font-size:18px;font-weight:700;line-height:1.2;">${esc(moneyPerMonth(statePensionMonthlyFuture))}</div>
                    <div style="height:${chartFutureBarHeight}px;width:48px;background:#722257;margin:10px auto 0;"></div>
                    <div class="muted" style="margin-top:10px;">╨Я╤А╨╛╨│╨╜╨╛╨╖ ╨│╨╛╤Б╨┐╨╡╨╜╤Б╨╕╨╕ ╨▓ ${Number.isFinite(retirementYear) && retirementYear > 0 ? retirementYear : '╨▒╤Г╨┤╤Г╤Й╨╡╨╝'} ╨│.<br/>╤Б ╤Г╤З╨╡╤В╨╛╨╝ ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╕ ${esc(Number.isFinite(inflationRate) && inflationRate > 0 ? `${inflationRate.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%` : 'тАФ')}</div>
                  </div>
                </div>
              </div>
              <div style="margin-top:0;font-size:13px;line-height:1.45;color:#212121;">
                ╨Ъ╨░╨║ ╨▓╨╕╨┤╨╕╤В╨╡, ╨┤╨╗╤П ╨┤╨╛╤Б╤В╨╛╨╣╨╜╨╛╨╣ ╨┐╨╡╨╜╤Б╨╕╨╕ ╨╜╨╡ ╤Е╨▓╨░╤В╨░╨╡╤В ${esc(moneyPerMonth(pensionGapToday))} ╨▓ ╤Б╨╡╨│╨╛╨┤╨╜╤П╤И╨╜╨╕╤Е ╨┤╨╡╨╜╤М╨│╨░╤Е,
                ╨░ ╤Б ╤Г╤З╨╡╤В╨╛╨╝ ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╕ ╨╜╤Г╨╢╨╜╨╛ ╤Б╨╛╨╖╨┤╨░╤В╤М ╨┐╨╗╨░╨╜ ╨┤╨╗╤П ╨┐╨╛╨╗╤Г╤З╨╡╨╜╨╕╤П ╨┤╨╛╨┐╨╛╨╗╨╜╨╕╤В╨╡╨╗╤М╨╜╨╛╨│╨╛ ╨╡╨╢╨╡╨╝╨╡╤Б╤П╤З╨╜╨╛╨│╨╛ ╨┤╨╛╤Е╨╛╨┤╨░ ╨▓ ╤А╨░╨╖╨╝╨╡╤А╨╡ ${esc(moneyPerMonth(pensionGapFuture))}.
              </div>
            `,
        }),
        // 59:132
        buildShell({
            title: '╨Я╤А╨╡╨┤╨╗╨░╨│╨░╨╡╨╝╤Л╨╣ ╨┐╨╗╨░╨╜',
            subtitle: '╨У╤А╨░╤Д╨╕╨║ ╤Д╨╛╤А╨╝╨╕╤А╨╛╨▓╨░╨╜╨╕╤П ╨┐╨╡╨╜╤Б╨╕╨╛╨╜╨╜╨╛╨│╨╛ ╨║╨░╨┐╨╕╤В╨░╨╗╨░',
            logoSrc: tenantLogoSrc,
            bgSrc,
            footerText: pageFooter,
            showTop: false,
            pagePaddingTop: 16,
            bodyHtml: `
              <div style="display:flex;gap:10px;align-items:flex-start;">
                <img src="${esc(rostechAvatar59Src || cardImg)}" alt="" style="width:56px;height:64px;object-fit:cover;border-radius:10px;flex-shrink:0;" />
                <div style="flex:1;border:1px solid #e2e2e2;border-radius:10px;background:#fff;padding:8px 10px;">
                  <div style="font-size:12px;line-height:1.25;color:#424242;">
                    ╨Ш╤В╨░╨║, ╤П ╨┤╨╛╨▒╨░╨▓╨╕╨╗╨░ ╨▓ ╨┐╨╗╨░╨╜ ╤Б╨╛╨╖╨┤╨░╨╜╨╕╨╡ ╨┤╨╛╨┐╨╛╨╗╨╜╨╕╤В╨╡╨╗╤М╨╜╨╛╨│╨╛ ╨╡╨╢╨╡╨╝╨╡╤Б╤П╤З╨╜╨╛╨│╨╛ ╨┤╨╛╤Е╨╛╨┤╨░ - ${esc(moneyPerMonth(pensionGapToday))} ╨▓ ╤Б╨╡╨│╨╛╨┤╨╜╤П╤И╨╜╨╕╤Е ╨┤╨╡╨╜╤М╨│╨░╤Е
                  </div>
                  <div style="display:flex;gap:10px;align-items:flex-start;margin-top:6px;">
                    <img src="${esc(rostechGoal59Src || cardImg)}" alt="" style="width:100px;height:58px;object-fit:cover;border-radius:8px;flex-shrink:0;filter:grayscale(100%);" />
                    <div style="font-size:12px;line-height:1.28;color:#424242;">
                      ╨Ф╨░╤В╨░ ╨┤╨╛╤Б╤В╨╕╨╢╨╡╨╜╨╕╤П тАФ ${displayRetirementYear} ╨│.<br/><br/>
                      ╨Ф╨╛╨┐╨╛╨╗╨╜╨╕╤В╨╡╨╗╤М╨╜╤Л╨╣ ╨╡╨╢╨╡╨╝╨╡╤Б╤П╤З╨╜╤Л╨╣ ╨┤╨╛╤Е╨╛╨┤ ╤Б ╤Г╤З╨╡╤В╨╛╨╝ ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╕ (${esc(Number.isFinite(inflationRate) && inflationRate > 0 ? `${inflationRate.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%` : '5,6%')}) - ${esc(moneyPerMonth(pensionGapFuture))}
                    </div>
                  </div>
                </div>
              </div>
              <div style="font-size:11px;line-height:1.33;color:#212121;margin-top:10px;">
                <b>╨Я╤А╨╡╨┤╨╗╨░╨│╨░╨╡╨╝╤Л╨╣ ╨┐╨╗╨░╨╜:</b><br/>
                <br/>
                ${esc(brand.pdsContractStep)}<br/>
                ╨Я╨╗╤О╤Б╤Л:<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;тАв ╨У╨╛╤Б╤Г╨┤╨░╤А╤Б╤В╨▓╨╛ ╨▒╤Г╨┤╨╡╤В ╨┤╨╛╨▒╨░╨▓╨╗╤П╤В╤М ╨┤╨╛ 36 000 ╤А╤Г╨▒./╨│╨╛╨┤ ╨▓ ╤В╨╡╤З╨╡╨╜╨╕╨╡ 10 ╨╗╨╡╤В.<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;тАв ╨Э╨░╨╗╨╛╨│╨╛╨▓╤Л╨╡ ╨▓╤Л╤З╨╡╤В╤Л (╨┤╨╛ 22% ╨▓ ╨│╨╛╨┤ ╤Б╨╛ ╨▓╨╖╨╜╨╛╤Б╨╛╨▓ ╨▓ ╨┐╤А╨╡╨┤╨╡╨╗╨░╤Е 400 000 ╤А╤Г╨▒.).<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;тАв ╨Ъ╨░╨┐╨╕╤В╨░╨╗ ╨╖╨░╤Б╤В╤А╨░╤Е╨╛╨▓╨░╨╜ (╨┤╨╛ 2,8 ╨╝╨╗╨╜ ╤А╤Г╨▒.).<br/>
                <br/>
                2. ╨Ф╨░╨╗╤М╨╜╨╡╨╣╤И╨╕╨╡ ╤И╨░╨│╨╕:<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;тАв ╨Т╨╜╨╡╤Б╤В╨╕ ╨┐╨╡╤А╨▓╨╛╨╜╨░╤З╨░╨╗╤М╨╜╤Л╨╣ ╨║╨░╨┐╨╕╤В╨░╨╗ - ${esc(money(planFacts.initialCapital))}.<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;тАв ╨Т ╤Б╨╗╨╡╨┤╤Г╤О╤Й╨╕╨╡ ╨╝╨╡╤Б╤П╤Ж╤Л ╨┐╨╛╨┐╨╛╨╗╨╜╤П╤В╤М ╨┐╨╛ ${esc(money(planFacts.monthlyContribution))}.<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;тАв ╨Я╨╛╨╗╤Г╤З╨╕╤В╤М ${esc(money(planFacts.cofinancingAmount))} ╨▓ ${planFacts.cofinancingYear || nextCalendarYear} ╨│╨╛╨┤╤Г ╨╛╤В ╨│╨╛╤Б╤Г╨┤╨░╤А╤Б╤В╨▓╨░.<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;тАв ╨Т ${planFacts.taxDeductionYear || nextCalendarYear} ╨│. ╨┐╨╛╨┤╨░╤В╤М ╨╜╨░ ╨╜╨░╨╗╨╛╨│╨╛╨▓╤Л╨╣ ╨▓╤Л╤З╨╡╤В ${esc(moneyWithPrecision(planFacts.taxDeductionAmount, 2))} (╤А╨░╤Б╤Б╤З╨╕╤В╨░╨╜ ╨┐╨╛ ╤Б╤В╨░╨▓╨║╨╡ 13% ╨Э╨Ф╨д╨Ы).<br/>
                <span style="color:#722257;font-weight:700;">&nbsp;&nbsp;&nbsp;&nbsp;тАв ╨Я╤А╨╛╨│╨╜╨╛╨╖╨╕╤А╤Г╨╡╨╝╨░╤П ╨┤╨╛╤Е╨╛╨┤╨╜╨╛╤Б╤В╤М ╤Б ╤Г╤З╨╡╤В╨╛╨╝ ╤Б╨╛╤Д╨╕╨╜╨░╨╜╤Б╨╕╤А╨╛╨▓╨░╨╜╨╕╤П, ╨╜╨░╨╗╨╛╨│╨╛╨▓╨╛╨│╨╛ ╨▓╤Л╤З╨╡╤В╨░, ╨┤╨╛╤Е╨╛╨┤╨╜╨╛╤Б╤В╨╕ ╨╛╤В ╨╕╨╜╨▓╨╡╤Б╤В╨╕╤Ж╨╕╨╣ ╨╖╨░ ${highlightedYieldYear} ╨│╨╛╨┤ - ${esc(highlightedYieldPercent.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}% ╨│╨╛╨┤╨╛╨▓╤Л╤Е.</span><br/>
                &nbsp;&nbsp;&nbsp;&nbsp;тАв ╨Р╨║╤В╤Г╨░╨╗╨╕╨╖╨╕╤А╨╛╨▓╨░╤В╤М ╤Д╨╕╨╜╨░╨╜╤Б╨╛╨▓╤Л╨╣ ╨┐╨╗╨░╨╜ ╤З╨╡╤А╨╡╨╖ 6 ╨╝╨╡╤Б.<br/>
                <br/>
                3. ╨Ъ╨░╨║ ╤А╨░╤Б╤В╨╡╤В ╨║╨░╨┐╨╕╤В╨░╨╗?<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;тАв ╨Ч╨░ ╤Б╤З╨╡╤В ╨┐╨╛╨┐╨╛╨╗╨╜╨╡╨╜╨╕╤П, ╤Б╨╛╤Д╨╕╨╜╨░╨╜╤Б╨╕╤А╨╛╨▓╨░╨╜╨╕╤П, ╨╕╨╜╨▓╨╡╤Б╤В╨╕╤Ж╨╕╨╛╨╜╨╜╨╛╨│╨╛ ╨┤╨╛╤Е╨╛╨┤╨░ ╨Т╤Л ╨╜╨░╨║╨╛╨┐╨╕╤В╨╡ ${esc(money(totalCapital))}.<br/>
                ╨Т ╨╜╨░╤И╨╡╨╝ ╨┐╨╗╨░╨╜╨╡ ╨╝╤Л ╤Г╤З╨╕╤В╤Л╨▓╨░╨╡╨╝, ╤З╤В╨╛ ╨Т╤Л, ╨▓╤Л╨╣╨┤╤П ╨╜╨░ ╨┐╨╡╨╜╤Б╨╕╤О ╨▓ ${displayRetirementYear} ╨│╨╛╨┤╤Г, ╨╜╨░╨║╨╛╨┐╨╗╨╡╨╜╨╜╤Л╨╣ ╨║╨░╨┐╨╕╤В╨░╨╗ ╤А╨░╨╖╨╝╨╡╤Б╤В╨╕╤В╨╡ ╨╜╨░ ╨┤╨╡╨┐╨╛╨╖╨╕╤В╨░╤Е ╨╕/╨╕╨╗╨╕ ╨▓ ╨╛╨▒╨╗╨╕╨│╨░╤Ж╨╕╤П╤Е ╨╕ ╨▒╤Г╨┤╨╡╤В╨╡ ╨┐╨╛╨╗╤Г╤З╨░╤В╤М ╨╡╨╢╨╡╨╝╨╡╤Б╤П╤З╨╜╤Л╨╣ ╨┤╨╛╤Е╨╛╨┤ ╨▓ ╨▓╨╕╨┤╨╡ ╨┐╤А╨╛╤Ж╨╡╨╜╤В╨╛╨▓. ╨б╨╡╨╣╤З╨░╤Б ╤Б╤А╨╡╨┤╨╜╤П╤П ╤Б╤В╨░╨▓╨║╨░ ╨┐╨╛ ╨┤╨╡╨┐╨╛╨╖╨╕╤В╨░╨╝ ╨▓ ╨▒╨░╨╜╨║╨░╤Е 13,86%, ╨╜╨╛ ╨▓ ╨╜╨░╤И╨╡╨╝ ╨┐╨╗╨░╨╜╨╡ ╨╝╤Л ╨╖╨░╨║╨╗╨░╨┤╤Л╨▓╨░╨╡╨╝ ╨┤╨╛╤Е╨╛╨┤╨╜╨╛╤Б╤В╤М ╨▓ ${displayRetirementYear} ╨│. ╨▓ ╤А╨░╨╖╨╝╨╡╤А╨╡ ${esc((Number.isFinite(payoutYieldPercent) ? payoutYieldPercent : 12).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }))}% ╨│╨╛╨┤╨╛╨▓╤Л╤Е ╨╕╨╗╨╕ ${esc((Number.isFinite(payoutYieldMonthlyPercent) ? payoutYieldMonthlyPercent : 1).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }))}% ╨▓ ╨╝╨╡╤Б╤П╤Ж, ╤З╤В╨╛ ╨┐╨╛ ╨╜╨░╤И╨╡╨╝╤Г ╨┐╨╗╨░╨╜╤Г ╨╕ ╨▒╤Г╨┤╨╡╤В ╤А╨░╨▓╨╜╨╛ ${esc(moneyPerMonth(projectedFuture))}.
              </div>
              <div style="margin-top:12px;font-size:10px;line-height:1.15;color:#212121;text-align:center;font-weight:700;">
                ╨У╤А╨░╤Д╨╕╨║ ╤Д╨╛╤А╨╝╨╕╤А╨╛╨▓╨░╨╜╨╕╤П ╨┐╨╡╨╜╤Б╨╕╨╛╨╜╨╜╨╛╨│╨╛<br/>╨║╨░╨┐╨╕╤В╨░╨╗╨░ ╤Б ╤Г╤З╨╡╤В╨╛╨╝ ╨┐╨╛╨┐╨╛╨╗╨╜╨╡╨╜╨╕╤П:
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
                <span><span style="display:inline-block;width:8px;height:8px;background:#9f9f9f;border-radius:2px;vertical-align:middle;margin-right:5px;"></span>╨б╨╛╨▒╤Б╤В╨▓╨╡╨╜╨╜╤Л╨╡ ╤Б╤А╨╡╨┤╤Б╤В╨▓╨░</span>
                <span><span style="display:inline-block;width:8px;height:8px;background:#000000;border-radius:2px;vertical-align:middle;margin-right:5px;"></span>╨Я╤А╨╛╤Ж╨╡╨╜╤В╨╜╤Л╨╣ ╨┤╨╛╤Е╨╛╨┤ ╨╕ ╤Б╨╛╤Д╨╕╨╜╨░╨╜╤Б╨╕╤А╨╛╨▓╨░╨╜╨╕╨╡</span>
                <span><span style="display:inline-block;width:8px;height:8px;background:#722257;border-radius:2px;vertical-align:middle;margin-right:5px;"></span>╨Ш╤В╨╛╨│╨╛ ╨║╨░╨┐╨╕╤В╨░╨╗</span>
              </div>
              <div style="margin-top:12px;border:1px solid #8a2d69;border-radius:8px;padding:6px 10px;text-align:center;font-size:16px;line-height:1.15;color:#722257;font-weight:700;">
                ╨а╨░╤Б╤З╨╡╤В╨╜╨░╤П ╨┤╨╛╤Е╨╛╨┤╨╜╨╛╤Б╤В╤М ╨Т╨░╤И╨╡╨│╨╛ ╨┐╨╗╨░╨╜╨░ ╨╜╨░ ╨▓╨╡╤Б╤М ╤Б╤А╨╛╨║ - ${esc((Number.isFinite(accumulationYieldPercent) && accumulationYieldPercent > 0 ? accumulationYieldPercent : totalYieldPercent).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 2 }))}% ╨│╨╛╨┤╨╛╨▓╤Л╤Е
              </div>
            `,
        }),
        // 59:397
        buildShell({
            title: '╨б╤В╤А╤Г╨║╤В╤Г╤А╨░ ╨┐╨╛╤А╤В╤Д╨╡╨╗╤П ╨Э╨Я╨д',
            subtitle: '╨Ъ╨╛╨╜╤Б╨╡╤А╨▓╨░╤В╨╕╨▓╨╜╤Л╨╣ ╨┐╤А╨╛╤Д╨╕╨╗╤М ╤Б ╨║╨╛╨╜╤В╤А╨╛╨╗╨╡╨╝ ╤А╨╕╤Б╨║╨░',
            logoSrc: tenantLogoSrc,
            bgSrc,
            footerText: pageFooter,
            showTop: false,
            pagePaddingTop: 18,
            bodyHtml: `
              <div style="display:flex;gap:8px;align-items:flex-start;">
                <img src="${esc(rostechAvatar59Src || cardImg)}" alt="" style="width:56px;height:66px;object-fit:cover;border-radius:9px;flex-shrink:0;" />
                <div style="flex:1;border:1px solid #dddddd;border-radius:10px;background:#fff;padding:8px 10px;">
                  <div style="font-size:11px;line-height:1.25;color:#2f2f2f;">
                    ╨е╨╛╤В╨╡╨╗╨░ ╨▒╤Л ╨╛╤В╨╝╨╡╤В╨╕╤В╤М, ╤З╤В╨╛ ╨│╨╛╤Б╤Г╨┤╨░╤А╤Б╤В╨▓╨╛ ╤Б╨╗╨╡╨┤╨╕╤В ╨╖╨░ ╤Б╤В╤А╤Г╨║╤В╤Г╤А╨╛╨╣ ╨╕╨╜╨▓╨╡╤Б╤В╨╕╤А╨╛╨▓╨░╨╜╨╕╤П ╨Т╨░╤И╨╕╤Е ╤Б╤А╨╡╨┤╤Б╤В╨▓.
                    ╨Т╨╛╤В ╤Г╤Б╤А╨╡╨┤╨╜╨╡╨╜╨╜╤Л╨╣ ╨┐╨╛╤А╤В╤Д╨╡╨╗╤М, ╨║╤Г╨┤╨░ ╨Э╨Я╨д ╨╝╨╛╨╢╨╡╤В ╨▓╨║╨╗╨░╨┤╤Л╨▓╨░╤В╤М ╨Т╨░╤И╨╕ ╨┤╨╡╨╜╤М╨│╨╕:
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
                        <div><span style="display:inline-block;width:7px;height:7px;background:#7e2a67;border-radius:50%;margin-right:6px;vertical-align:middle;"></span>╨С╨░╨╜╨║╨╛╨▓╤Б╨║╨╕╨╡ ╨┤╨╡╨┐╨╛╨╖╨╕╤В╤Л</div>
                        <div><span style="display:inline-block;width:7px;height:7px;background:#eff2f5;border-radius:50%;margin-right:6px;vertical-align:middle;"></span>╨Ю╨д╨Ч</div>
                        <div><span style="display:inline-block;width:7px;height:7px;background:#a1167f;border-radius:50%;margin-right:6px;vertical-align:middle;"></span>╨Ъ╨╛╤А╨┐╨╛╤А╨░╤В╨╕╨▓╨╜╤Л╨╡ ╨╛╨▒╨╗╨╕╨│╨░╤Ж╨╕╨╕ ╨Р+</div>
                        <div><span style="display:inline-block;width:7px;height:7px;background:#b9b9b9;border-radius:50%;margin-right:6px;vertical-align:middle;"></span>╨Ь╤Г╨╜╨╕╤Ж╨╕╨┐╨░╨╗╤М╨╜╤Л╨╡ ╨╛╨▒╨╗╨╕╨│╨░╤Ж╨╕╨╕ ╨д+</div>
                        <div><span style="display:inline-block;width:7px;height:7px;background:#1f2025;border-radius:50%;margin-right:6px;vertical-align:middle;"></span>╨Р╨║╤Ж╨╕╨╕</div>
                        <div><span style="display:inline-block;width:7px;height:7px;background:#f8f8f8;border:1px solid #dedede;border-radius:50%;margin-right:6px;vertical-align:middle;"></span>╨Э╨░╨╗╨╕╤З╨╜╤Л╨╡</div>
                      </div>
                    </div>
                    <div style="margin-top:8px;font-size:13px;line-height:1.15;color:#3a3a3a;">
                      ╨Я╤А╨╛╨│╨╜╨╛╨╖╨╕╤А╤Г╨╡╨╝╤Л╨╣ ╨┤╨╛╤Е╨╛╨┤ - ${esc((Number.isFinite(accumulationYieldPercent) && accumulationYieldPercent > 0 ? accumulationYieldPercent : totalYieldPercent).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))}%
                    </div>
                  </div>
                  <div style="font-size:11px;line-height:1.24;color:#343434;">
                    ╨Ъ╨░╨║ ╨▓╨╕╨┤╨╕╤В╨╡, ╨┤╨╛╨╗╤П ╤А╨╕╤Б╨║╨╛╨▓╤Л╤Е ╨░╨║╤В╨╕╨▓╨╛╨▓ (╨░╨║╤Ж╨╕╨╣) ╨╜╨╡ ╨▒╨╛╨╗╨╡╨╡ 7%.<br/>
                    ${esc(brand.portfolioYieldNote)}<br/>
                    ╨Ш╤В╨░╨║, ╨╡╤Б╨╗╨╕ ╨Т╤Л ╨╜╨░╤З╨╜╨╡╤В╨╡ ╨┐╨╛╨┐╨╛╨╗╨╜╤П╤В╤М ╨║╨░╨┐╨╕╤В╨░╨╗ ╨╜╨░ ${esc(money(planFacts.monthlyContribution))} ╨▓ ╤Н╤В╨╛╨╝ ╨│╨╛╨┤╤Г, ╨╕ ╨▒╤Г╨┤╨╡╤В╨╡ ╨╕╨╜╨┤╨╡╨║╤Б╨╕╤А╨╛╨▓╨░╤В╤М ╨┐╨╛╨┐╨╛╨╗╨╜╨╡╨╜╨╕╨╡ ╨╜╨░ ╨▓╨╡╨╗╨╕╤З╨╕╨╜╤Г ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╕, ╤В╨╛ ╨╖╨░ ╤Б╤З╨╡╤В ╨┐╤А╨╛╤Ж╨╡╨╜╤В╨╛╨▓ ╨Т╤Л ╨╜╨░╨║╨╛╨┐╨╕╤В╨╡ ${esc(money(totalCapital))} ╨║ ╨╝╨╛╨╝╨╡╨╜╤В╤Г ╨▓╤Л╤Е╨╛╨┤╨░ ╨╜╨░ ╨┐╨╡╨╜╤Б╨╕╤О.
                  </div>
                  <div style="margin-top:8px;border-radius:9px;overflow:hidden;height:92px;background:#f0f0f0;">
                    <img src="${esc(rostechGoal59Src || cardImg)}" alt="" style="width:100%;height:100%;object-fit:cover;filter:grayscale(100%);" />
                  </div>
                  <div style="margin-top:8px;font-size:10px;line-height:1.2;color:#343434;">
                    ╨Я╨╛ ╨╖╨░╨║╨╛╨╜╤Г ╨Т╤Л ╤Б╨╝╨╛╨╢╨╡╤В╨╡ ╨╖╨░╨▒╤А╨░╤В╤М ╨▓╨╡╤Б╤М ╨║╨░╨┐╨╕╤В╨░╨╗, ╨╡╤Б╨╗╨╕ ╤Б╤А╨╛╨║ ╨╜╨░╨║╨╛╨┐╨╗╨╡╨╜╨╕╨╣ ╤Б╨╛╤Б╤В╨░╨▓╨╕╨╗ 15 ╨╗╨╡╤В
                    ╨╕╨╗╨╕ ╨Т╤Л ╨┤╨╛╤Б╤В╨╕╨│╨╗╨╕ 55 (╨Ц) 60 (╨Ь), ╨▓ ╨╖╨░╨▓╨╕╤Б╨╕╨╝╨╛╤Б╤В╨╕ ╨╛╤В ╤В╨╛╨│╨╛, ╤З╤В╨╛ ╨╜╨░╤Б╤В╤Г╨┐╨╕╨╗╨╛ ╤А╨░╨╜╤М╤И╨╡.
                  </div>

                  <div style="margin-top:8px;border:1px solid #dddddd;border-radius:10px;background:#fff;padding:7px 8px;">
                    <div style="border:1px solid #9f3e76;border-radius:10px;padding:6px 8px;text-align:center;font-size:13px;line-height:1.2;font-weight:700;color:#7e2a67;">
                      ╨Ф╨╛╨┐╨╛╨╗╨╜╨╕╤В╨╡╨╗╤М╨╜╤Л╨╣ ╨╡╨╢╨╡╨╝╨╡╤Б╤П╤З╨╜╤Л╨╣ ╨┤╨╛╤Е╨╛╨┤ = ${esc(money(totalCapital))} x ${esc((Number.isFinite(payoutYieldMonthlyPercent) ? payoutYieldMonthlyPercent : 1).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }))}% = ${esc(moneyPerMonth(additionalIncomeFuture))}
                    </div>
                    <div style="margin-top:6px;font-size:11px;line-height:1.2;font-weight:700;color:#212121;">
                      ╨б ╤Г╤З╨╡╤В╨╛╨╝ ╨╖╨░╨╗╨╛╨╢╨╡╨╜╨╜╨╛╨╣ ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╕ ${esc(Number.isFinite(inflationRate) && inflationRate > 0 ? `${inflationRate.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}` : '5,6')}%/╨│╨╛╨┤,
                      ╤Н╤В╨╛ ╤Н╨║╨▓╨╕╨▓╨░╨╗╨╡╨╜╤В╨╜╨╛ ${esc(moneyPerMonth(additionalIncomeToday))} ╤Б╨╡╨│╨╛╨┤╨╜╤П.
                    </div>

                    <div style="margin-top:6px;border:1px solid #e4e4e4;border-radius:10px;padding:5px;background:#f9f9f9;">
                      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid #ebebeb;border-radius:8px;overflow:hidden;background:#fff;">
                        <div style="padding:6px 7px;font-size:9px;color:#666;border-right:1px solid #efefef;border-bottom:1px solid #efefef;">╨в╨╕╨┐ ╨┤╨╛╤Е╨╛╨┤╨░</div>
                        <div style="padding:6px 7px;font-size:9px;color:#666;border-right:1px solid #efefef;border-bottom:1px solid #efefef;">╨Т ╤Б╨╡╨│╨╛╨┤╨╜╤П╤И╨╜╨╕╤Е ╨┤╨╡╨╜╤М╨│╨░╤Е</div>
                        <div style="padding:6px 7px;font-size:9px;color:#666;border-bottom:1px solid #efefef;">╨б ╤Г╤З╨╡╤В╨╛╨╝ ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╕</div>

                        <div style="padding:6px 7px;font-size:12px;line-height:1.2;color:#2d2d2d;border-right:1px solid #efefef;">╨У╨╛╤Б╨┐╨╡╨╜╤Б╨╕╤П<br/>╨Ф╨╛╨┐╨╛╨╗╨╜╨╕╤В╨╡╨╗╤М╨╜╤Л╨╣ ╨┤╨╛╤Е╨╛╨┤</div>
                        <div style="padding:6px 7px;font-size:12px;line-height:1.2;color:#2d2d2d;border-right:1px solid #efefef;">${esc(moneyPerMonth(statePensionMonthlyToday))}<br/>${esc(moneyPerMonth(additionalIncomeToday))}</div>
                        <div style="padding:6px 7px;font-size:12px;line-height:1.2;color:#2d2d2d;">${esc(moneyPerMonth(statePensionMonthlyFuture))}<br/>${esc(moneyPerMonth(additionalIncomeFuture))}</div>

                        <div style="padding:6px 7px;font-size:12px;font-weight:700;color:#2d2d2d;border-top:1px solid #efefef;border-right:1px solid #efefef;">╨Ш╤В╨╛╨│╨╛:</div>
                        <div style="padding:6px 7px;font-size:12px;font-weight:700;color:#2d2d2d;border-top:1px solid #efefef;border-right:1px solid #efefef;">${esc(moneyPerMonth(targetPresent))}</div>
                        <div style="padding:6px 7px;font-size:12px;font-weight:700;color:#2d2d2d;border-top:1px solid #efefef;">${esc(moneyPerMonth(projectedFuture))}</div>
                      </div>
                    </div>
                    <div style="display:flex;justify-content:center;margin-top:6px;">
                      <a href="${esc(startPdsUrl)}" style="display:inline-block;background:#7f1f67;color:#fff;border-radius:12px;padding:5px 22px;font-size:14px;line-height:1;font-weight:700;text-decoration:none;">
                        ╨Э╨░╤З╨░╤В╤М
                      </a>
                    </div>
                    <div style="margin-top:6px;font-size:8px;color:#555;line-height:1.15;">
                      ╨д╨╕╨╜╨░╨╜╤Б╨╛╨▓╤Л╨╣ ╨┐╨╗╨░╨╜ ╨╜╨╡ ╤П╨▓╨╗╤П╨╡╤В╤Б╤П ╨║╨╛╨╝╨╝╨╡╤А╤З╨╡╤Б╨║╨╕╨╝ ╨┐╤А╨╡╨┤╨╗╨╛╨╢╨╡╨╜╨╕╨╡╨╝ ╨╕╨╗╨╕ ╨┤╨╛╨│╨╛╨▓╨╛╤А╨╛╨╝, ╨╜╨╛╤Б╨╕╤В ╨╕╤Б╨║╨╗╤О╤З╨╕╤В╨╡╨╗╤М╨╜╨╛ ╨╕╨╜╤Д╨╛╤А╨╝╨░╤Ж╨╕╨╛╨╜╨╜╤Л╨╣ ╤Е╨░╤А╨░╨║╤В╨╡╤А.
                    </div>
                  </div>
                </div>
              </div>
            `,
        }),
        // 59:314
        buildShell({
            title: '╨Ь╨╡╤В╨╛╨┤╨╕╨║╨░ ╤А╨░╤Б╤З╨╡╤В╨░ ╨У╨╛╤Б╨┐╨╡╨╜╤Б╨╕╨╕',
            subtitle: '╨д╨╕╨║╤Б╨╕╤А╨╛╨▓╨░╨╜╨╜╨░╤П ╨▓╤Л╨┐╨╗╨░╤В╨░ + ╨Ш╨Я╨Ъ ├Ч ╤Б╤В╨╛╨╕╨╝╨╛╤Б╤В╤М ╨Ш╨Я╨Ъ',
            logoSrc: tenantLogoSrc,
            bgSrc,
            footerText: pageFooter,
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
                      ╨Р ╤Б╨░╨╝╨╛╨╡ ╨┐╤А╨╕╤П╤В╨╜╨╛╨╡ ╤В╨╛, ╤З╤В╨╛ ╨│╨╛╤Б╤Г╨┤╨░╤А╤Б╤В╨▓╨╛ ╨┐╨╛╨╝╨╛╨│╨░╨╡╤В ╨Т╨░╨╝ ╤Б╨╛╨╖╨┤╨░╨▓╨░╤В╤М ╤Б╨▓╨╛╨╣ ╨║╨░╨┐╨╕╤В╨░╨╗.
                    </div>
                  </div>
                </div>

                <div style="position:absolute;left:0;top:110px;font-size:13px;line-height:14px;color:#000;">
                  ╨Т╨░╤И ╨┤╨╛╤Е╨╛╨┤ - ${esc(moneyPerMonth(currentIncomeMonthly))}
                </div>

                <div style="position:absolute;left:0;top:136px;width:456px;font-size:13px;line-height:14px;color:#000;">
                  ╨Т ╤Б╨╛╨╛╤В╨▓╨╡╤В╤Б╤В╨▓╨╕╨╕ ╤Б ╤Д╨╡╨┤╨╡╤А╨░╨╗╤М╨╜╤Л╨╝ ╨╖╨░╨║╨╛╨╜╨╛╨╝ тДЦ 75-╨д╨Ч ┬л╨Ю ╨╜╨╡╨│╨╛╤Б╤Г╨┤╨░╤А╤Б╤В╨▓╨╡╨╜╨╜╤Л╤Е ╨┐╨╡╨╜╤Б╨╕╨╛╨╜╨╜╤Л╤Е ╤Д╨╛╨╜╨┤╨░╤Е┬╗, ╨│╨╛╤Б╤Г╨┤╨░╤А╤Б╤В╨▓╨╛ ╨╛╨▒╤П╨╖╤Г╨╡╤В╤Б╤П ╨┤╨╛╨▒╨░╨▓╨╗╤П╤В╤М ╨╡╨╢╨╡╨│╨╛╨┤╨╜╨╛ ${esc(cofinancingRateText)} ╨╜╨░ ╨║╨░╨╢╨┤╤Л╨╣ ╨Т╨░╤И ╤А╤Г╨▒╨╗╤М, ╨╜╨╛ ╨╜╨╡ ╨▒╨╛╨╗╨╡╨╡ 36 000 ╤А╤Г╨▒. ╨▓ ╨│╨╛╨┤ ╨╕╨╖ ╤А╨░╤Б╤З╨╡╤В╨░ ╨▓╤Б╨╡╤Е ╤Б╤Г╨╝╨╝ ╨┐╨╛╨┐╨╛╨╗╨╜╨╡╨╜╨╕╨╣ ╨▓ ╤В╨╡╤З╨╡╨╜╨╕╨╡ ╨┐╤А╨╡╨┤╤Л╨┤╤Г╤Й╨╡╨│╨╛ ╨│╨╛╨┤╨░. ╨Ш ╤В╨░╨║ ╨╜╨░ ╨┐╤А╨╛╤В╤П╨╢╨╡╨╜╨╕╨╕ 10 ╨╗╨╡╤В.
                </div>

                <div style="position:absolute;left:0;top:230px;width:535px;">
                  <div style="height:110px;background:#f3f3f4;border-radius:8px;position:relative;">
                    <div style="position:absolute;left:50%;top:20px;transform:translateX(-50%);font-size:16px;line-height:14px;font-weight:700;color:#722257;">╨Я╨╗╨░╨╜ ╨┐╨╛ ╤Б╨╛╤Д╨╕╨╜╨░╨╜╤Б╨╕╤А╨╛╨▓╨░╨╜╨╕╤О</div>
                    <div style="position:absolute;left:20px;top:54px;display:flex;flex-direction:column;gap:8px;font-size:14px;line-height:14px;color:#000;">
                      <div>╨б╨╛╤Д╨╕╨╜╨░╨╜╤Б╨╕╤А╨╛╨▓╨░╨╜╨╕╨╡ ╨╖╨░ ${nextCalendarYear} ╨│. - ${esc(money(cofinancing2026))}</div>
                      <div>╨Т╤Б╨╡╨│╨╛ ╤Б╨╛╤Д╨╕╨╜╨░╨╜╤Б╨╕╤А╨╛╨▓╨░╨╜╨╕╨╡ - ${esc(money(cofin))}</div>
                    </div>
                  </div>
                </div>

                <div style="position:absolute;left:0;top:360px;width:499px;font-size:13px;line-height:14px;color:#000;">
                  ╨Э╨╛ ╨╕ ╤Н╤В╨╛ ╨╡╤Й╨╡ ╨╜╨╡ ╨▓╤Б╨╡. ╨У╨╛╤Б╤Г╨┤╨░╤А╤Б╤В╨▓╨╛ ╨┤╨░╨╡╤В ╨▓╨╛╨╖╨╝╨╛╨╢╨╜╨╛╤Б╤В╤М ╨┐╨╛╨╗╤Г╤З╨╕╤В╤М ╨╜╨░╨╗╨╛╨│╨╛╨▓╤Л╨╡ ╨▓╤Л╤З╨╡╤В╤Л.<br/>
                  ╨Т ╤Б╨╛╨╛╤В╨▓╨╡╤В╤Б╤В╨▓╨╕╨╕ ╤Б╨╛ ╤Б╤В╨░╤В╤М╨╡╨╣ ╨Э╨Ъ ╨а╨д тДЦ 56 ╨Т╤Л ╨╕╨╝╨╡╨╡╤В╨╡ ╨┐╤А╨░╨▓╨╛ ╨┐╨╛╨╗╤Г╤З╨░╤В╤М ╨▓╨╛╨╖╨▓╤А╨░╤В ╨╜╨░╨╗╨╛╨│╨╛╨▓ ╨╜╨░ ╨┤╨╛╤Е╨╛╨┤╤Л ╤Д╨╕╨╖╨╕╤З╨╡╤Б╨║╨╛╨│╨╛ ╨╗╨╕╤Ж╨░.
                </div>

                <div style="position:absolute;left:0;top:422px;width:535px;">
                  <div style="height:110px;background:#f3f3f4;border-radius:8px;position:relative;">
                    <div style="position:absolute;left:50%;top:20px;transform:translateX(-50%);font-size:16px;line-height:14px;font-weight:700;color:#722257;">╨Э╨░╨╗╨╛╨│╨╛╨▓╨╛╨╡ ╨┐╨╗╨░╨╜╨╕╤А╨╛╨▓╨░╨╜╨╕╨╡</div>
                    <div style="position:absolute;left:20px;top:54px;display:flex;flex-direction:column;gap:8px;font-size:14px;line-height:14px;color:#000;">
                      <div>╨Э╨░╨╗╨╛╨│╨╛╨▓╤Л╨╣ ╨▓╤Л╤З╨╡╤В ╨╖╨░ ${nextCalendarYear} ╨│. - ${esc(money(deduction2026))}</div>
                      <div>╨Т╤Б╨╡╨│╨╛ ╨╜╨░╨╗╨╛╨│╨╛╨▓╤Л╤Е ╨▓╤Л╤З╨╡╤В╨╛╨▓ ╨╖╨░ ╨▓╨╡╤Б╤М ╤Б╤А╨╛╨║ - ${esc(money(taxBenefit))}</div>
                    </div>
                  </div>
                </div>

                <div style="position:absolute;left:0;top:552px;width:535px;">
                  <div style="height:33px;background:#722257;border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:center;">
                    <div style="font-size:16px;line-height:14px;font-weight:600;color:#fff;">╨а╨╡╨╖╤О╨╝╨╡</div>
                  </div>
                  <div style="height:205px;background:#f3f3f4;border-radius:0 0 8px 8px;padding:12px 20px 20px;">
                    <div style="font-size:14px;line-height:14px;color:#000;font-weight:600;margin-bottom:8px;">╨ж╨╡╨╗╤М: ${esc(title)} - ${esc(moneyPerMonth(targetPresent))}</div>
                    <div style="font-size:14px;line-height:14px;color:#000;margin-bottom:8px;">╨Ф╨░╤В╨░ - ${Number.isFinite(retirementYear) && retirementYear > 0 ? retirementYear : 'тАФ'} ╨│.</div>
                    <div style="font-size:14px;line-height:14px;color:#000;margin-bottom:8px;">╨Я╨╡╤А╨▓╨╛╨╜╨░╤З╨░╨╗╤М╨╜╤Л╨╣ ╨║╨░╨┐╨╕╤В╨░╨╗ - ${esc(money(initial))}</div>
                    <div style="font-size:14px;line-height:14px;color:#000;margin-bottom:8px;">╨Я╨╛╨┐╨╛╨╗╨╜╨╡╨╜╨╕╨╡ ╨║╨░╨┐╨╕╤В╨░╨╗╨░ - ${esc(moneyPerMonth(monthly))}</div>
                    <div style="font-size:14px;line-height:14px;color:#000;margin-bottom:8px;">╨Т╤Б╨╡╨│╨╛ ╤Б╨╛╤Д╨╕╨╜╨░╨╜╤Б╨╕╤А╨╛╨▓╨░╨╜╨╕╨╡ - ${esc(money(cofin))}</div>
                    <div style="font-size:14px;line-height:14px;color:#000;margin-bottom:8px;">╨Т╤Б╨╡╨│╨╛ ╨╜╨░╨╗╨╛╨│╨╛╨▓╤Л╤Е ╨▓╤Л╤З╨╡╤В╨╛╨▓ - ${esc(money(taxBenefit))}</div>
                    <div style="height:1px;background:#722257;margin:12px 0;"></div>
                    <div style="font-size:15px;line-height:16px;font-weight:700;color:#000;">╨Я╤А╨╛╨│╨╜╨╛╨╖ ╨┐╨╛ ╨╕╤В╨╛╨│╨╛╨▓╨╛╨╝╤Г ╨║╨░╨┐╨╕╤В╨░╨╗╤Г - ${esc(money(totalCapital))}</div>
                  </div>
                </div>
              </div>
            `,
        }),
        // 59:methodology (╤Б╤В╤А╨░╨╜╨╕╤Ж╨░ 7)
        buildShell({
            title: '╨Ь╨╡╤В╨╛╨┤╨╕╨║╨░ ╤А╨░╤Б╤З╨╡╤В╨░ ╨У╨╛╤Б╨┐╨╡╨╜╤Б╨╕╨╕',
            subtitle: '╨д╨╕╨║╤Б╨╕╤А╨╛╨▓╨░╨╜╨╜╨░╤П ╨▓╤Л╨┐╨╗╨░╤В╨░ + ╨Ш╨Я╨Ъ ├Ч ╤Б╤В╨╛╨╕╨╝╨╛╤Б╤В╤М ╨Ш╨Я╨Ъ',
            logoSrc: tenantLogoSrc,
            bgSrc,
            footerText: pageFooter,
            showTop: false,
            pagePaddingTop: 0,
            bodyHtml: `
              <div style="position:relative;width:535px;height:790px;background:#ffffff;">
                <div style="position:absolute;left:0;top:30px;width:535px;display:flex;gap:10px;align-items:flex-start;">
                  <div style="width:60px;height:68px;flex-shrink:0;border-radius:8px;background:linear-gradient(152.116deg, rgb(252, 237, 242) 0%, rgb(229, 239, 248) 120.41%);overflow:hidden;">
                    <img src="${esc(rostechAvatar59Src || cardImg)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" />
                  </div>
                  <div style="flex:1;min-width:0;border:1px solid #f1f1f1;border-radius:8px;padding:10px;background:#fff;">
                    <div style="font-size:13px;line-height:14px;color:#212121;margin-bottom:12px;">╨Ф╨╛╤Б╤В╨╛╨╣╨╜╨░╤П ╨┐╨╡╨╜╤Б╨╕╤П</div>
                    <div style="display:flex;gap:16px;align-items:flex-start;">
                      <div style="width:120px;height:70px;flex-shrink:0;border-radius:8px;overflow:hidden;">
                        <img src="${esc(rostechGoal59Src || cardImg)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" />
                      </div>
                      <div style="font-size:13px;line-height:14px;color:#212121;flex:1;">
                        ${esc(clientFirstName)}, ╨╖╨┤╨╡╤Б╤М ╤П ╨┐╨╛╨┤╤А╨╛╨▒╨╜╨╛ ╨╛╨┐╨╕╤Б╤Л╨▓╨░╤О ╨╝╨╡╤В╨╛╨┤╨╕╨║╤Г ╤А╨░╤Б╤З╨╡╤В╨░ ╨Т╨░╤И╨╡╨╣ ╨▒╤Г╨┤╤Г╤Й╨╡╨╣ ╨У╨╛╤Б╨┐╨╡╨╜╤Б╨╕╨╕.
                      </div>
                    </div>
                  </div>
                </div>

                <div style="position:absolute;left:0;top:166px;font-weight:600;font-size:13px;line-height:14px;color:#000;">╨Я╤А╨╛╨│╨╜╨╛╨╖ ╨У╨╛╤Б╨┐╨╡╨╜╤Б╨╕╨╕</div>
                <div style="position:absolute;left:0;top:188px;font-size:13px;line-height:14px;color:#212121;">╨Ъ╨░╨║ ╤А╨░╤Б╤Б╤З╨╕╤В╤Л╨▓╨░╨╡╤В╤Б╤П ╨У╨╛╤Б╨┐╨╡╨╜╤Б╨╕╤П?</div>

                <div style="position:absolute;left:0;top:214px;background:#722257;border-radius:8px;padding:10px;width:fit-content;max-width:535px;">
                  <div style="font-size:14px;line-height:13px;color:#fff;">╨У╨╛╤Б╨┐╨╡╨╜╤Б╨╕╤П = ╨д╨╕╨║╤Б╨╕╤А╨╛╨▓╨░╨╜╨╜╨░╤П ╨▓╤Л╨┐╨╗╨░╤В╨░ + (╨Ш╨Я╨Ъ ├Ч ╤Б╤В╨╛╨╕╨╝╨╛╤Б╤В╤М ╨Ш╨Я╨Ъ)</div>
                </div>

                <div style="position:absolute;left:0;top:259px;width:535px;font-size:13px;line-height:14px;color:#212121;">
                  <div style="margin-bottom:3px;"><b>1. ╨д╨╕╨║╤Б╨╕╤А╨╛╨▓╨░╨╜╨╜╨░╤П ╨▓╤Л╨┐╨╗╨░╤В╨░</b></div>
                  <div style="margin-bottom:3px;">
                    ╨д╨╕╨║╤Б╨╕╤А╨╛╨▓╨░╨╜╨╜╨░╤П ╨▓╤Л╨┐╨╗╨░╤В╨░ ╤Б╨╛╤Б╤В╨░╨▓╨╗╤П╨╡╤В ${esc(money(fixedPaymentCurrent))} ╨▓ ╨╝╨╡╤Б╤П╤Ж. ╨Ъ╨░╨╢╨┤╤Л╨╣ ╨│╨╛╨┤ ╨╡╨╡ ╨╕╨╜╨┤╨╡╨║╤Б╨╕╤А╤Г╤О╤В ╤Б ╤Г╤З╨╡╤В╨╛╨╝ ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╕.
                    ╨Х╤Б╨╗╨╕ ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╤П ╨▒╤Г╨┤╨╡╤В ╨▓ ╤Б╤А╨╡╨┤╨╜╨╡╨╝ ${esc(inflationRateForMethodology.toLocaleString('ru-RU', { maximumFractionDigits: 2 }))}% ╨▓ ╨│╨╛╨┤, ╤В╨╛ ╤З╨╡╤А╨╡╨╖ ${yearsForMethodology} ╨╗╨╡╤В ╤Н╤В╨░ ╤З╨░╤Б╤В╤М ╨У╨╛╤Б╨┐╨╡╨╜╤Б╨╕╨╕ ╨▓╤Л╤А╨░╤Б╤В╨╡╤В ╨┤╨╛ ${esc(moneyPerMonth(fixedPaymentFuture))}.
                  </div>
                  <div style="margin-top:3px;margin-bottom:3px;"><b>2. ╨Ш╨╜╨┤╨╕╨▓╨╕╨┤╤Г╨░╨╗╤М╨╜╤Л╨╣ ╨Я╨╡╨╜╤Б╨╕╨╛╨╜╨╜╤Л╨╣ ╨Ъ╨╛╤Н╤Д╤Д╨╕╤Ж╨╕╨╡╨╜╤В (╨Ш╨Я╨Ъ)</b></div>
                  <div style="margin-bottom:3px;">╨Т╨░╨╝ ╨╜╨░╤З╨╕╤Б╨╗╤П╨╡╤В╤Б╤П ╨║╨░╨╢╨┤╤Л╨╣ ╨│╨╛╨┤ ╨╛╨┐╤А╨╡╨┤╨╡╨╗╨╡╨╜╨╜╨╛╨╡ ╨║╨╛╨╗╨╕╤З╨╡╤Б╤В╨▓╨╛ ╨Ш╨Я╨Ъ ╨╖╨░ ╨▓╨╖╨╜╨╛╤Б╤Л ╨Т╨░╤И╨╡╨│╨╛ ╤А╨░╨▒╨╛╤В╨╛╨┤╨░╤В╨╡╨╗╤П ╨▓ ╨б╨╛╤Ж╨╕╨░╨╗╤М╨╜╤Л╨╣ ╨д╨╛╨╜╨┤ ╨а╨╛╤Б╤Б╨╕╨╕.</div>
                  <div style="margin-bottom:3px;">╨з╨╡╨╝ ╨▒╨╛╨╗╤М╤И╨╡ ╤Б╤В╨░╨╢ ╨╕ ╨╖╨░╤А╨┐╨╗╨░╤В╨░ тАФ ╤В╨╡╨╝ ╨▒╨╛╨╗╤М╤И╨╡ ╨╜╨░╨║╨╛╨┐╨╕╤В╨╡ ╨Ш╨Я╨Ъ.</div>
                  <ul style="margin-left:19.5px;margin-bottom:3px;">
                    <li style="line-height:14px;">╨Я╤А╨╕ ╨Т╨░╤И╨╡╨╣ ╨╖╨░╤А╨┐╨╗╨░╤В╨╡ ${esc(moneyPerMonth(currentIncomeMonthly))} ╨╖╨░ ╨│╨╛╨┤ ╨╜╨░╤З╨╕╤Б╨╗╤П╨╡╤В╤Б╤П ~${esc(ipkPerYear.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))} ╨Ш╨Я╨Ъ.</li>
                    <li style="line-height:14px;">╨Ъ ╨┐╨╡╨╜╤Б╨╕╨╕ ╤Г ╨Т╨░╤Б ╨╝╨╛╨╢╨╡╤В ╨╜╨░╨║╨╛╨┐╨╕╤В╤М╤Б╤П ${esc(totalIpk.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }))} ╨Ш╨Я╨Ъ.</li>
                  </ul>
                  <div style="margin-top:3px;margin-bottom:3px;"><b>╨б╨║╨╛╨╗╤М╨║╨╛ ╤Б╤В╨╛╨╕╤В ╨Ш╨Я╨Ъ?</b></div>
                  <div style="margin-bottom:3px;">╨б╤В╨╛╨╕╨╝╨╛╤Б╤В╤М ╨Ш╨Я╨Ъ ╨│╨╛╤Б╤Г╨┤╨░╤А╤Б╤В╨▓╨╛ ╨╕╨╜╨┤╨╡╨║╤Б╨╕╤А╤Г╨╡╤В ╨╜╨░ ╨▓╨╡╨╗╨╕╤З╨╕╨╜╤Г ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╕.</div>
                  <div style="margin-bottom:3px;">╨б╤В╨╛╨╕╨╝╨╛╤Б╤В╤М ╨╛╨┤╨╜╨╛╨│╨╛ ╨Ш╨Я╨Ъ ╨▓ ${nextCalendarYear} ╨│╨╛╨┤╤Г тАФ ${esc(ipkCostCurrent.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))} ╤А╤Г╨▒.</div>
                  <div style="margin-bottom:3px;">╨Х╤Б╨╗╨╕ ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╤П ${esc(inflationRateForMethodology.toLocaleString('ru-RU', { maximumFractionDigits: 2 }))}% ╨▓ ╨│╨╛╨┤, ╤В╨╛ ╤З╨╡╤А╨╡╨╖ ${yearsForMethodology} ╨╗╨╡╤В 1 ╨▒╨░╨╗╨╗ = ${esc(ipkCostFuture.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))} ╤А╤Г╨▒.</div>
                </div>

                <div style="position:absolute;left:0;top:535px;font-size:13px;line-height:14px;color:#212121;">╨в╨░╨║╨╕╨╝ ╨╛╨▒╤А╨░╨╖╨╛╨╝ ╨┐╤А╨╛╨│╨╜╨╛╨╖ ╨Т╨░╤И╨╡╨╣ ╨У╨╛╤Б╨┐╨╡╨╜╤Б╨╕╨╕ ╨▓╤Л╨│╨╗╤П╨┤╨╕╤В ╨▓╨╛╤В ╤В╨░╨║:</div>

                <div style="position:absolute;left:0;top:561px;background:#722257;border-radius:8px;padding:10px;width:fit-content;max-width:535px;">
                  <div style="font-size:14px;line-height:13px;color:#fff;">
                    ╨Т╨░╤И╨░ ╨│╨╛╤Б╨┐╨╡╨╜╤Б╨╕╤П = ${esc(money(fixedPaymentFuture))} + (${esc(totalIpk.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }))} ╨Ш╨Я╨Ъ ├Ч ${esc(ipkCostFuture.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }))} ╤А╤Г╨▒.) = ${esc(moneyPerMonth(statePensionFormulaFuture))}
                  </div>
                </div>

                <div style="position:absolute;left:0;top:606px;width:535px;font-size:13px;line-height:14px;color:#212121;">
                  ╨Э╨╛! ╨Ш╨╖-╨╖╨░ ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╕ ${esc(money(statePensionFormulaFuture))} ╤З╨╡╤А╨╡╨╖ ${yearsForMethodology} ╨╗╨╡╤В тАФ ╤Н╤В╨╛ ╨║╨░╨║ ~${esc(money(methodPensionToday))} ╤Б╨╡╨│╨╛╨┤╨╜╤П, ╨░ ╨Т╨░╤И╨░ ╤Ж╨╡╨╗╤М - ${esc(money(targetPresent))}.
                  ╨в╨░╨║╨╕╨╝ ╨╛╨▒╤А╨░╨╖╨╛╨╝ ╨╜╨░╨╝ ╨╜╤Г╨╢╨╜╨╛ ╤Б╨╛╨╖╨┤╨░╤В╤М ╨┤╨╛╨┐╨╛╨╗╨╜╨╕╤В╨╡╨╗╤М╨╜╤Л╨╣ ╨┤╨╛╤Е╨╛╨┤ ╨▓ ╤А╨░╨╖╨╝╨╡╤А╨╡ ${esc(moneyPerMonth(methodAdditionalIncomeNeeded))}.
                </div>

                <div style="position:absolute;left:0;top:659px;width:535px;height:137px;">
                  <svg viewBox="0 0 535 137" preserveAspectRatio="none" style="position:absolute;top:0;left:0;width:100%;height:100%;">
                    <path d="M8 0.5H527C531.142 0.5 534.5 3.85786 534.5 8V129C534.5 133.142 531.142 136.5 527 136.5H8C3.85787 136.5 0.5 133.142 0.5 129V8L0.509766 7.61426C0.704061 3.77915 3.77915 0.704063 7.61426 0.509766L8 0.5Z" stroke="#722257" fill="none"/>
                  </svg>
                  <div style="position:absolute;left:100px;bottom:0;display:flex;flex-direction:column;align-items:center;gap:4px;width:110px;">
                    <div style="font-size:12px;line-height:13px;color:#212121;white-space:nowrap;margin-bottom:2px;">${esc(moneyPerMonth(targetPresent))}</div>
                    <div style="width:49px;height:${methodTargetBarHeight}px;background:#000;border-radius:4px 4px 0 0;"></div>
                    <div style="font-size:12px;line-height:13px;color:#212121;text-align:center;max-width:130px;">╨Ц╨╡╨╗╨░╨╡╨╝╨░╤П<br/>╨┐╨╡╨╜╤Б╨╕╤П</div>
                  </div>
                  <div style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:4px;width:120px;">
                    <div style="font-size:12px;line-height:13px;color:#212121;white-space:nowrap;margin-bottom:2px;">${esc(moneyPerMonth(methodPensionToday))}</div>
                    <div style="width:49px;height:${methodStateBarHeight}px;background:#722257;border-radius:4px 4px 0 0;"></div>
                    <div style="font-size:12px;line-height:13px;color:#212121;text-align:center;max-width:130px;">╨Я╤А╨╛╨│╨╜╨╛╨╖<br/>╨У╨╛╤Б╨┐╨╡╨╜╤Б╨╕╨╕</div>
                  </div>
                  <div style="position:absolute;left:325px;bottom:0;display:flex;flex-direction:column;align-items:center;gap:4px;width:150px;">
                    <div style="font-size:12px;line-height:13px;color:#212121;white-space:nowrap;margin-bottom:2px;">${esc(moneyPerMonth(methodAdditionalIncomeNeeded))}</div>
                    <div style="width:49px;height:${methodGapBarHeight}px;background:#8f8f8c;border-radius:4px 4px 0 0;"></div>
                    <div style="font-size:12px;line-height:13px;color:#212121;text-align:center;max-width:130px;">╨Э╨╡╨╛╨▒╤Е╨╛╨┤╨╕╨╝╤Л╨╣<br/>╨┤╨╛╨┐╨╛╨╗╨╜╨╕╤В╨╡╨╗╤М╨╜╤Л╨╣<br/>╨┤╨╛╤Е╨╛╨┤</div>
                  </div>
                </div>
              </div>
            `,
        }),
        ...buildRostechStandardTailHtmlPages({
            goal,
            brand,
            logoFromSettings: tenantLogoSrc,
            bgSrc,
            rostechAvatar59Src,
            cardImg,
            footerText: brand.footerMethodologyTail,
        }),
    ];
}


function buildRostechStandardTailHtmlPages({
    goal,
    brand,
    logoFromSettings,
    bgSrc,
    rostechAvatar59Src,
    cardImg,
    footerText,
}) {
    const resolvedFooterText = footerText || brand?.footerPension || '╨Э╨Я╨д ╨а╨╛╤Б╤В╨╡╤Е тАв ╨У╨╛╤Б╨┐╨╡╨╜╤Б╨╕╤П';
    const inflationRiskIntro =
        brand?.inflationRiskIntro ||
        '╨Я╨╗╨░╨╜ ╨╛╨▒╤К╨╡╨┤╨╕╨╜╤П╨╡╤В ╤А╨╡╤И╨╡╨╜╨╕╤П ╨▓ ╨║╨╛╨╜╤В╤Г╤А╨░╤Е ╨Э╨Я╨д ┬л╨а╨╡╨╜╨╡╤Б╤Б╨░╨╜╤Б ╨Э╨░╨║╨╛╨┐╨╗╨╡╨╜╨╕╤П┬╗, ╨╕╨╜╨▓╨╡╤Б╤В╨╕╤Ж╨╕╨╛╨╜╨╜╨╛╨╣ ╨┐╨╗╨░╤В╤Д╨╛╤А╨╝╤Л ┬л╨д╨╕╨╜╨░╨╝┬╗ ╨╕ ╤Б╤В╤А╨░╤Е╨╛╨▓╤Л╤Е ╨┐╤А╨╛╨┤╤Г╨║╤В╨╛╨▓ ┬л╨б╨Ъ ╨а╨╡╨╜╨╡╤Б╤Б╨░╨╜╤Б ╨Ц╨╕╨╖╨╜╤М┬╗. ╨Т╨╛ ╨▓╤Б╨╡╤Е ╨║╨╛╨╜╤В╤Г╤А╨░╤Е ╨╕╤Б╨┐╨╛╨╗╤М╨╖╤Г╨╡╤В╤Б╤П ╨┐╤А╨╛╨│╨╜╨╛╨╖ ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╕, ╨╜╨╛ ╤Д╨░╨║╤В╨╕╤З╨╡╤Б╨║╨░╤П ╨┤╨╕╨╜╨░╨╝╨╕╨║╨░ ╤Ж╨╡╨╜ ╨╝╨╛╨╢╨╡╤В ╨╛╤В╨╗╨╕╤З╨░╤В╤М╤Б╤П ╨╛╤В ╤Б╤Ж╨╡╨╜╨░╤А╨╕╤П. ╨н╤В╨╛ ╤Б╨╛╨╖╨┤╨░╨╡╤В ╤Б╨╗╨╡╨┤╤Г╤О╤Й╨╕╨╡ ╤А╨╕╤Б╨║╨╕:';
    const npfBankruptcyIntro =
        brand?.npfBankruptcyIntro ||
        '╨Ф╨╗╤П ╨┐╨╡╨╜╤Б╨╕╨╛╨╜╨╜╨╛╨╣ ╤З╨░╤Б╤В╨╕ ╨┐╨╗╨░╨╜╨░ ╨╕╤Б╨┐╨╛╨╗╤М╨╖╤Г╨╡╤В╤Б╤П ╨Э╨Я╨д ┬л╨а╨╡╨╜╨╡╤Б╤Б╨░╨╜╤Б ╨Э╨░╨║╨╛╨┐╨╗╨╡╨╜╨╕╤П┬╗. ╨в╨╡╨╛╤А╨╡╤В╨╕╤З╨╡╤Б╨║╨╕ ╤А╨╕╤Б╨║ ╤Д╨╕╨╜╨░╨╜╤Б╨╛╨▓╨╛╨╣ ╨╜╨╡╤Б╤В╨░╨▒╨╕╨╗╤М╨╜╨╛╤Б╤В╨╕ ╤Д╨╛╨╜╨┤╨░ ╨╝╨╛╨╢╨╡╤В ╨┐╤А╨╕╨▓╨╡╤Б╤В╨╕ ╨║:';
    const riskNotebookBgHtml = `
      <div style="position:absolute;inset:0;border-radius:12px;overflow:hidden;z-index:0;">
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(248,241,247,0.55) 0%,rgba(244,248,255,0.55) 100%);"></div>
        <div style="position:absolute;inset:0;background-image:linear-gradient(to right, rgba(114,34,87,0.09) 1px, transparent 1px),linear-gradient(to bottom, rgba(114,34,87,0.09) 1px, transparent 1px);background-size:22px 22px;"></div>
      </div>`;
    return [
        // 59:657
        buildShell({
            footerText: resolvedFooterText,
            title: '╨Т╨░╨╢╨╜╨░╤П ╨Ш╨╜╤Д╨╛╤А╨╝╨░╤Ж╨╕╤П. ╨Ш╨╜╤Д╨╗╤П╤Ж╨╕╤П',
            subtitle: '',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            bodyHtml: `
              <div style="position:relative;width:535px;height:790px;background:#fff;">
                <div style="position:absolute;left:0;top:30px;font-size:18px;font-weight:400;line-height:20px;color:#212121;">
                  ╨Т╨░╨╢╨╜╨░╤П ╨Ш╨╜╤Д╨╛╤А╨╝╨░╤Ж╨╕╤П. ╨Ш╨╜╤Д╨╗╤П╤Ж╨╕╤П
                </div>

                <div style="position:absolute;left:0;top:80px;width:535px;display:flex;gap:17px;align-items:flex-start;">
                  <div style="width:60px;height:68px;flex-shrink:0;border-radius:8px;background:linear-gradient(152.116deg, rgb(252, 237, 242) 0%, rgb(229, 239, 248) 120.41%);overflow:hidden;border:1px solid #f1f1f1;">
                    <img src="${esc(rostechAvatar59Src || cardImg)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" />
                  </div>
                  <div style="flex:1;border:1px solid #f1f1f1;border-radius:8px;padding:10px 27px 10px 10px;">
                    <div style="font-size:13px;line-height:14px;color:#212121;">
                      ╨Ъ╨░╨║ ╨Т╤Л ╨╝╨╛╨╢╨╡╤В╨╡ ╨▓╨╕╨┤╨╡╤В╤М ╨╜╨░ ╨│╤А╨░╤Д╨╕╨║╨╡ ╨╜╨╕╨╢╨╡, ╤Б╤В╨░╨▓╨║╨░ ╨┐╨╛ ╨┤╨╡╨┐╨╛╨╖╨╕╤В╨░╨╝ ╨║╨╛╤А╤А╨╡╨╗╨╕╤А╤Г╨╡╤В ╤Б ╨╜╨░╨▒╨╗╤О╨┤╨░╨╡╨╝╨╛╨╣ ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╡╨╣ ╨а╨╛╤Б╤Б╤В╨░╤В╨░. ╨п ╤Б╤З╨╕╤В╨░╤О, ╤З╤В╨╛ ╨▓ ╨▒╨╗╨╕╨╢╨░╨╣╤И╨╡╨╝ ╨▒╤Г╨┤╤Г╤Й╨╡╨╝ ╤В╤А╨╡╨╜╨┤ ╤Б╨╝╨╡╨╜╨╕╤В╤Б╤П ╨╜╨░ ╤Б╨╜╨╕╨╢╨╡╨╜╨╕╨╡ ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╕, ╨░ ╨╖╨╜╨░╤З╨╕╤В ╨╕ ╨╜╨░╤З╨╜╤Г╤В ╤Б╨╜╨╕╨╢╨░╤В╤М╤Б╤П ╤Б╤В╨░╨▓╨║╨╕ ╨┐╨╛ ╨┤╨╡╨┐╨╛╨╖╨╕╤В╨░╨╝. ╨Я╨╛╤Н╤В╨╛╨╝╤Г ╨▓ ╨╝╨╛╨╕╤Е ╤А╨░╤Б╤З╨╡╤В╨░╤Е ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╤П ╨╕ ╨┤╨╛╤Е╨╛╨┤╨╜╨╛╤Б╤В╤М ╨╖╨░╨▓╨╕╤Б╤П╤В ╨╛╤В ╤Б╤А╨╛╨║╨░ ╨┤╨╛╤Б╤В╨╕╨╢╨╡╨╜╨╕╤П ╤Ж╨╡╨╗╨╕.
                    </div>
                  </div>
                </div>

                <div style="position:absolute;left:50%;top:235px;transform:translateX(-50%);font-size:16px;font-weight:400;line-height:18px;color:#212121;">
                  ╨У╨╛╨┤╨╛╨▓╨░╤П ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╤П
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
                      ${['2016╨│.','2017╨│.','2018╨│.','╨╕╤О╨╗.21','╤Б╨╡╨╜.21','╨╜╨╛╤П╨▒.21','╤П╨╜╨▓.22','╨╝╨░╤А.22','╨╝╨░╨╣ 22','╨╕╤О╨╗.22','╤Б╨╡╨╜.22','╨╜╨╛╤П╨▒.22','╤П╨╜╨▓.23','╨╝╨░╤А.23','╨╝╨░╨╣ 23','╨╕╤О╨╗.23','╤Б╨╡╨╜.23','╨╜╨╛╤П╨▒.23','╤П╨╜╨▓.24','╨╝╨░╤А.24','╨╝╨░╨╣ 24','╨╕╤О╨╗.24','2025╨│.','2030╨│.','2035╨│.'].map((x)=>`<span style="font-size:8px;line-height:13px;color:#212121;white-space:nowrap;writing-mode:vertical-rl;transform:rotate(180deg);text-align:right;width:13px;">${x}</span>`).join('')}
                    </div>
                  </div>
                </div>

                <div style="position:absolute;left:0;top:495px;display:flex;gap:60px;">
                  <div style="display:flex;flex-direction:column;gap:0;">
                    <div style="display:flex;gap:8px;align-items:center;min-height:14px;"><span style="width:28.5px;height:1px;background:#722257;display:inline-block;"></span><span style="font-size:8px;line-height:14px;color:#212121;">╨│╨╛╨┤╨╛╨▓╨░╤П ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╤П ╨▓ ╨╖╨░╨▓╨╕╤Б╨╕╨╝╨╛╤Б╤В╨╕ ╨╛╤В ╨▓╤А╨╡╨╝╨╡╨╜╨╕</span></div>
                    <div style="display:flex;gap:8px;align-items:center;min-height:14px;"><span style="width:28.5px;height:1px;background:#21282B;display:inline-block;"></span><span style="font-size:8px;line-height:14px;color:#212121;">╤Б╤А╨╡╨┤╨╜╤П╤П ╨╝╨░╨║╤Б╨╕╨╝╨░╨╗╤М╨╜╨░╤П ╤Б╤В╨░╨▓╨║╨░ ╨┐╨╛ ╨▓╨║╨╗╨░╨┤╨░╨╝</span></div>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:0;">
                    <div style="display:flex;gap:8px;align-items:center;min-height:14px;"><span style="width:28.5px;height:1px;display:inline-block;background:repeating-linear-gradient(to right,#722257 0px,#722257 2px,transparent 2px,transparent 4px);"></span><span style="font-size:8px;line-height:14px;color:#212121;">╨┐╤А╨╛╨│╨╜╨╛╨╖ ╨│╨╛╨┤╨╛╨▓╨╛╨╣ ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╕</span></div>
                    <div style="display:flex;gap:8px;align-items:center;min-height:14px;"><span style="width:28.5px;height:1px;display:inline-block;background:repeating-linear-gradient(to right,#21282B 0px,#21282B 2px,transparent 2px,transparent 4px);"></span><span style="font-size:8px;line-height:14px;color:#212121;">╨┐╤А╨╛╨│╨╜╨╛╨╖ ╨┤╨╛╤Е╨╛╨┤╨╜╨╛╤Б╤В╨╕ ╨┤╨╡╨┐╨╛╨╖╨╕╤В╨╛╨▓</span></div>
                  </div>
                </div>

                <div style="position:absolute;left:0;top:553px;font-size:12px;line-height:15px;color:#212121;">
                  ╨Я╨╛╤Н╤В╨╛╨╝╤Г ╨╝╤Л ╤А╨╡╨║╨╛╨╝╨╡╨╜╨┤╤Г╨╡╨╝ ╨╕╤Б╨┐╨╛╨╗╤М╨╖╨╛╨▓╨░╤В╤М ╤Б╨╗╨╡╨┤╤Г╤О╤Й╨╕╨╡ ╨╖╨╜╨░╤З╨╡╨╜╨╕╤П ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╕:
                </div>

                <div style="position:absolute;left:0;top:588px;width:535px;">
                  <table style="width:100%;border-collapse:collapse;background:#F3F3F4;border-radius:8px;overflow:hidden;">
                    <thead>
                      <tr>
                        <th style="font-size:10px;line-height:20px;font-weight:400;color:#212121;text-align:left;padding:10px 10px 10px 20px;border-bottom:1px solid #fff;">╨б╤А╨╛╨║ ╤Ж╨╡╨╗╨╕</th>
                        <th style="font-size:10px;line-height:20px;font-weight:400;color:#212121;text-align:left;padding:10px;border-bottom:1px solid #fff;">╨Я╤А╨╛╨│╨╜╨╛╨╖╨╜╨╛╨╡ ╨╖╨╜╨░╤З╨╡╨╜╨╕╨╡ ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╕</th>
                        <th style="font-size:10px;line-height:20px;font-weight:400;color:#212121;text-align:left;padding:10px;border-bottom:1px solid #fff;">╨Ф╨╛╤Е╨╛╨┤╨╜╨╛╤Б╤В╤М ╨║╨░╨┐╨╕╤В╨░╨╗╨░</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${[
                          ['╨Ф╨╛ 1 ╨│╨╛╨┤╨░', '10%', '16%'],
                          ['╨Ю╤В 1 ╨│╨╛╨┤╨░ ╨┤╨╛ 2 ╨╗╨╡╤В', '9,5%', '14%'],
                          ['╨Ю╤В 2 ╨╗╨╡╤В ╨┤╨╛ 3 ╨╗╨╡╤В', '8,5%', '14%'],
                          ['╨Ю╤В 3 ╨╗╨╡╤В ╨┤╨╛ 5 ╨╗╨╡╤В', '7,4%', '12%'],
                          ['╨Ю╤В 5 ╨╗╨╡╤В ╨┤╨╛ 10 ╨╗╨╡╤В', '5,7%', '10%'],
                          ['╨Ю╤В 10 ╨╗╨╡╤В', '5,7%', '10%'],
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
            footerText: resolvedFooterText,
            title: '╨Ф╨╡╨║╨╗╨░╤А╨░╤Ж╨╕╤П ╨╛ ╤А╨╕╤Б╨║╨░╤Е ╤Д╨╕╨╜╨░╨╜╤Б╨╛╨▓╨╛╨│╨╛ ╨┐╨╗╨░╨╜╨╕╤А╨╛╨▓╨░╨╜╨╕╤П',
            subtitle: '',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            bodyHtml: `
              <div style="position:relative;width:535px;height:770px;">
                ${riskNotebookBgHtml}
                <div style="position:absolute;top:30px;left:0;width:520px;font-size:18px;line-height:20px;color:#212121;">
                  ╨Ф╨╡╨║╨╗╨░╤А╨░╤Ж╨╕╤П ╨╛ ╤А╨╕╤Б╨║╨░╤Е ╤Д╨╕╨╜╨░╨╜╤Б╨╛╨▓╨╛╨│╨╛ ╨┐╨╗╨░╨╜╨╕╤А╨╛╨▓╨░╨╜╨╕╤П
                </div>
                <div style="position:absolute;top:100px;left:0;background:#722257;color:#fff;padding:12px;border-radius:8px 8px 0 0;font-size:16px;line-height:1.2;z-index:1;">
                  1. ╨Ш╨╜╤Д╨╗╤П╤Ж╨╕╨╛╨╜╨╜╤Л╨╣ ╤А╨╕╤Б╨║
                </div>
                <div style="position:absolute;top:143px;left:0;width:535px;border:1px solid rgba(114,34,87,0.75);background:rgba(255,255,255,0.90);border-radius:0 8px 8px 8px;padding:16px 12px;font-size:12px;line-height:1.24;color:#212121;z-index:1;">
                  <p style="font-size:14px;margin-bottom:12px;">╨б╤Г╤В╤М ╤А╨╕╤Б╨║╨░:</p>
                  <p style="margin-bottom:12px;">${esc(inflationRiskIntro)}</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>╨Х╤Б╨╗╨╕ ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╤П ╨▓╤Л╤И╨╡ ╨╛╨╢╨╕╨┤╨░╨╡╨╝╨╛╨╣: ╤А╨╡╨░╨╗╤М╨╜╨░╤П ╨┤╨╛╤Е╨╛╨┤╨╜╨╛╤Б╤В╤М ╤Б╨╜╨╕╨╢╨░╨╡╤В╤Б╤П, ╨┐╨╛╨║╤Г╨┐╨░╤В╨╡╨╗╤М╨╜╨░╤П ╤Б╨┐╨╛╤Б╨╛╨▒╨╜╨╛╤Б╤В╤М ╨║╨░╨┐╨╕╤В╨░╨╗╨░ ╨┐╨░╨┤╨░╨╡╤В, ╤А╨░╤Б╤Е╨╛╨┤╨╜╨░╤П ╤З╨░╤Б╤В╤М ╤Ж╨╡╨╗╨╡╨╣ ╤А╨░╤Б╤В╨╡╤В ╨▒╤Л╤Б╤В╤А╨╡╨╡ ╨┐╨╗╨░╨╜╨░.</li>
                    <li>╨Х╤Б╨╗╨╕ ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╤П ╨╜╨╕╨╢╨╡ ╨╛╨╢╨╕╨┤╨░╨╡╨╝╨╛╨╣: ╨▓╨╛╨╖╨╝╨╛╨╢╨╜╨╛ ╨┐╨╡╤А╨╡╤А╨░╤Б╨┐╤А╨╡╨┤╨╡╨╗╨╡╨╜╨╕╨╡ ╨║╨░╨┐╨╕╤В╨░╨╗╨░ ╨╜╨╡ ╨▓ ╨╛╨┐╤В╨╕╨╝╨░╨╗╤М╨╜╤Л╨╡ ╤Ж╨╡╨╗╨╕ ╨╕ ╨╕╨╖╨▒╤Л╤В╨╛╤З╨╜╨░╤П ╨╗╨╕╨║╨▓╨╕╨┤╨╜╨╛╤Б╤В╤М ╨▓ ╨║╨╛╨╜╤Б╨╡╤А╨▓╨░╤В╨╕╨▓╨╜╨╛╨╣ ╤З╨░╤Б╤В╨╕ ╨┐╨╛╤А╤В╤Д╨╡╨╗╤П.</li>
                  </ul>
                  <p style="font-size:14px;margin-bottom:12px;">╨Ь╨╡╤А╤Л ╤Б╨╜╨╕╨╢╨╡╨╜╨╕╤П ╤А╨╕╤Б╨║╨░:</p>
                  <p style="margin-bottom:12px;">╨а╨╡╨│╤Г╨╗╤П╤А╨╜╤Л╨╣ ╨┐╨╡╤А╨╡╤Б╨╝╨╛╤В╤А ╨┐╨╗╨░╨╜╨░ (╨╜╨╡ ╤А╨╡╨╢╨╡ 1 ╤А╨░╨╖╨░ ╨▓ 6 ╨╝╨╡╤Б╤П╤Ж╨╡╨▓) ╤Б ╨║╨╛╤А╤А╨╡╨║╤В╨╕╤А╨╛╨▓╨║╨╛╨╣:</p>
                  <ul style="padding-left:24px;margin:0;">
                    <li>╨Я╤А╨╛╨│╨╜╨╛╨╖╨░ ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╕ ╤Б ╤Г╤З╨╡╤В╨╛╨╝ ╨░╨║╤В╤Г╨░╨╗╤М╨╜╤Л╤Е ╨┤╨░╨╜╨╜╤Л╤Е.</li>
                    <li>╨б╤В╨╛╨╕╨╝╨╛╤Б╤В╨╕ ╨║╨░╨╢╨┤╨╛╨╣ ╤Ж╨╡╨╗╨╕ ╨╕ ╤Б╤А╨╛╨║╨╛╨▓ ╨┤╨╛╤Б╤В╨╕╨╢╨╡╨╜╨╕╤П.</li>
                    <li>╨Ш╨╜╨┤╨╡╨║╤Б╨░╤Ж╨╕╨╕ ╨┐╨╛╨┐╨╛╨╗╨╜╨╡╨╜╨╕╨╣ ╨╕ ╤Б╤В╤А╤Г╨║╤В╤Г╤А╤Л ╨┐╨╛╤А╤В╤Д╨╡╨╗╤П.</li>
                  </ul>
                </div>
              </div>
            `,
        }),
        // 59:1335
        buildShell({
            footerText: resolvedFooterText,
            title: '2. ╨а╨╕╤Б╨║ ╨▒╨░╨╜╨║╤А╨╛╤В╤Б╤В╨▓╨░ ╨Э╨Я╨д',
            subtitle: '',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            bodyHtml: `
              <div style="position:relative;width:535px;height:770px;">
                ${riskNotebookBgHtml}
                <div style="position:absolute;top:30px;left:0;background:#722257;color:#fff;padding:12px;border-radius:8px 8px 0 0;font-size:16px;line-height:1.2;z-index:1;">
                  2. ╨а╨╕╤Б╨║ ╨▒╨░╨╜╨║╤А╨╛╤В╤Б╤В╨▓╨░ ╨Э╨Я╨д
                </div>
                <div style="position:absolute;top:73px;left:0;width:535px;border:1px solid rgba(114,34,87,0.75);background:rgba(255,255,255,0.90);border-radius:0 8px 8px 8px;padding:16px 12px;font-size:12px;line-height:1.24;color:#212121;z-index:1;">
                  <p style="font-size:14px;margin-bottom:12px;">╨б╤Г╤В╤М ╤А╨╕╤Б╨║╨░:</p>
                  <p style="margin-bottom:12px;">${esc(npfBankruptcyIntro)}</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>╨Ч╨░╨╝╨╛╤А╨╛╨╖╨║╨╡ ╨╕╨╗╨╕ ╨╖╨░╨┤╨╡╤А╨╢╨║╨╡ ╨▓╤Л╨┐╨╗╨░╤В ╨┐╨╡╨╜╤Б╨╕╨╛╨╜╨╜╤Л╤Е ╨╜╨░╨║╨╛╨┐╨╗╨╡╨╜╨╕╨╣.</li>
                    <li>╨Я╨╡╤А╨╡╨╛╤Д╨╛╤А╨╝╨╗╨╡╨╜╨╕╤О ╨┐╨╡╨╜╤Б╨╕╨╛╨╜╨╜╤Л╤Е ╨┐╤А╨░╨▓ ╨▓ ╨┤╤А╤Г╨│╨╛╨╣ ╤Д╨╛╨╜╨┤ ╨┐╤А╨╕ ╤А╨╡╨│╤Г╨╗╤П╤В╨╛╤А╨╜╤Л╤Е ╨┐╤А╨╛╤Ж╨╡╨┤╤Г╤А╨░╤Е.</li>
                    <li>╨з╨░╤Б╤В╨╕╤З╨╜╨╛╨╣ ╨┐╨╛╤В╨╡╤А╨╡ ╨╕╨╜╨▓╨╡╤Б╤В╨╕╤Ж╨╕╨╛╨╜╨╜╨╛╨│╨╛ ╨┤╨╛╤Е╨╛╨┤╨░ ╨┐╤А╨╕ ╨╜╨╡╨▒╨╗╨░╨│╨╛╨┐╤А╨╕╤П╤В╨╜╨╛╨╝ ╤А╤Л╨╜╨║╨╡.</li>
                  </ul>
                  <p style="font-size:14px;margin-bottom:12px;">╨д╨░╨║╤В╨╛╤А╤Л, ╤Б╨╜╨╕╨╢╨░╤О╤Й╨╕╨╡ ╨▓╨╡╤А╨╛╤П╤В╨╜╨╛╤Б╤В╤М ╤А╨╕╤Б╨║╨░:</p>
                  <p style="margin-bottom:12px;">1. ╨Ц╨╡╤Б╤В╨║╨╕╨╣ ╨│╨╛╤Б╤Г╨┤╨░╤А╤Б╤В╨▓╨╡╨╜╨╜╤Л╨╣ ╨║╨╛╨╜╤В╤А╨╛╨╗╤М:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>╨ж╨С ╨а╨д ╤А╨╡╨│╤Г╨╗╨╕╤А╤Г╨╡╤В ╨┤╨╡╤П╤В╨╡╨╗╤М╨╜╨╛╤Б╤В╤М ╨Э╨Я╨д, ╤Г╤Б╤В╨░╨╜╨░╨▓╨╗╨╕╨▓╨░╨╡╤В ╤В╤А╨╡╨▒╨╛╨▓╨░╨╜╨╕╤П ╨║ ╨║╨░╨┐╨╕╤В╨░╨╗╤Г ╨╕ ╨╕╨╜╨▓╨╡╤Б╤В╨╕╤Ж╨╕╨╛╨╜╨╜╤Л╨╝ ╨┐╨╛╤А╤В╤Д╨╡╨╗╤П╨╝.</li>
                    <li>╨Ю╨▒╤П╨╖╨░╤В╨╡╨╗╤М╨╜╨╛╨╡ ╤А╨░╨╖╨╝╨╡╤Й╨╡╨╜╨╕╨╡ ╤А╨╡╨╖╨╡╤А╨▓╨╛╨▓ ╨▓ ╨║╨╛╨╜╤Б╨╡╤А╨▓╨░╤В╨╕╨▓╨╜╤Л╨╡ ╨░╨║╤В╨╕╨▓╤Л (╨│╨╛╤Б╨╛╨▒╨╗╨╕╨│╨░╤Ж╨╕╨╕, ╨▓╤Л╤Б╨╛╨║╨╛╨╜╨░╨┤╨╡╨╢╨╜╤Л╨╡ ╨║╨╛╤А╨┐╨╛╤А╨░╤В╨╕╨▓╨╜╤Л╨╡ ╨╛╨▒╨╗╨╕╨│╨░╤Ж╨╕╨╕).</li>
                    <li>╨б╨╕╤Б╤В╨╡╨╝╨░ ╨│╨░╤А╨░╨╜╤В╨╕╤А╨╛╨▓╨░╨╜╨╕╤П ╨┐╨╡╨╜╤Б╨╕╨╛╨╜╨╜╤Л╤Е ╨╜╨░╨║╨╛╨┐╨╗╨╡╨╜╨╕╨╣.</li>
                  </ul>
                  <p style="margin-bottom:12px;">2. ╨б╨╕╤Б╤В╨╡╨╝╨░ ╨│╨░╤А╨░╨╜╤В╨╕╤А╨╛╨▓╨░╨╜╨╕╤П ╨┐╨╡╨╜╤Б╨╕╨╛╨╜╨╜╤Л╤Е ╨╜╨░╨║╨╛╨┐╨╗╨╡╨╜╨╕╨╣:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>╨Ф╨╡╨╣╤Б╤В╨▓╤Г╨╡╤В ╨╝╨╡╤Е╨░╨╜╨╕╨╖╨╝ ╨│╨░╤А╨░╨╜╤В╨╕╤А╨╛╨▓╨░╨╜╨╕╤П ╨┐╨╡╨╜╤Б╨╕╨╛╨╜╨╜╤Л╤Е ╨╜╨░╨║╨╛╨┐╨╗╨╡╨╜╨╕╨╣ ╨▓ ╤А╨░╨╝╨║╨░╤Е ╨┤╨╡╨╣╤Б╤В╨▓╤Г╤О╤Й╨╡╨│╨╛ ╨╖╨░╨║╨╛╨╜╨╛╨┤╨░╤В╨╡╨╗╤М╤Б╤В╨▓╨░.</li>
                    <li>╨Я╤А╨╕ ╨╕╨╖╨╝╨╡╨╜╨╡╨╜╨╕╨╕ ╤Б╤В╨░╤В╤Г╤Б╨░ ╤Д╨╛╨╜╨┤╨░ ╨┐╨╡╨╜╤Б╨╕╨╛╨╜╨╜╤Л╨╡ ╨┐╤А╨░╨▓╨░ ╨┐╨╡╤А╨╡╨▓╨╛╨┤╤П╤В╤Б╤П ╨▓ ╤Г╤Б╤В╨░╨╜╨╛╨▓╨╗╨╡╨╜╨╜╨╛╨╝ ╨┐╨╛╤А╤П╨┤╨║╨╡.</li>
                  </ul>
                  <p style="margin-bottom:12px;">3. ╨Ю╨│╤А╨░╨╜╨╕╤З╨╡╨╜╨╕╤П ╨╜╨░ ╤А╨╕╤Б╨║╨╛╨▓╨░╨╜╨╜╤Л╨╡ ╨╕╨╜╨▓╨╡╤Б╤В╨╕╤Ж╨╕╨╕:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>╨Э╨Я╨д ╨╜╨╡ ╨╝╨╛╨│╤Г╤В ╨▓╨║╨╗╨░╨┤╤Л╨▓╨░╤В╤М ╤Б╤А╨╡╨┤╤Б╤В╨▓╨░ ╨▓ ╨▓╤Л╤Б╨╛╨║╨╛╤А╨╕╤Б╨║╨╛╨▓╤Л╨╡ ╨░╨║╤В╨╕╨▓╤Л (╨░╨║╤Ж╨╕╨╕ ╤Б ╨╜╨╕╨╖╨║╨╛╨╣ ╨╗╨╕╨║╨▓╨╕╨┤╨╜╨╛╤Б╤В╤М╤О, ╨║╤А╨╕╨┐╤В╨╛╨▓╨░╨╗╤О╤В╤Л, ╨┐╤А╨╛╨╕╨╖╨▓╨╛╨┤╨╜╤Л╨╡ ╨╕╨╜╤Б╤В╤А╤Г╨╝╨╡╨╜╤В╤Л).</li>
                    <li>╨Ю╤Б╨╜╨╛╨▓╨╜╨░╤П ╤З╨░╤Б╤В╤М ╨┐╨╛╤А╤В╤Д╨╡╨╗╤П тАФ ╨Ю╨д╨Ч, ╨║╨╛╤А╨┐╨╛╤А╨░╤В╨╕╨▓╨╜╤Л╨╡ ╨╛╨▒╨╗╨╕╨│╨░╤Ж╨╕╨╕ 1-2 ╤Н╤И╨╡╨╗╨╛╨╜╨░, ╨▒╨░╨╜╨║╨╛╨▓╤Б╨║╨╕╨╡ ╨┤╨╡╨┐╨╛╨╖╨╕╤В╤Л.</li>
                  </ul>
                  <p style="font-size:14px;margin-bottom:12px;">╨Ь╨╡╤А╤Л ╤Б╨╜╨╕╨╢╨╡╨╜╨╕╤П ╤А╨╕╤Б╨║╨░:</p>
                  <ul style="padding-left:24px;margin:0;">
                    <li>╨Т╤Л╨▒╨╛╤А ╤Д╨╛╨╜╨┤╨░ ╤Б ╤Г╤Б╤В╨╛╨╣╤З╨╕╨▓╤Л╨╝╨╕ ╨┐╨╛╨║╨░╨╖╨░╤В╨╡╨╗╤П╨╝╨╕ ╨╕ ╨┐╤А╨╛╨╖╤А╨░╤З╨╜╨╛╨╣ ╨╛╤В╤З╨╡╤В╨╜╨╛╤Б╤В╤М╤О.</li>
                    <li>╨Ъ╨╛╨╜╤В╤А╨╛╨╗╤М ╨╕╨╖╨╝╨╡╨╜╨╡╨╜╨╕╨╣ ╨▓ ╤А╨╡╨│╤Г╨╗╨╕╤А╨╛╨▓╨░╨╜╨╕╨╕ ╨╕ ╨╕╨╜╨▓╨╡╤Б╤В╨╕╤Ж╨╕╨╛╨╜╨╜╨╛╨╣ ╨┤╨╡╨║╨╗╨░╤А╨░╤Ж╨╕╨╕ ╨Э╨Я╨д.</li>
                    <li>╨Ф╨╕╨▓╨╡╤А╤Б╨╕╤Д╨╕╨║╨░╤Ж╨╕╤П ╨╜╨░╨║╨╛╨┐╨╗╨╡╨╜╨╕╨╣ ╨╝╨╡╨╢╨┤╤Г ╤А╨░╨╖╨╜╤Л╨╝╨╕ ╨╕╨╜╤Б╤В╤А╤Г╨╝╨╡╨╜╤В╨░╨╝╨╕ ╨┐╨╗╨░╨╜╨░ (╨Э╨Я╨д, ╨▒╤А╨╛╨║╨╡╤А╤Б╨║╨╕╨╣ ╨║╨╛╨╜╤В╤Г╤А, ╤Б╤В╤А╨░╤Е╨╛╨▓╤Л╨╡ ╤А╨╡╤И╨╡╨╜╨╕╤П).</li>
                  </ul>
                </div>
              </div>
            `,
        }),
        // 59:1419
        buildShell({
            footerText: resolvedFooterText,
            title: '3. ╨а╨╕╤Б╨║ ╨┤╨╡╤Д╨╛╨╗╤В╨░ ╨│╨╛╤Б╤Г╨┤╨░╤А╤Б╤В╨▓╨░ ╨┐╨╛ ╨╛╨▒╨╗╨╕╨│╨░╤Ж╨╕╤П╨╝ ╤Д╨╡╨┤╨╡╤А╨░╨╗╤М╨╜╨╛╨│╨╛ ╨╖╨░╨╣╨╝╨░ (╨Ю╨д╨Ч)',
            subtitle: '',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            bodyHtml: `
              <div style="position:relative;width:535px;height:770px;">
                ${riskNotebookBgHtml}
                <div style="position:absolute;top:30px;left:0;background:#722257;color:#fff;padding:10px 12px;border-radius:8px 8px 0 0;font-size:16px;line-height:1.2;z-index:1;">
                  3. ╨а╨╕╤Б╨║ ╨┤╨╡╤Д╨╛╨╗╤В╨░ ╨│╨╛╤Б╤Г╨┤╨░╤А╤Б╤В╨▓╨░<br/>╨┐╨╛ ╨╛╨▒╨╗╨╕╨│╨░╤Ж╨╕╤П╨╝ ╤Д╨╡╨┤╨╡╤А╨░╨╗╤М╨╜╨╛╨│╨╛ ╨╖╨░╨╣╨╝╨░ (╨Ю╨д╨Ч)
                </div>
                <div style="position:absolute;top:88px;left:0;width:535px;border:1px solid rgba(114,34,87,0.75);background:rgba(255,255,255,0.90);border-radius:0 8px 8px 8px;padding:16px 12px;font-size:12px;line-height:1.1;color:#212121;z-index:1;">
                  <p style="font-size:14px;margin-bottom:12px;">╨б╤Г╤В╤М ╤А╨╕╤Б╨║╨░:</p>
                  <p style="margin-bottom:12px;">╨Ф╨╡╤Д╨╛╨╗╤В ╨┐╨╛ ╨Ю╨д╨Ч тАФ ╤Н╤В╨╛ ╨╛╤В╨║╨░╨╖ ╨Ь╨╕╨╜╨╕╤Б╤В╨╡╤А╤Б╤В╨▓╨░ ╤Д╨╕╨╜╨░╨╜╤Б╨╛╨▓ ╨а╨д ╨╕╤Б╨┐╨╛╨╗╨╜╤П╤В╤М ╨╛╨▒╤П╨╖╨░╤В╨╡╨╗╤М╤Б╤В╨▓╨░ ╨┐╨╛ ╨▓╤Л╨┐╨╗╨░╤В╨╡ ╨║╤Г╨┐╨╛╨╜╨╜╨╛╨│╨╛ ╨┤╨╛╤Е╨╛╨┤╨░ ╨╕╨╗╨╕ ╨┐╨╛╨│╨░╤И╨╡╨╜╨╕╤О ╨╜╨╛╨╝╨╕╨╜╨░╨╗╨░ ╨╛╨▒╨╗╨╕╨│╨░╤Ж╨╕╨╣.</p>
                  <p style="font-size:14px;margin-bottom:12px;">╨д╨░╨║╤В╨╛╤А╤Л, ╨▓╨╗╨╕╤П╤О╤Й╨╕╨╡ ╨╜╨░ ╨▓╨╡╤А╨╛╤П╤В╨╜╨╛╤Б╤В╤М ╨┤╨╡╤Д╨╛╨╗╤В╨░:</p>
                  <p style="margin-bottom:12px;">1. ╨г╤А╨╛╨▓╨╡╨╜╤М ╨│╨╛╤Б╨┤╨╛╨╗╨│╨░:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>╨Ю╤В╨╜╨╛╤И╨╡╨╜╨╕╨╡ ╨│╨╛╤Б╨┤╨╛╨╗╨│╨░ ╨║ ╨Т╨Т╨Я ╨а╨╛╤Б╤Б╨╕╨╕ (~20% ╨▓ 2024 ╨│.) ╤Б╤Г╤Й╨╡╤Б╤В╨▓╨╡╨╜╨╜╨╛ ╨╜╨╕╨╢╨╡ ╨║╤А╨╕╤В╨╕╤З╨╡╤Б╨║╨╕╤Е ╤Г╤А╨╛╨▓╨╜╨╡╨╣ (╨┤╨╗╤П ╤Б╤А╨░╨▓╨╜╨╡╨╜╨╕╤П: ╨б╨и╨Р тАФ ~120%, ╨п╨┐╨╛╨╜╨╕╤П тАФ ~260%).</li></ul>
                  <p style="margin-bottom:12px;">2. ╨Я╨╗╨░╤В╨╡╨╢╨╡╤Б╨┐╨╛╤Б╨╛╨▒╨╜╨╛╤Б╤В╤М ╨│╨╛╤Б╤Г╨┤╨░╤А╤Б╤В╨▓╨░:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>╨Ю╤Б╨╜╨╛╨▓╨╜╤Л╨╡ ╨╕╤Б╤В╨╛╤З╨╜╨╕╨║╨╕ ╨┐╨╛╨│╨░╤И╨╡╨╜╨╕╤П: ╨╜╨╡╤Д╤В╨╡╨│╨░╨╖╨╛╨▓╤Л╨╡ ╨┤╨╛╤Е╨╛╨┤╤Л, ╨╜╨░╨╗╨╛╨│╨╛╨▓╤Л╨╡ ╨┐╨╛╤Б╤В╤Г╨┐╨╗╨╡╨╜╨╕╤П.</li><li>╨Э╨░╨╗╨╕╤З╨╕╨╡ ╨╖╨╛╨╗╨╛╤В╨╛╨▓╨░╨╗╤О╤В╨╜╤Л╤Е ╤А╨╡╨╖╨╡╤А╨▓╨╛╨▓.</li></ul>
                  <p style="margin-bottom:12px;">3. ╨а╨╡╨│╤Г╨╗╤П╤В╨╛╤А╨╜╤Л╨╡ ╨╛╨│╤А╨░╨╜╨╕╤З╨╡╨╜╨╕╤П ╨┤╨╗╤П ╨╕╨╜╤Б╤В╨╕╤В╤Г╤Ж╨╕╨╛╨╜╨░╨╗╤М╨╜╤Л╤Е ╨╕╨╜╨▓╨╡╤Б╤В╨╛╤А╨╛╨▓:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>╨Ф╨╗╤П ╨Э╨Я╨д ╨╕ ╤Б╤В╤А╨░╤Е╨╛╨▓╤Л╤Е ╨║╨╛╨╝╨┐╨░╨╜╨╕╨╣ ╨┤╨╡╨╣╤Б╤В╨▓╤Г╤О╤В ╨╛╨│╤А╨░╨╜╨╕╤З╨╡╨╜╨╕╤П ╨╜╨░ ╤А╨╕╤Б╨║╨╛╨▓╨░╨╜╨╜╤Л╨╡ ╨░╨║╤В╨╕╨▓╤Л ╨╕ ╤В╤А╨╡╨▒╨╛╨▓╨░╨╜╨╕╤П ╨┐╨╛ ╨║╨░╤З╨╡╤Б╤В╨▓╤Г ╨┐╨╛╤А╤В╤Д╨╡╨╗╤П.</li><li>╨н╤В╨╛ ╤Б╨╜╨╕╨╢╨░╨╡╤В ╨▓╨╡╤А╨╛╤П╤В╨╜╨╛╤Б╤В╤М ╨║╨╛╨╜╤Ж╨╡╨╜╤В╤А╨░╤Ж╨╕╨╕ ╨║╨░╨┐╨╕╤В╨░╨╗╨░ ╨▓ ╤Б╨┐╨╡╨║╤Г╨╗╤П╤В╨╕╨▓╨╜╤Л╤Е ╨╕╨╜╤Б╤В╤А╤Г╨╝╨╡╨╜╤В╨░╤Е.</li></ul>
                  <p style="font-size:14px;margin-bottom:12px;">╨д╨░╨║╤В╨╛╤А╤Л ╤Б╨╜╨╕╨╢╨╡╨╜╨╕╤П ╤А╨╕╤Б╨║╨░:</p>
                  <p style="margin-bottom:12px;">1. ╨б╤Г╨▓╨╡╤А╨╡╨╜╨╜╨░╤П ╨┤╨╡╨╜╨╡╨╢╨╜╨░╤П ╤Н╨╝╨╕╤Б╤Б╨╕╤П:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>╨а╨╛╤Б╤Б╨╕╤П ╨▓╤Л╨┐╤Г╤Б╨║╨░╨╡╤В ╨Ю╨д╨Ч ╨▓ ╨╜╨░╤Ж╨╕╨╛╨╜╨░╨╗╤М╨╜╨╛╨╣ ╨▓╨░╨╗╤О╤В╨╡ (╤А╤Г╨▒╨╗╨╕).</li><li>╨в╨╡╤Е╨╜╨╕╤З╨╡╤Б╨║╨╕ ╨╝╨╛╨╢╨╡╤В ╨▓╤Б╨╡╨│╨┤╨░ ╨╜╨░╨┐╨╡╤З╨░╤В╨░╤В╤М ╨┤╨╡╨╜╤М╨│╨╕ ╨┤╨╗╤П ╨┐╨╛╨│╨░╤И╨╡╨╜╨╕╤П ╨┤╨╛╨╗╨│╨░ (╤А╨╕╤Б╨║ тАФ ╨│╨╕╨┐╨╡╤А╨╕╨╜╤Д╨╗╤П╤Ж╨╕╤П, ╨╜╨╛ ╨╜╨╡ ╨┤╨╡╤Д╨╛╨╗╤В).</li></ul>
                  <p style="margin-bottom:12px;">2. ╨б╤В╤А╤Г╨║╤В╤Г╤А╨░ ╨┤╨╡╤А╨╢╨░╤В╨╡╨╗╨╡╨╣ ╨Ю╨д╨Ч:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>╨Ю╤Б╨╜╨╛╨▓╨╜╤Л╨╡ ╨▓╨╗╨░╨┤╨╡╨╗╤М╤Ж╤Л тАФ ╤А╨╛╤Б╤Б╨╕╨╣╤Б╨║╨╕╨╡ ╨▒╨░╨╜╨║╨╕, ╨Э╨Я╨д, ╤Б╤В╤А╨░╤Е╨╛╨▓╤Л╨╡ ╨║╨╛╨╝╨┐╨░╨╜╨╕╨╕ ╨╕ ╨ж╨С ╨а╨д (>70%).</li><li>╨Э╨╕╨╖╨║╨░╤П ╨╖╨░╨▓╨╕╤Б╨╕╨╝╨╛╤Б╤В╤М ╨╛╤В ╨╕╨╜╨╛╤Б╤В╤А╨░╨╜╨╜╤Л╤Е ╨║╤А╨╡╨┤╨╕╤В╨╛╤А╨╛╨▓.</li></ul>
                  <p style="margin-bottom:12px;">3. ╨Я╨╛╨╗╨╕╤В╨╕╤З╨╡╤Б╨║╨╕╨╡ ╤Д╨░╨║╤В╨╛╤А╤Л:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>╨Ф╨╡╤Д╨╛╨╗╤В ╤А╨░╨╖╤А╤Г╤И╨╕╤В ╨┤╨╛╨▓╨╡╤А╨╕╨╡ ╨║ ╤Д╨╕╨╜╨░╨╜╤Б╨╛╨▓╨╛╨╣ ╤Б╨╕╤Б╤В╨╡╨╝╨╡.</li><li>╨Т╨╗╨░╤Б╤В╨╕ ╨▒╤Г╨┤╤Г╤В ╨╗╤О╨▒╨╛╨╣ ╤Ж╨╡╨╜╨╛╨╣ ╨╕╨╖╨▒╨╡╨│╨░╤В╤М ╤Д╨╛╤А╨╝╨░╨╗╤М╨╜╨╛╨│╨╛ ╨┤╨╡╤Д╨╛╨╗╤В╨░.</li></ul>
                  <p style="font-size:14px;margin-bottom:12px;">╨Т╤Л╨▓╨╛╨┤:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>╨Т╨╡╤А╨╛╤П╤В╨╜╨╛╤Б╤В╤М ╤Д╨╛╤А╨╝╨░╨╗╤М╨╜╨╛╨│╨╛ ╨┤╨╡╤Д╨╛╨╗╤В╨░ ╨┐╨╛ ╤А╤Г╨▒╨╗╨╡╨▓╤Л╨╝ ╨Ю╨д╨Ч ╨╛╤Ж╨╡╨╜╨╕╨▓╨░╨╡╤В╤Б╤П ╨║╨░╨║ ╨╜╨╕╨╖╨║╨░╤П.</li><li>╨Ъ╨╗╤О╤З╨╡╨▓╨╛╨╣ ╤А╨╕╤Б╨║ ╨┤╨╗╤П ╨╕╨╜╨▓╨╡╤Б╤В╨╛╤А╨░ ╤З╨░╤Й╨╡ ╤Б╨▓╤П╨╖╨░╨╜ ╨╜╨╡ ╤Б ╨┤╨╡╤Д╨╛╨╗╤В╨╛╨╝, ╨░ ╤Б ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╡╨╣ ╨╕ ╤А╤Л╨╜╨╛╤З╨╜╨╛╨╣ ╨┐╨╡╤А╨╡╨╛╤Ж╨╡╨╜╨║╨╛╨╣.</li></ul>
                  <p style="margin:0;">╨Ю╨д╨Ч ╨╛╤Б╤В╨░╤О╤В╤Б╤П ╨▒╨░╨╖╨╛╨▓╤Л╨╝ ╨╖╨░╤Й╨╕╤В╨╜╤Л╨╝ ╨╕╨╜╤Б╤В╤А╤Г╨╝╨╡╨╜╤В╨╛╨╝ ╤А╤Г╨▒╨╗╨╡╨▓╨╛╨│╨╛ ╨║╨╛╨╜╤В╤Г╤А╨░, ╨╜╨╛ ╨╕╤В╨╛╨│╨╛╨▓╨░╤П ╨┤╨╛╤Е╨╛╨┤╨╜╨╛╤Б╤В╤М ╨╖╨░╨▓╨╕╤Б╨╕╤В ╨╛╤В ╨│╨╛╤А╨╕╨╖╨╛╨╜╤В╨░, ╤Г╤А╨╛╨▓╨╜╤П ╤Б╤В╨░╨▓╨║╨╕ ╨╕ ╨┤╨╕╨╜╨░╨╝╨╕╨║╨╕ ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╕.</p>
                </div>
              </div>
            `,
        }),
        // 59:1363
        buildShell({
            footerText: resolvedFooterText,
            title: '4. ╨а╨╕╤Б╨║╨╕ ╨╕╨╜╨▓╨╡╤Б╤В╨╕╤А╨╛╨▓╨░╨╜╨╕╤П ╨▓ ╨░╨║╤Ж╨╕╨╕ ╤А╨╛╤Б╤Б╨╕╨╣╤Б╨║╨╕╤Е ╨║╨╛╨╝╨┐╨░╨╜╨╕╨╣',
            subtitle: '',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            bodyHtml: `
              <div style="position:relative;width:535px;height:770px;">
                ${riskNotebookBgHtml}
                <div style="position:absolute;top:30px;left:0;background:#722257;color:#fff;padding:12px;border-radius:8px 8px 0 0;font-size:16px;line-height:1.2;z-index:1;">
                  4. ╨а╨╕╤Б╨║╨╕ ╨╕╨╜╨▓╨╡╤Б╤В╨╕╤А╨╛╨▓╨░╨╜╨╕╤П<br/>╨▓ ╨░╨║╤Ж╨╕╨╕ ╤А╨╛╤Б╤Б╨╕╨╣╤Б╨║╨╕╤Е ╨║╨╛╨╝╨┐╨░╨╜╨╕╨╣
                </div>
                <div style="position:absolute;top:92px;left:0;width:535px;border:1px solid rgba(114,34,87,0.75);background:rgba(255,255,255,0.90);border-radius:0 8px 8px 8px;padding:16px 12px;font-size:12px;line-height:1.24;color:#212121;z-index:1;">
                  <p style="font-size:14px;margin-bottom:12px;">╨б╤Г╤В╤М ╤А╨╕╤Б╨║╨░:</p>
                  <p style="margin-bottom:12px;">╨Р╨║╤Ж╨╕╨╛╨╜╨╜╤Л╨╣ ╤А╨╕╤Б╨║ ╨▓╨╛╨╖╨╜╨╕╨║╨░╨╡╤В ╨▓ ╤З╨░╤Б╤В╨╕ ╨┐╨╛╤А╤В╤Д╨╡╨╗╤П, ╨╕╨╜╨▓╨╡╤Б╤В╨╕╤А╤Г╨╡╨╝╨╛╨╣ ╤З╨╡╤А╨╡╨╖ ╤А╤Л╨╜╨╛╤З╨╜╤Л╨╡ ╨╕╨╜╤Б╤В╤А╤Г╨╝╨╡╨╜╤В╤Л (╨▓ ╤В╨╛╨╝ ╤З╨╕╤Б╨╗╨╡ ╨▓ ╨▒╤А╨╛╨║╨╡╤А╤Б╨║╨╛╨╝ ╨║╨╛╨╜╤В╤Г╤А╨╡ ╨д╨╕╨╜╨░╨╝) ╨╕/╨╕╨╗╨╕ ╨▓ ╤А╨░╨╝╨║╨░╤Е ╨┤╨╛╨┐╤Г╤Б╤В╨╕╨╝╤Л╤Е ╨┤╨╛╨╗╨╡╨╣ ╨╕╨╜╤Б╤В╨╕╤В╤Г╤Ж╨╕╨╛╨╜╨░╨╗╤М╨╜╤Л╤Е ╨┐╨╛╤А╤В╤Д╨╡╨╗╨╡╨╣.</p>
                  <p style="margin-bottom:12px;">╨Ю╤Б╨╜╨╛╨▓╨╜╤Л╨╡ ╤А╨╕╤Б╨║╨╕:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>╨а╤Л╨╜╨╛╤З╨╜╨░╤П ╨▓╨╛╨╗╨░╤В╨╕╨╗╤М╨╜╨╛╤Б╤В╤М тАФ ╤Б╤В╨╛╨╕╨╝╨╛╤Б╤В╤М ╨░╨║╤Ж╨╕╨╣ ╨╝╨╛╨╢╨╡╤В ╤А╨╡╨╖╨║╨╛ ╤Б╨╜╨╕╨╢╨░╤В╤М╤Б╤П ╨╕╨╖-╨╖╨░ ╤Н╨║╨╛╨╜╨╛╨╝╨╕╤З╨╡╤Б╨║╨╕╤Е ╨║╤А╨╕╨╖╨╕╤Б╨╛╨▓, ╤Б╨░╨╜╨║╤Ж╨╕╨╣ ╨╕╨╗╨╕ ╤Г╤Е╤Г╨┤╤И╨╡╨╜╨╕╤П ╤Д╨╕╨╜╨░╨╜╤Б╨╛╨▓╤Л╤Е ╨┐╨╛╨║╨░╨╖╨░╤В╨╡╨╗╨╡╨╣ ╨║╨╛╨╝╨┐╨░╨╜╨╕╨╣.</li>
                    <li>╨Ю╨│╤А╨░╨╜╨╕╤З╨╡╨╜╨╜╨░╤П ╨┤╨╕╨▓╨╡╤А╤Б╨╕╤Д╨╕╨║╨░╤Ж╨╕╤П тАФ ╨╕╨╖-╨╖╨░ ╤А╨╡╨│╤Г╨╗╤П╤В╨╛╤А╨╜╤Л╤Е ╨╛╨│╤А╨░╨╜╨╕╤З╨╡╨╜╨╕╨╣ ╨Э╨Я╨д ╨╜╨╡ ╨╝╨╛╨│╤Г╤В ╤Б╨▓╨╛╨▒╨╛╨┤╨╜╨╛ ╤А╨░╤Б╨┐╤А╨╡╨┤╨╡╨╗╤П╤В╤М ╨░╨║╤В╨╕╨▓╤Л ╨╝╨╡╨╢╨┤╤Г ╤А╨░╨╖╨╜╤Л╨╝╨╕ ╤Б╨╡╨║╤В╨╛╤А╨░╨╝╨╕.</li>
                    <li>╨Э╨╕╨╖╨║╨░╤П ╨╗╨╕╨║╨▓╨╕╨┤╨╜╨╛╤Б╤В╤М ╨╛╤В╨┤╨╡╨╗╤М╨╜╤Л╤Е ╨▒╤Г╨╝╨░╨│ тАФ ╨╜╨╡╨║╨╛╤В╨╛╤А╤Л╨╡ ╨░╨║╤Ж╨╕╨╕ ╨╝╨╛╨│╤Г╤В ╨▒╤Л╤В╤М ╤В╤А╤Г╨┤╨╜╨╛╤А╨╡╨░╨╗╨╕╨╖╤Г╨╡╨╝╤Л╨╝╨╕ ╨┐╤А╨╕ ╨╜╨╡╨╛╨▒╤Е╨╛╨┤╨╕╨╝╨╛╤Б╤В╨╕ ╤Б╤А╨╛╤З╨╜╨╛╨│╨╛ ╨▓╤Л╤Е╨╛╨┤╨░.</li>
                  </ul>
                  <p style="font-size:14px;margin-bottom:12px;">╨д╨░╨║╤В╨╛╤А╤Л, ╤Б╨╜╨╕╨╢╨░╤О╤Й╨╕╨╡ ╤А╨╕╤Б╨║:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>╨Ы╨╕╨╝╨╕╤В╤Л ╨┐╨╛ ╤А╨╕╤Б╨║╤Г ╨╕ ╤В╤А╨╡╨▒╨╛╨▓╨░╨╜╨╕╤П ╨║ ╨║╨░╤З╨╡╤Б╤В╨▓╤Г ╨░╨║╤В╨╕╨▓╨╛╨▓ ╨▓ ╨╕╨╜╤Б╤В╨╕╤В╤Г╤Ж╨╕╨╛╨╜╨░╨╗╤М╨╜╨╛╨╝ ╨║╨╛╨╜╤В╤Г╤А╨╡ (╨Э╨Я╨д/╨б╨Ъ).</li></ul>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>╨Ф╨╕╨▓╨╡╤А╤Б╨╕╤Д╨╕╨║╨░╤Ж╨╕╤П ╨┐╨╛ ╤Н╨╝╨╕╤В╨╡╨╜╤В╨░╨╝, ╤Б╨╡╨║╤В╨╛╤А╨░╨╝ ╨╕ ╤Б╤А╨╛╨║╨░╨╝ ╨╕╨╜╨▓╨╡╤Б╤В╨╕╤А╨╛╨▓╨░╨╜╨╕╤П.</li></ul>
                  <ul style="padding-left:24px;margin-bottom:12px;"><li>╨Я╨╛╤И╨░╨│╨╛╨▓╤Л╨╣ ╨▓╤Е╨╛╨┤ ╨▓ ╤А╤Л╨╜╨╛╨║ ╨╕ ╤А╨╡╨│╤Г╨╗╤П╤А╨╜╨░╤П ╤А╨╡╨▒╨░╨╗╨░╨╜╤Б╨╕╤А╨╛╨▓╨║╨░ ╨▓╨╝╨╡╤Б╤В╨╛ ╨╡╨┤╨╕╨╜╨╛╨▓╤А╨╡╨╝╨╡╨╜╨╜╨╛╨│╨╛ ╤А╨░╨╖╨╝╨╡╤Й╨╡╨╜╨╕╤П ╨║╤А╤Г╨┐╨╜╨╛╨╣ ╤Б╤Г╨╝╨╝╤Л.</li></ul>
                  <p style="font-size:14px;margin-bottom:12px;">╨Т╤Л╨▓╨╛╨┤:</p>
                  <p style="margin:0;">╨Р╨║╤Ж╨╕╨╕ ╨┤╨░╤О╤В ╨┐╨╛╤В╨╡╨╜╤Ж╨╕╨░╨╗ ╤А╨╛╤Б╤В╨░, ╨╜╨╛ ╤Б╨╛╨┐╤А╨╛╨▓╨╛╨╢╨┤╨░╤О╤В╤Б╤П ╨┐╨╛╨▓╤Л╤И╨╡╨╜╨╜╨╛╨╣ ╨▓╨╛╨╗╨░╤В╨╕╨╗╤М╨╜╨╛╤Б╤В╤М╤О. ╨Ъ╨╛╨╜╤В╤А╨╛╨╗╤М ╤А╨╕╤Б╨║╨░ ╨┤╨╛╤Б╤В╨╕╨│╨░╨╡╤В╤Б╤П ╤З╨╡╤А╨╡╨╖ ╨┤╨╕╨▓╨╡╤А╤Б╨╕╤Д╨╕╨║╨░╤Ж╨╕╤О, ╨╗╨╕╨╝╨╕╤В╤Л ╨┤╨╛╨╗╨╡╨╣, ╤А╨╡╨│╤Г╨╗╤П╤А╨╜╤Л╨╣ ╨┐╨╡╤А╨╡╤Б╨╝╨╛╤В╤А ╨┐╨╛╤А╤В╤Д╨╡╨╗╤П ╨╕ ╤Б╨╛╨╛╤В╨▓╨╡╤В╤Б╤В╨▓╨╕╨╡ ╤А╨╕╤Б╨║-╨┐╤А╨╛╤Д╨╕╨╗╤О ╨║╨╗╨╕╨╡╨╜╤В╨░.</p>
                </div>
              </div>
            `,
        }),
        // 59:1391
        buildShell({
            footerText: resolvedFooterText,
            title: '5. ╨а╨╕╤Б╨║╨╕ ╨╕╨╜╨▓╨╡╤Б╤В╨╕╤А╨╛╨▓╨░╨╜╨╕╤П ╨Э╨Я╨д ╨▓ ╨║╨╛╤А╨┐╨╛╤А╨░╤В╨╕╨▓╨╜╤Л╨╡ ╨╛╨▒╨╗╨╕╨│╨░╤Ж╨╕╨╕',
            subtitle: '',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            bodyHtml: `
              <div style="position:relative;width:535px;height:770px;">
                ${riskNotebookBgHtml}
                <div style="position:absolute;top:30px;left:0;background:#722257;color:#fff;padding:12px;border-radius:8px 8px 0 0;font-size:16px;line-height:1.2;z-index:1;">
                  5. ╨а╨╕╤Б╨║╨╕ ╨╕╨╜╨▓╨╡╤Б╤В╨╕╤А╨╛╨▓╨░╨╜╨╕╤П ╨Э╨Я╨д<br/>╨▓ ╨║╨╛╤А╨┐╨╛╤А╨░╤В╨╕╨▓╨╜╤Л╨╡ ╨╛╨▒╨╗╨╕╨│╨░╤Ж╨╕╨╕
                </div>
                <div style="position:absolute;top:92px;left:0;width:535px;border:1px solid rgba(114,34,87,0.75);background:rgba(255,255,255,0.90);border-radius:0 8px 8px 8px;padding:16px 12px;font-size:12px;line-height:1.24;color:#212121;z-index:1;">
                  <p style="font-size:14px;margin-bottom:12px;">╨Ю╤Б╨╜╨╛╨▓╨╜╤Л╨╡ ╤А╨╕╤Б╨║╨╕:</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>╨Ъ╤А╨╡╨┤╨╕╤В╨╜╤Л╨╣ ╤А╨╕╤Б╨║ тАФ ╨▓╨╡╤А╨╛╤П╤В╨╜╨╛╤Б╤В╤М ╨┤╨╡╤Д╨╛╨╗╤В╨░ ╤Н╨╝╨╕╤В╨╡╨╜╤В╨░ ╨╕ ╨╜╨╡╨▓╤Л╨┐╨╗╨░╤В╤Л ╨║╤Г╨┐╨╛╨╜╨╛╨▓/╨╜╨╛╨╝╨╕╨╜╨░╨╗╨░.</li>
                    <li>╨а╨╕╤Б╨║ ╨╗╨╕╨║╨▓╨╕╨┤╨╜╨╛╤Б╤В╨╕ тАФ ╤Б╨╗╨╛╨╢╨╜╨╛╤Б╤В╤М ╨┐╤А╨╛╨┤╨░╨╢╨╕ ╨▒╤Г╨╝╨░╨│ ╨▒╨╡╨╖ ╨┐╨╛╤В╨╡╤А╨╕ ╤Б╤В╨╛╨╕╨╝╨╛╤Б╤В╨╕.</li>
                    <li>╨Я╤А╨╛╤Ж╨╡╨╜╤В╨╜╤Л╨╣ ╤А╨╕╤Б╨║ тАФ ╤Б╨╜╨╕╨╢╨╡╨╜╨╕╨╡ ╤А╤Л╨╜╨╛╤З╨╜╨╛╨╣ ╤Ж╨╡╨╜╤Л ╨╛╨▒╨╗╨╕╨│╨░╤Ж╨╕╨╣ ╨┐╤А╨╕ ╤А╨╛╤Б╤В╨╡ ╨║╨╗╤О╤З╨╡╨▓╨╛╨╣ ╤Б╤В╨░╨▓╨║╨╕.</li>
                  </ul>
                  <p style="font-size:14px;margin-bottom:12px;">╨д╨░╨║╤В╨╛╤А╤Л ╤Б╨╜╨╕╨╢╨╡╨╜╨╕╤П ╤А╨╕╤Б╨║╨░ (╨Э╨Я╨д/╨б╨Ъ/╨▒╤А╨╛╨║╨╡╤А╤Б╨║╨╕╨╣ ╨║╨╛╨╜╤В╤Г╤А):</p>
                  <ul style="padding-left:24px;margin-bottom:12px;">
                    <li>╨Ю╤В╨▒╨╛╤А ╤Н╨╝╨╕╤В╨╡╨╜╤В╨╛╨▓ ╤Б ╨▓╤Л╤Б╨╛╨║╨╕╨╝ ╨║╤А╨╡╨┤╨╕╤В╨╜╤Л╨╝ ╤А╨╡╨╣╤В╨╕╨╜╨│╨╛╨╝.</li>
                    <li>╨Ф╨╕╨▓╨╡╤А╤Б╨╕╤Д╨╕╨║╨░╤Ж╨╕╤П ╨┐╨╛ ╤Б╨╡╨║╤В╨╛╤А╨░╨╝/╤Н╨╝╨╕╤В╨╡╨╜╤В╨░╨╝.</li>
                    <li>╨Ъ╨╛╨╜╤В╤А╨╛╨╗╤М ╨┤╤О╤А╨░╤Ж╨╕╨╕ (╤Б╤А╨╛╨║╨╛╨▓ ╨┐╨╛╨│╨░╤И╨╡╨╜╨╕╤П).</li>
                    <li>╨б╨╛╨▒╨╗╤О╨┤╨╡╨╜╨╕╨╡ ╨╜╨╛╤А╨╝╨░╤В╨╕╨▓╨╛╨▓ ╨ж╨С ╨а╨д.</li>
                    <li>╨Ь╨╛╨╜╨╕╤В╨╛╤А╨╕╨╜╨│ ╨╗╨╕╨║╨▓╨╕╨┤╨╜╨╛╤Б╤В╨╕ ╨╕ ╨╝╨░╨║╤А╨╛╤Н╨║╨╛╨╜╨╛╨╝╨╕╤З╨╡╤Б╨║╨╛╨╣ ╤Б╨╕╤В╤Г╨░╤Ж╨╕╨╕.</li>
                  </ul>
                  <p style="font-size:14px;margin-bottom:12px;">╨Т╤Л╨▓╨╛╨┤:</p>
                  <p style="margin:0 0 10px 0;">╨Ъ╨╛╤А╨┐╨╛╤А╨░╤В╨╕╨▓╨╜╤Л╨╡ ╨╛╨▒╨╗╨╕╨│╨░╤Ж╨╕╨╕ ╨╛╨▒╤Л╤З╨╜╨╛ ╨┤╨░╤О╤В ╨┐╤А╨╡╨╝╨╕╤О ╨║ ╨Ю╨д╨Ч, ╨╜╨╛ ╤В╤А╨╡╨▒╤Г╤О╤В ╨║╨╛╨╜╤В╤А╨╛╨╗╤П ╨║╤А╨╡╨┤╨╕╤В╨╜╨╛╨│╨╛ ╨║╨░╤З╨╡╤Б╤В╨▓╨░ ╤Н╨╝╨╕╤В╨╡╨╜╤В╨╛╨▓. ╨Т ╨┐╨╗╨░╨╜╨╡ ╤Н╤В╨╛╤В ╤А╨╕╤Б╨║ ╤Б╨╜╨╕╨╢╨░╨╡╤В╤Б╤П ╨╖╨░ ╤Б╤З╨╡╤В ╨┤╨╕╨▓╨╡╤А╤Б╨╕╤Д╨╕╨║╨░╤Ж╨╕╨╕, ╨╗╨╕╨╝╨╕╤В╨╛╨▓ ╨╕ ╤А╨╡╨│╤Г╨╗╤П╤А╨╜╨╛╨│╨╛ ╨╝╨╛╨╜╨╕╤В╨╛╤А╨╕╨╜╨│╨░ ╨╝╨░╨║╤А╨╛╨┤╨░╨╜╨╜╤Л╤Е.</p>
                  <div style="margin-top:8px;padding:8px 10px;border:1px dashed #9ca3af;border-radius:8px;background:#f8fafc;font-size:9px;line-height:1.35;color:#334155;">
                    ╨Ь╨░╤В╨╡╤А╨╕╨░╨╗╤Л ╨┤╨╡╨║╨╗╨░╤А╨░╤Ж╨╕╨╕ ╨╜╨╛╤Б╤П╤В ╨╕╨╜╤Д╨╛╤А╨╝╨░╤Ж╨╕╨╛╨╜╨╜╤Л╨╣ ╤Е╨░╤А╨░╨║╤В╨╡╤А ╨╕ ╨╜╨╡ ╤П╨▓╨╗╤П╤О╤В╤Б╤П ╨╕╨╜╨┤╨╕╨▓╨╕╨┤╤Г╨░╨╗╤М╨╜╨╛╨╣ ╨╕╨╜╨▓╨╡╤Б╤В╨╕╤Ж╨╕╨╛╨╜╨╜╨╛╨╣ ╤А╨╡╨║╨╛╨╝╨╡╨╜╨┤╨░╤Ж╨╕╨╡╨╣ (╨Ш╨Ш╨а). ╨Я╤А╨╛╤И╨╗╨░╤П ╨┤╨╛╤Е╨╛╨┤╨╜╨╛╤Б╤В╤М ╨╜╨╡ ╨│╨░╤А╨░╨╜╤В╨╕╤А╤Г╨╡╤В ╨▒╤Г╨┤╤Г╤Й╨╕╨╡ ╤А╨╡╨╖╤Г╨╗╤М╤В╨░╤В╤Л. ╨д╨╕╨╜╨░╨╜╤Б╨╛╨▓╤Л╨╡ ╨╕ ╤Б╤В╤А╨░╤Е╨╛╨▓╤Л╨╡ ╤Г╤Б╨╗╨╛╨▓╨╕╤П, ╨┐╨╛╤А╤П╨┤╨╛╨║ ╨│╨░╤А╨░╨╜╤В╨╕╨╣ ╨╕ ╨▓╨╛╨╖╨╝╨╛╨╢╨╜╤Л╨╡ ╨╛╨│╤А╨░╨╜╨╕╤З╨╡╨╜╨╕╤П ╨╛╨┐╤А╨╡╨┤╨╡╨╗╤П╤О╤В╤Б╤П ╨┤╨╡╨╣╤Б╤В╨▓╤Г╤О╤Й╨╕╨╝ ╨╖╨░╨║╨╛╨╜╨╛╨┤╨░╤В╨╡╨╗╤М╤Б╤В╨▓╨╛╨╝ ╨а╨д, ╨┐╤А╨░╨▓╨╕╨╗╨░╨╝╨╕ ╤Б╨╛╨╛╤В╨▓╨╡╤В╤Б╤В╨▓╤Г╤О╤Й╨╕╤Е ╨┐╤А╨╛╨│╤А╨░╨╝╨╝ ╨Э╨Я╨д, ╤Г╤Б╨╗╨╛╨▓╨╕╤П╨╝╨╕ ╨▒╤А╨╛╨║╨╡╤А╤Б╨║╨╛╨│╨╛ ╨╛╨▒╤Б╨╗╤Г╨╢╨╕╨▓╨░╨╜╨╕╤П ╨╕ ╤Б╤В╤А╨░╤Е╨╛╨▓╤Л╨╝╨╕ ╨┤╨╛╨║╤Г╨╝╨╡╨╜╤В╨░╨╝╨╕ ╨┐╤А╨╛╨┤╤Г╨║╤В╨░.
                  </div>
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
            footerText: resolvedFooterText,
                    title: '╨У╤А╨░╤Д╨╕╨║ ╨┤╨╛╤Б╤В╨╕╨╢╨╡╨╜╨╕╤П ╤Ж╨╡╨╗╨╡╨╣',
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

module.exports = {
    buildRostechPensionPagesHtmlLegacy,
};

