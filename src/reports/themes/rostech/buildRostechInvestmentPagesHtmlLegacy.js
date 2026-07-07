const path = require('path');
const { resolveGoalCardImageSrc } = require('../../summary/buildSummaryOverviewHtml');
const { resolveReportRasterRef } = require('../../../utils/reportRasterSrc');
const {
    buildRostechStandardTailHtmlPages,
    rostechInvestmentPdfUtils: U,
} = require('./buildRostechPensionPagesHtml');
const { resolveRostechStyleReportBranding } = require('./rostechStyleReportBranding');

const { esc, money, moneyPerMonth, moneyWithPrecision, pickPositive, getCofinancingRateTextByIncome } = U;
const {
    calculateAugNextYearEffectivenessPercent,
    extractPensionPlanFacts,
    calculateOwnFundsFromSchedule,
    buildShell,
    isScheduleInitialLumpRow,
} = U;

const INVEST_GOAL_LABEL = '╨б╨╛╤Е╤А╨░╨╜╨╕╤В╤М ╨╕ ╨┐╤А╨╕╤Г╨╝╨╜╨╛╨╢╨╕╤В╤М';
const DISCLAIMER = `╨д╨╕╨╜╨░╨╜╤Б╨╛╨▓╤Л╨╣ ╨┐╨╗╨░╨╜ ╨╜╨╡ ╤П╨▓╨╗╤П╨╡╤В╤Б╤П ╨║╨╛╨╝╨╝╨╡╤А╤З╨╡╤Б╨║╨╕╨╝ ╨┐╤А╨╡╨┤╨╗╨╛╨╢╨╡╨╜╨╕╨╡╨╝ ╨╕╨╗╨╕ ╨┤╨╛╨│╨╛╨▓╨╛╤А╨╛╨╝,\n╨╜╨╛╤Б╨╕╤В ╨╕╤Б╨║╨╗╤О╤З╨╕╤В╨╡╨╗╤М╨╜╨╛ ╨╕╨╜╤Д╨╛╤А╨╝╨░╤Ж╨╕╨╛╨╜╨╜╤Л╨╣ ╤Е╨░╤А╨░╨║╤В╨╡╤А.`;

function computeInvestmentEndContext(goal, s) {
    const targetMonths = Number(s.target_months ?? s.term_months ?? 0);
    const schedule = Array.isArray(goal?.details?.monthly_schedule)
        ? goal.details.monthly_schedule
              .filter((row) => row && row.date)
              .slice()
              .sort((a, b) => new Date(a.date) - new Date(b.date))
        : [];
    const baseRow =
        schedule.find((row) => row && row.date && !isScheduleInitialLumpRow(row)) || schedule[0] || null;
    const base = baseRow
        ? new Date(`${baseRow.date}T00:00:00Z`)
        : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const end = new Date(base);
    if (Number.isFinite(targetMonths) && targetMonths > 0) {
        end.setUTCMonth(end.getUTCMonth() + targetMonths);
    }
    const monthsRu = [
        '╤П╨╜╨▓╨░╤А╤П',
        '╤Д╨╡╨▓╤А╨░╨╗╤П',
        '╨╝╨░╤А╤В╨░',
        '╨░╨┐╤А╨╡╨╗╤П',
        '╨╝╨░╤П',
        '╨╕╤О╨╜╤П',
        '╨╕╤О╨╗╤П',
        '╨░╨▓╨│╤Г╤Б╤В╨░',
        '╤Б╨╡╨╜╤В╤П╨▒╤А╤П',
        '╨╛╨║╤В╤П╨▒╤А╤П',
        '╨╜╨╛╤П╨▒╤А╤П',
        '╨┤╨╡╨║╨░╨▒╤А╤П',
    ];
    const dateLong = `${end.getUTCDate()} ${monthsRu[end.getUTCMonth()]} ${end.getUTCFullYear()} ╨│.`;
    return { year: end.getUTCFullYear(), dateLong, end };
}

