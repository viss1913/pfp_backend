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
        'assets/reports/rostech/pension-avatar-59-31.png',
        root,
        root,
        inlineLocalAssets
    );
    const rostechGoal59Src = await resolveReportRasterRef(
        'assets/reports/rostech/pension-goal-59-32.png',
        root,
        root,
        inlineLocalAssets
    );
    const rostechLogo59Src = await resolveReportRasterRef(
        'assets/reports/rostech/rostech-logo-59-51.png',
        root,
        root,
        inlineLocalAssets
    );

    const s = goal?.summary || {};
    const yearsToPension = Number(goal?.details?.state_pension?.years_to_pension ?? 0);
    const retirementYear = Number(goal?.details?.state_pension?.retirement_year ?? 0);
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

    const title = goal?.goal_name || 'Достойная пенсия';
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
                    Ваш текущий доход — ${esc(money(110000))}/мес. после вычета НДФЛ.<br/><br/>
                    Ваша финансовая цель:
                  </div>
                  <div style="display:flex;gap:24px;align-items:flex-start;margin-top:12px;">
                    <img src="${esc(rostechGoal59Src || cardImg)}" alt="" style="width:120px;height:70px;object-fit:cover;border-radius:8px;flex-shrink:0;" />
                    <div style="font-size:13px;line-height:14px;color:#212121;">
                      <b>1. ${esc(title)}</b><br/><br/>
                      Старт выплат — 2051 г.<br/>
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
                    <div style="margin-top:12px;font-size:14px;line-height:16px;color:#212121;">Желаемая пенсия в 2051 г.<br/>с учетом инфляции 5,6% в год</div>
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
                      Дата достижения — ${Number.isFinite(retirementYear) && retirementYear > 0 ? retirementYear : '2051'} г.<br/><br/>
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
                В нашем плане мы учитываем, что Вы, выйдя на пенсию в ${Number.isFinite(retirementYear) && retirementYear > 0 ? retirementYear : '2051'} году, накопленный капитал разместите на депозитах и/или в облигациях и будете получать ежемесячный доход в виде процентов. Сейчас средняя ставка по депозитам в банках 13,86%, но в нашем плане мы закладываем доходность в ${Number.isFinite(retirementYear) && retirementYear > 0 ? retirementYear : '2051'} г. в размере ${esc((Number.isFinite(payoutYieldPercent) ? payoutYieldPercent : 12).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }))}% годовых или ${esc((Number.isFinite(payoutYieldMonthlyPercent) ? payoutYieldMonthlyPercent : 1).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }))}% в месяц, что по нашему плану и будет равно ${esc(moneyPerMonth(projectedFuture))}.
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
                      <div style="background:#7f1f67;color:#fff;border-radius:12px;padding:5px 22px;font-size:14px;line-height:1;font-weight:700;">
                        Начать
                      </div>
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
            bodyHtml: `
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  Формула прогноза: <b>Госпенсия = Фиксированная выплата + (ИПК × стоимость ИПК)</b>.
                  В модели учитывается инфляция, индексация и горизонт до пенсионного возраста.
                </div>
              </div>
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  Прогноз Госпенсии: <b>${esc(money(projectedFuture))}/мес.</b><br/>
                  В ценах сегодня: <b>${esc(money(projectedPresent))}/мес.</b>
                </div>
              </div>
            `,
        }),
        // 59:657
        buildShell({
            title: 'Важная информация: инфляция',
            subtitle: 'Параметры инфляции и доходности по горизонту цели',
            logoSrc: logoFromSettings,
            bgSrc,
            bodyHtml: `
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  В расчете инфляция и ожидаемая доходность меняются в зависимости от срока достижения цели.
                  Это позволяет не завышать прогноз на длинном горизонте и удерживать консервативные допущения.
                </div>
              </div>
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  При актуализации плана (раз в 6–12 месяцев) параметры инфляции и доходности обновляются.
                </div>
              </div>
            `,
        }),
        // 59:1303
        buildShell({
            title: 'Декларация о рисках ПДС',
            subtitle: '1. Инфляционный риск',
            logoSrc: logoFromSettings,
            bgSrc,
            bodyHtml: `
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  Если фактическая инфляция выше прогноза, реальная покупательная способность капитала снижается.
                  Рекомендация: регулярный пересмотр плана и корректировка суммы пополнений.
                </div>
              </div>
            `,
        }),
        // 59:1335
        buildShell({
            title: 'Декларация о рисках ПДС',
            subtitle: '2. Риск банкротства НПФ',
            logoSrc: logoFromSettings,
            bgSrc,
            bodyHtml: `
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  Риск снижается за счет регулирования ЦБ, требований к структуре активов и системы гарантий.
                  Дополнительно рекомендуется контролировать рейтинг фонда и изменения регуляторики.
                </div>
              </div>
            `,
        }),
        // 59:1419
        buildShell({
            title: 'Декларация о рисках ПДС',
            subtitle: '3. Риск дефолта по ОФЗ',
            logoSrc: logoFromSettings,
            bgSrc,
            bodyHtml: `
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  Для рублевого сегмента ОФЗ рассматриваются как один из наиболее надежных инструментов.
                  В портфеле НПФ доля бумаг контролируется в рамках консервативной политики риска.
                </div>
              </div>
            `,
        }),
        // 59:1363
        buildShell({
            title: 'Декларация о рисках ПДС',
            subtitle: '4. Риски инвестирования в акции',
            logoSrc: logoFromSettings,
            bgSrc,
            bodyHtml: `
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  Акции дают потенциал роста, но несут рыночную волатильность.
                  В плане используется ограниченная доля риск-активов и диверсификация.
                </div>
              </div>
            `,
        }),
        // 59:1391
        buildShell({
            title: 'Декларация о рисках ПДС',
            subtitle: '5. Риски корпоративных облигаций',
            logoSrc: logoFromSettings,
            bgSrc,
            bodyHtml: `
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  Основные риски: кредитный, ликвидности и процентный.
                  Снижение риска достигается отбором эмитентов, лимитами и контролем дюрации.
                </div>
              </div>
            `,
        }),
        // 59:1189
        buildShell({
            title: 'График достижения целей',
            subtitle: 'Помесячная динамика пополнений и капитала',
            logoSrc: logoFromSettings,
            bgSrc,
            bodyHtml: `
              <div class="card">
                <div style="font-size:13px;line-height:1.55;">
                  В таблице отражаются шаги плана: ежемесячные пополнения, налоговые вычеты, софинансирование и итоговый капитал.
                  Фактические значения могут отличаться, поэтому план рекомендуется обновлять не реже 1 раза в год.
                </div>
              </div>
              <div class="pill">Целевой итоговый капитал: ${esc(money(totalCapital))}</div>
            `,
        }),
    ];
}

module.exports = { buildRostechPensionPagesHtml };