/**
 * ╨а╨╛╤Б╤В╨╡╤Е PDF: ╤Ж╨╡╨╗╤М INVESTMENT (╨б╨╛╤Е╤А╨░╨╜╨╕╤В╤М ╨╕ ╨┐╤А╨╕╤Г╨╝╨╜╨╛╨╢╨╕╤В╤М). ╨Я╨╡╨╜╤Б╨╕╨╛╨╜╨╜╤Л╨╣ ╨▒╨╕╨╗╨┤╨╡╤А ╨╜╨╡ ╤В╤А╨╛╨│╨░╨╡╨╝.
 */
async function buildRostechInvestmentPagesHtmlLegacy({ goal, clientName, options = {} }) {
    const root = path.join(__dirname, '../../../..');
    const inlineLocalAssets = Boolean(options.inlineLocalAssets);
    const brand = resolveRostechStyleReportBranding(options.projectId);
    const footerInvest = brand.footerInvestment;
    const logoFromSettings = options.logoSrc
        ? await resolveReportRasterRef(options.logoSrc, root, root, inlineLocalAssets)
        : '';
    const bgSrc = options.backgroundSrc
        ? await resolveReportRasterRef(options.backgroundSrc, root, root, inlineLocalAssets)
        : '';
    const cardImg = await resolveGoalCardImageSrc('INVESTMENT', root, inlineLocalAssets, root);
    const rostechAvatar59Src = await resolveReportRasterRef(
        'assets/reports/rostech/pension-avatar-59-31-lite.webp',
        root,
        root,
        inlineLocalAssets
    );
    const investmentGoalSrc = await resolveReportRasterRef(
        'assets/reports/rostech/investment-goal-59-28-lite.webp',
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

    const s = goal?.summary || {};
    const monthly = Number(s.monthly_replenishment ?? 0);
    const initial = Number(s.initial_capital ?? 0);
    const accumulationYieldPercent = Number(s.accumulation_yield_percent ?? 0);
    const totalCapitalEnd = Number(s.projected_capital_at_end ?? 0);
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
    const { year: displayEndYear, dateLong: displayEndDateLong } = computeInvestmentEndContext(goal, s);

    const clientFirstName =
        String(clientName || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean)[0] || '╨Ъ╨╗╨╕╨╡╨╜╤В';

    const currentIncomeMonthly = pickPositive(
        goal?.client?.avg_monthly_income ??
            goal?.avg_monthly_income ??
            s.avg_monthly_income ??
            options?.clientAvgMonthlyIncome ??
            options?.overallPlan?.avg_monthly_income,
        110000
    );
    const cofinancingRateText = getCofinancingRateTextByIncome(currentIncomeMonthly);

    const planFacts = extractPensionPlanFacts(goal?.details?.monthly_schedule, {
        initialCapital: initial,
        monthlyContribution: monthly,
        taxDeductionAmount: deduction2026,
        taxDeductionYear: nextCalendarYear,
        cofinancingAmount: cofinancing2026,
        cofinancingYear: nextCalendarYear,
    });

    const ownFundsFallback = Math.max(initial + monthly * Math.max(targetMonths, 0), 0);
    const ownFundsForPlan = calculateOwnFundsFromSchedule(goal?.details?.monthly_schedule, ownFundsFallback);
    const incomeAndBenefitsForPlan = Math.max(totalCapitalEnd - ownFundsForPlan, 0);
    const totalPlanBase = Math.max(ownFundsForPlan, 1);
    const totalYieldPercent = Math.max((incomeAndBenefitsForPlan / totalPlanBase) * 100, 0);
    const maxPlanBarValue = Math.max(ownFundsForPlan, incomeAndBenefitsForPlan, totalCapitalEnd, 1);
    const ownFundsBarHeight = Math.max(20, Math.round((ownFundsForPlan / maxPlanBarValue) * 88));
    const incomeBarHeight = Math.max(20, Math.round((incomeAndBenefitsForPlan / maxPlanBarValue) * 88));
    const totalBarHeight = Math.max(20, Math.round((totalCapitalEnd / maxPlanBarValue) * 88));
    const yearlyEffectiveness = calculateAugNextYearEffectivenessPercent(goal?.details?.monthly_schedule);
    const highlightedYieldPercent = Number.isFinite(yearlyEffectiveness.percent)
        ? yearlyEffectiveness.percent
        : totalYieldPercent;
    const highlightedYieldYear = Number.isFinite(yearlyEffectiveness.startYear)
        ? yearlyEffectiveness.startYear
        : new Date().getFullYear();

    const chartMaxIntro = Math.max(initial, totalCapitalEnd, 1);
    const introLeftH = Math.max(20, Math.round((initial / chartMaxIntro) * 104));
    const introRightH = Math.max(20, Math.round((totalCapitalEnd / chartMaxIntro) * 104));

    const deductionLine =
        Number.isFinite(deduction2026) && deduction2026 > 0
            ? moneyWithPrecision(deduction2026, 2)
            : money(deduction2026);

    return [
        buildShell({
            title: '╨Т╨░╤И ╤Д╨╕╨╜╨░╨╜╤Б╨╛╨▓╤Л╨╣ ╨┐╨╗╨░╨╜',
            subtitle: '',
            logoSrc: tenantLogoSrc,
            bgSrc,
            useBackground: false,
            footerText: DISCLAIMER,
            footerLogoSrc: tenantLogoSrc,
            bodyHtml: `
              <div style="display:flex;gap:10px;align-items:flex-start;">
                <img src="${esc(rostechAvatar59Src || cardImg)}" alt="" style="width:60px;height:68px;object-fit:cover;border-radius:8px;flex-shrink:0;" />
                <div style="flex:1;min-width:0;background:#fff;border:1px solid #f1f1f1;border-radius:10px;padding:10px;">
                  <div style="font-size:13px;line-height:14px;color:#212121;">
                    ╨п ╨┐╨╛╨┤╨│╨╛╤В╨╛╨▓╨╕╨╗╨░ ╨┤╨╡╤В╨░╨╗╤М╨╜╤Л╨╣ ╨┐╨╗╨░╨╜ ╨┤╨╗╤П ╨┤╨╛╤Б╤В╨╕╨╢╨╡╨╜╨╕╤П ╨Т╨░╤И╨╡╨╣ ╤Д╨╕╨╜╨░╨╜╤Б╨╛╨▓╨╛╨╣ ╤Ж╨╡╨╗╨╕.<br/><br/>
                    ╨Т╨░╤И ╤В╨╡╨║╤Г╤Й╨╕╨╣ ╨┤╨╛╤Е╨╛╨┤ тАФ ${esc(money(currentIncomeMonthly))}/╨╝╨╡╤Б. ╨┐╨╛╤Б╨╗╨╡ ╨▓╤Л╤З╨╡╤В╨░ ╨Э╨Ф╨д╨Ы.<br/><br/>
                    ╨Т╨░╤И╨░ ╤Д╨╕╨╜╨░╨╜╤Б╨╛╨▓╨░╤П ╤Ж╨╡╨╗╤М:
                  </div>
                  <div style="display:flex;gap:24px;align-items:flex-start;margin-top:12px;">
                    <img src="${esc(investmentGoalSrc || cardImg)}" alt="" style="width:120px;height:70px;object-fit:cover;border-radius:8px;flex-shrink:0;" />
                    <div style="font-size:13px;line-height:14px;color:#212121;">
                      <b>1. ${esc(INVEST_GOAL_LABEL)}</b><br/><br/>
                      ╨Я╨╡╤А╨▓╨╛╨╜╨░╤З╨░╨╗╤М╨╜╤Л╨╣ ╨║╨░╨┐╨╕╤В╨░╨╗ тАФ ${esc(money(initial))}<br/>
                      ╨Я╨╛╨┐╨╛╨╗╨╜╨╡╨╜╨╕╨╡ ╨║╨░╨┐╨╕╤В╨░╨╗╨░ тАФ ${esc(moneyPerMonth(monthly))}<br/>
                      ╨б╤А╨╛╨║ ╨┤╨╛╤Б╤В╨╕╨╢╨╡╨╜╨╕╤П тАФ ${esc(displayEndYear)} ╨│.
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
                  ╨Я╤А╨╛╨│╨╜╨╛╨╖ ╤А╨╛╤Б╤В╨░ ╨║╨░╨┐╨╕╤В╨░╨╗╨░
                </div>
                <div style="display:flex;justify-content:space-evenly;align-items:flex-end;gap:38px;padding-top:8px;">
                  <div style="width:190px;text-align:center;">
                    <div style="font-size:16px;font-weight:400;line-height:18px;">${esc(money(initial))}</div>
                    <div style="height:${introLeftH}px;width:53px;background:#8f8f8c;margin:8px auto 0;"></div>
                    <div style="margin-top:12px;font-size:14px;line-height:16px;color:#212121;">╨Я╨╡╤А╨▓╨╛╨╜╨░╤З╨░╨╗╤М╨╜╤Л╨╣<br/>╨║╨░╨┐╨╕╤В╨░╨╗</div>
                  </div>
                  <div style="width:220px;text-align:center;">
                    <div style="font-size:16px;font-weight:400;line-height:18px;">${esc(money(totalCapitalEnd))}</div>
                    <div style="height:${introRightH}px;width:53px;background:#722257;margin:8px auto 0;"></div>
                    <div style="margin-top:12px;font-size:14px;line-height:16px;color:#212121;">╨Я╤А╨╛╨│╨╜╨╛╨╖╨╜╤Л╨╣ ╨║╨░╨┐╨╕╤В╨░╨╗</div>
                  </div>
                </div>
              </div>
            `,
        }),
        buildShell({
            title: '╨Я╤А╨╡╨┤╨╗╨░╨│╨░╨╡╨╝╤Л╨╣ ╨┐╨╗╨░╨╜',
            subtitle: '╨У╤А╨░╤Д╨╕╨║ ╨┤╨╛╤Б╤В╨╕╨╢╨╡╨╜╨╕╤П ╤Ж╨╡╨╗╨╕',
            logoSrc: tenantLogoSrc,
            bgSrc,
            showTop: false,
            pagePaddingTop: 16,
            footerText: footerInvest,
            bodyHtml: `
              <div style="display:flex;gap:10px;align-items:flex-start;">
                <img src="${esc(rostechAvatar59Src || cardImg)}" alt="" style="width:56px;height:64px;object-fit:cover;border-radius:10px;flex-shrink:0;" />
                <div style="flex:1;border:1px solid #e2e2e2;border-radius:10px;background:#fff;padding:8px 10px;">
                  <div style="font-size:12px;line-height:1.25;color:#424242;">
                    ${esc(clientFirstName)}, ╨┤╨╗╤П ╤В╨╛╨│╨╛ ╤З╤В╨╛╨▒╤Л ╨Т╤Л ╤Б╨╝╨╛╨│╨╗╨╕ ╨╜╨░╨║╨╛╨┐╨╕╤В╤М ${esc(money(totalCapitalEnd))}, ╤П ╨┐╨╛╨┤╨│╨╛╤В╨╛╨▓╨╕╨╗╨░ ╤Д╨╕╨╜╨░╨╜╤Б╨╛╨▓╤Л╨╣ ╨┐╨╗╨░╨╜.
                  </div>
                  <div style="display:flex;gap:10px;align-items:flex-start;margin-top:6px;">
                    <img src="${esc(investmentGoalSrc || cardImg)}" alt="" style="width:100px;height:58px;object-fit:cover;border-radius:8px;flex-shrink:0;filter:grayscale(100%);" />
                    <div style="font-size:12px;line-height:1.28;color:#424242;">
                      ╨Ф╨░╤В╨░ ╨┤╨╛╤Б╤В╨╕╨╢╨╡╨╜╨╕╤П тАФ ${esc(displayEndDateLong)}
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
                &nbsp;&nbsp;&nbsp;&nbsp;тАв ╨Т╨╜╨╡╤Б╤В╨╕ ╨┐╨╡╤А╨▓╨╛╨╜╨░╤З╨░╨╗╤М╨╜╤Л╨╣ ╨║╨░╨┐╨╕╤В╨░╨╗ - ${esc(money(initial))}.<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;тАв ╨Т ╤Б╨╗╨╡╨┤╤Г╤О╤Й╨╕╨╡ ╨╝╨╡╤Б╤П╤Ж╤Л ╨┐╨╛╨┐╨╛╨╗╨╜╤П╤В╤М ╨┐╨╛ ${esc(money(monthly))}.<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;тАв ╨Я╨╛╨╗╤Г╤З╨╕╤В╤М ${esc(money(planFacts.cofinancingAmount))} ╨▓ ${planFacts.cofinancingYear || nextCalendarYear} ╨│╨╛╨┤╤Г ╨╛╤В ╨│╨╛╤Б╤Г╨┤╨░╤А╤Б╤В╨▓╨░.<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;тАв ╨Т ${planFacts.taxDeductionYear || nextCalendarYear} ╨│. ╨┐╨╛╨┤╨░╤В╤М ╨╜╨░ ╨╜╨░╨╗╨╛╨│╨╛╨▓╤Л╨╣ ╨▓╤Л╤З╨╡╤В ${esc(moneyWithPrecision(planFacts.taxDeductionAmount, 2))} (╤А╨░╤Б╤Б╤З╨╕╤В╨░╨╜ ╨┐╨╛ ╤Б╤В╨░╨▓╨║╨╡ 13% ╨Э╨Ф╨д╨Ы).<br/>
                <span style="color:#722257;font-weight:700;">&nbsp;&nbsp;&nbsp;&nbsp;тАв ╨Я╤А╨╛╨│╨╜╨╛╨╖╨╕╤А╤Г╨╡╨╝╨░╤П ╨┤╨╛╤Е╨╛╨┤╨╜╨╛╤Б╤В╤М ╤Б ╤Г╤З╨╡╤В╨╛╨╝ ╤Б╨╛╤Д╨╕╨╜╨░╨╜╤Б╨╕╤А╨╛╨▓╨░╨╜╨╕╤П, ╨╜╨░╨╗╨╛╨│╨╛╨▓╨╛╨│╨╛ ╨▓╤Л╤З╨╡╤В╨░, ╨┤╨╛╤Е╨╛╨┤╨╜╨╛╤Б╤В╨╕ ╨╛╤В ╨╕╨╜╨▓╨╡╤Б╤В╨╕╤Ж╨╕╨╣ ╨╖╨░ ${highlightedYieldYear} ╨│╨╛╨┤ - ${esc(highlightedYieldPercent.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}% ╨│╨╛╨┤╨╛╨▓╤Л╤Е.</span><br/>
                &nbsp;&nbsp;&nbsp;&nbsp;тАв ╨Р╨║╤В╤Г╨░╨╗╨╕╨╖╨╕╤А╨╛╨▓╨░╤В╤М ╤Д╨╕╨╜╨░╨╜╤Б╨╛╨▓╤Л╨╣ ╨┐╨╗╨░╨╜ ╤З╨╡╤А╨╡╨╖ 6 ╨╝╨╡╤Б.<br/>
                <br/>
                3. ╨Ъ╨░╨║ ╤А╨░╤Б╤В╤С╤В ╨║╨░╨┐╨╕╤В╨░╨╗?<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;тАв ╨Ч╨░ ╤Б╤З╤С╤В ╨┐╨╛╨┐╨╛╨╗╨╜╨╡╨╜╨╕╤П, ╤Б╨╛╤Д╨╕╨╜╨░╨╜╤Б╨╕╤А╨╛╨▓╨░╨╜╨╕╤П, ╨╕╨╜╨▓╨╡╤Б╤В╨╕╤Ж╨╕╨╛╨╜╨╜╨╛╨│╨╛ ╨┤╨╛╤Е╨╛╨┤╨░ ╨Т╤Л ╨╜╨░╨║╨╛╨┐╨╕╤В╨╡ ${esc(money(totalCapitalEnd))}.
              </div>
              <div style="margin-top:12px;font-size:10px;line-height:1.15;color:#212121;text-align:center;font-weight:700;">
                ╨У╤А╨░╤Д╨╕╨║ ╨┤╨╛╤Б╤В╨╕╨╢╨╡╨╜╨╕╤П ╤Ж╨╡╨╗╨╕
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
                <div style="position:absolute;left:282px;bottom:4px;width:102px;text-align:center;font-size:10px;color:#fff;">${esc(money(totalCapitalEnd))}</div>
              </div>
              <div style="display:flex;justify-content:center;gap:14px;margin-top:6px;font-size:10px;color:#424242;line-height:1.2;">
                <span><span style="display:inline-block;width:8px;height:8px;background:#9f9f9f;border-radius:2px;vertical-align:middle;margin-right:5px;"></span>╨б╨╛╨▒╤Б╤В╨▓╨╡╨╜╨╜╤Л╨╡ ╤Б╤А╨╡╨┤╤Б╤В╨▓╨░</span>
                <span><span style="display:inline-block;width:8px;height:8px;background:#000000;border-radius:2px;vertical-align:middle;margin-right:5px;"></span>╨Я╤А╨╛╤Ж╨╡╨╜╤В╨╜╤Л╨╣ ╨┤╨╛╤Е╨╛╨┤, ╤Б╨╛╤Д╨╕╨╜╨░╨╜╤Б╨╕╤А╨╛╨▓╨░╨╜╨╕╨╡, ╨╜╨░╨╗╨╛╨│╨╛╨▓╤Л╨╡ ╨▓╤Л╤З╨╡╤В╤Л</span>
                <span><span style="display:inline-block;width:8px;height:8px;background:#722257;border-radius:2px;vertical-align:middle;margin-right:5px;"></span>╨Ш╤В╨╛╨│╨╛ ╨║╨░╨┐╨╕╤В╨░╨╗</span>
              </div>
              <div style="margin-top:12px;border:1px solid #8a2d69;border-radius:8px;padding:6px 10px;text-align:center;font-size:16px;line-height:1.15;color:#722257;font-weight:700;">
                ╨а╨░╤Б╤З╨╡╤В╨╜╨░╤П ╨┤╨╛╤Е╨╛╨┤╨╜╨╛╤Б╤В╤М ╨Т╨░╤И╨╡╨│╨╛ ╨┐╨╗╨░╨╜╨░ ╨╜╨░ ╨▓╨╡╤Б╤М ╤Б╤А╨╛╨║ - ${esc((Number.isFinite(accumulationYieldPercent) && accumulationYieldPercent > 0 ? accumulationYieldPercent : totalYieldPercent).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 2 }))}% ╨│╨╛╨┤╨╛╨▓╤Л╤Е
              </div>
            `,
        }),
        buildShell({
            title: '╨б╤В╤А╤Г╨║╤В╤Г╤А╨░ ╨┐╨╛╤А╤В╤Д╨╡╨╗╤П ╨Э╨Я╨д',
            subtitle: '╨Ъ╨╛╨╜╤Б╨╡╤А╨▓╨░╤В╨╕╨▓╨╜╤Л╨╣ ╨┐╤А╨╛╤Д╨╕╨╗╤М ╤Б ╨║╨╛╨╜╤В╤А╨╛╨╗╨╡╨╝ ╤А╨╕╤Б╨║╨░',
            logoSrc: tenantLogoSrc,
            bgSrc,
            showTop: false,
            pagePaddingTop: 18,
            footerText: footerInvest,
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
                    ╨Ш╤В╨░╨║, ╨╡╤Б╨╗╨╕ ╨Т╤Л ╨╜╨░╤З╨╜╨╡╤В╨╡ ╨┐╨╛╨┐╨╛╨╗╨╜╤П╤В╤М ╨║╨░╨┐╨╕╤В╨░╨╗ ╨╜╨░ ${esc(money(monthly))} ╨▓ ╤Н╤В╨╛╨╝ ╨│╨╛╨┤╤Г, ╨╕ ╨▒╤Г╨┤╨╡╤В╨╡ ╨╕╨╜╨┤╨╡╨║╤Б╨╕╤А╨╛╨▓╨░╤В╤М ╨┐╨╛╨┐╨╛╨╗╨╜╨╡╨╜╨╕╨╡ ╨╜╨░ ╨▓╨╡╨╗╨╕╤З╨╕╨╜╤Г ╨╕╨╜╤Д╨╗╤П╤Ж╨╕╨╕, ╤В╨╛ ╨╖╨░ ╤Б╤З╨╡╤В ╨┐╤А╨╛╤Ж╨╡╨╜╤В╨╛╨▓ ╨Т╤Л ╨╜╨░╨║╨╛╨┐╨╕╤В╨╡ ${esc(money(totalCapitalEnd))}.
                  </div>
                  <div style="margin-top:8px;border-radius:9px;overflow:hidden;height:92px;background:#f0f0f0;">
                    <img src="${esc(investmentGoalSrc || cardImg)}" alt="" style="width:100%;height:100%;object-fit:cover;filter:grayscale(100%);" />
                  </div>
                  <div style="margin-top:8px;font-size:10px;line-height:1.2;color:#343434;">
                    ╨Я╨╛ ╨╖╨░╨║╨╛╨╜╤Г ╨Т╤Л ╤Б╨╝╨╛╨╢╨╡╤В╨╡ ╨╖╨░╨▒╤А╨░╤В╤М ╨▓╨╡╤Б╤М ╨║╨░╨┐╨╕╤В╨░╨╗, ╨╡╤Б╨╗╨╕ ╤Б╤А╨╛╨║ ╨╜╨░╨║╨╛╨┐╨╗╨╡╨╜╨╕╨╣ ╤Б╨╛╤Б╤В╨░╨▓╨╕╨╗ 15 ╨╗╨╡╤В
                    ╨╕╨╗╨╕ ╨Т╤Л ╨┤╨╛╤Б╤В╨╕╨│╨╗╨╕ 55 (╨Ц) 60 (╨Ь), ╨▓ ╨╖╨░╨▓╨╕╤Б╨╕╨╝╨╛╤Б╤В╨╕ ╨╛╤В ╤В╨╛╨│╨╛, ╤З╤В╨╛ ╨╜╨░╤Б╤В╤Г╨┐╨╕╨╗╨╛ ╤А╨░╨╜╤М╤И╨╡.
                  </div>
                  <div style="display:flex;justify-content:center;margin-top:10px;">
                    <a href="${esc(startPdsUrl)}" style="display:inline-block;background:#7f1f67;color:#fff;border-radius:12px;padding:8px 28px;font-size:14px;line-height:1;font-weight:700;text-decoration:none;">
                      ╨Э╨░╤З╨░╤В╤М
                    </a>
                  </div>
                  <div style="margin-top:8px;font-size:8px;color:#555;line-height:1.15;">
                    ╨д╨╕╨╜╨░╨╜╤Б╨╛╨▓╤Л╨╣ ╨┐╨╗╨░╨╜ ╨╜╨╡ ╤П╨▓╨╗╤П╨╡╤В╤Б╤П ╨║╨╛╨╝╨╝╨╡╤А╤З╨╡╤Б╨║╨╕╨╝ ╨┐╤А╨╡╨┤╨╗╨╛╨╢╨╡╨╜╨╕╨╡╨╝ ╨╕╨╗╨╕ ╨┤╨╛╨│╨╛╨▓╨╛╤А╨╛╨╝, ╨╜╨╛╤Б╨╕╤В ╨╕╤Б╨║╨╗╤О╤З╨╕╤В╨╡╨╗╤М╨╜╨╛ ╨╕╨╜╤Д╨╛╤А╨╝╨░╤Ж╨╕╨╛╨╜╨╜╤Л╨╣ ╤Е╨░╤А╨░╨║╤В╨╡╤А.
                  </div>
                </div>
              </div>
            `,
        }),
        buildShell({
            title: '╨Ь╨╡╤В╨╛╨┤╨╕╨║╨░ ╤А╨░╤Б╤З╨╡╤В╨░ ╨У╨╛╤Б╨┐╨╡╨╜╤Б╨╕╨╕',
            subtitle: '╨д╨╕╨║╤Б╨╕╤А╨╛╨▓╨░╨╜╨╜╨░╤П ╨▓╤Л╨┐╨╗╨░╤В╨░ + ╨Ш╨Я╨Ъ ├Ч ╤Б╤В╨╛╨╕╨╝╨╛╤Б╤В╤М ╨Ш╨Я╨Ъ',
            logoSrc: tenantLogoSrc,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            footerText: footerInvest,
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
                      <div>╨Э╨░╨╗╨╛╨│╨╛╨▓╤Л╨╣ ╨▓╤Л╤З╨╡╤В ╨╖╨░ ${nextCalendarYear} ╨│. - ${esc(deductionLine)}</div>
                      <div>╨Т╤Б╨╡╨│╨╛ ╨╜╨░╨╗╨╛╨│╨╛╨▓╤Л╤Е ╨▓╤Л╤З╨╡╤В╨╛╨▓ ╨╖╨░ ╨▓╨╡╤Б╤М ╤Б╤А╨╛╨║ - ${esc(money(taxBenefit))}</div>
                    </div>
                  </div>
                </div>

                <div style="position:absolute;left:0;top:552px;width:535px;">
                  <div style="height:33px;background:#722257;border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:center;">
                    <div style="font-size:16px;line-height:14px;font-weight:600;color:#fff;">╨а╨╡╨╖╤О╨╝╨╡</div>
                  </div>
                  <div style="height:205px;background:#f3f3f4;border-radius:0 0 8px 8px;padding:12px 20px 20px;">
                    <div style="font-size:14px;line-height:14px;color:#000;font-weight:600;margin-bottom:8px;">╨ж╨╡╨╗╤М: ${esc(INVEST_GOAL_LABEL)}</div>
                    <div style="font-size:14px;line-height:14px;color:#000;margin-bottom:8px;">╨Ф╨░╤В╨░ - ${esc(displayEndYear)} ╨│.</div>
                    <div style="font-size:14px;line-height:14px;color:#000;margin-bottom:8px;">╨Я╨╡╤А╨▓╨╛╨╜╨░╤З╨░╨╗╤М╨╜╤Л╨╣ ╨║╨░╨┐╨╕╤В╨░╨╗ - ${esc(money(initial))}</div>
                    <div style="font-size:14px;line-height:14px;color:#000;margin-bottom:8px;">╨Я╨╛╨┐╨╛╨╗╨╜╨╡╨╜╨╕╨╡ ╨║╨░╨┐╨╕╤В╨░╨╗╨░ - ${esc(moneyPerMonth(monthly))}</div>
                    <div style="font-size:14px;line-height:14px;color:#000;margin-bottom:8px;">╨Т╤Б╨╡╨│╨╛ ╤Б╨╛╤Д╨╕╨╜╨░╨╜╤Б╨╕╤А╨╛╨▓╨░╨╜╨╕╨╡ - ${esc(money(cofin))}</div>
                    <div style="font-size:14px;line-height:14px;color:#000;margin-bottom:8px;">╨Т╤Б╨╡╨│╨╛ ╨╜╨░╨╗╨╛╨│╨╛╨▓╤Л╤Е ╨▓╤Л╤З╨╡╤В╨╛╨▓ - ${esc(money(taxBenefit))}</div>
                    <div style="height:1px;background:#722257;margin:12px 0;"></div>
                    <div style="font-size:15px;line-height:16px;font-weight:700;color:#000;">╨Я╤А╨╛╨│╨╜╨╛╨╖ ╨┐╨╛ ╨╕╤В╨╛╨│╨╛╨▓╨╛╨╝╤Г ╨║╨░╨┐╨╕╤В╨░╨╗╤Г - ${esc(money(totalCapitalEnd))}</div>
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
            footerText: footerInvest,
        }),
    ];
}

module.exports = { buildRostechInvestmentPagesHtmlLegacy };
