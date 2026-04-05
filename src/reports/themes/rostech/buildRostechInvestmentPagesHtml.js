const path = require('path');
const { resolveGoalCardImageSrc } = require('../../summary/buildSummaryOverviewHtml');
const { resolveReportRasterRef } = require('../../../utils/reportRasterSrc');
const {
    buildRostechStandardTailHtmlPages,
    rostechInvestmentPdfUtils: U,
} = require('./buildRostechPensionPagesHtml');

const { esc, money, moneyPerMonth, moneyWithPrecision, pickPositive, getCofinancingRateTextByIncome } = U;
const {
    calculateAugNextYearEffectivenessPercent,
    extractPensionPlanFacts,
    calculateOwnFundsFromSchedule,
    buildShell,
} = U;

const INVEST_GOAL_LABEL = 'Сохранить и приумножить';
const FOOTER_INVEST = 'НПФ Ростех • Сохранить и приумножить';
const DISCLAIMER = `Финансовый план не является коммерческим предложением или договором,\nносит исключительно информационный характер.`;

function computeInvestmentEndContext(goal, s) {
    const targetMonths = Number(s.target_months ?? s.term_months ?? 0);
    const schedule = Array.isArray(goal?.details?.monthly_schedule)
        ? goal.details.monthly_schedule
              .filter((row) => row && row.date)
              .slice()
              .sort((a, b) => new Date(a.date) - new Date(b.date))
        : [];
    const base =
        schedule.length > 0
            ? new Date(`${schedule[0].date}T00:00:00Z`)
            : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const end = new Date(base);
    if (Number.isFinite(targetMonths) && targetMonths > 0) {
        end.setUTCMonth(end.getUTCMonth() + targetMonths);
    }
    const monthsRu = [
        'января',
        'февраля',
        'марта',
        'апреля',
        'мая',
        'июня',
        'июля',
        'августа',
        'сентября',
        'октября',
        'ноября',
        'декабря',
    ];
    const dateLong = `${end.getUTCDate()} ${monthsRu[end.getUTCMonth()]} ${end.getUTCFullYear()} г.`;
    return { year: end.getUTCFullYear(), dateLong, end };
}

/**
 * Ростех PDF: цель INVESTMENT (Сохранить и приумножить). Пенсионный билдер не трогаем.
 */
async function buildRostechInvestmentPagesHtml({ goal, clientName, options = {} }) {
    const root = path.join(__dirname, '../../../..');
    const inlineLocalAssets = Boolean(options.inlineLocalAssets);
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
    const rostechLogo59Src = await resolveReportRasterRef(
        'assets/reports/rostech/rostech-logo-59-51-lite.webp',
        root,
        root,
        inlineLocalAssets
    );
    const startPdsUrl = 'https://lk.rostecnpf.ru/new-contract/pds/';

    const s = goal?.summary || {};
    const monthly = Number(s.monthly_replenishment ?? 0);
    const initial = Number(s.initial_capital ?? 0);
    const inflationRate = Number(s.inflation_rate ?? 0);
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
            .filter(Boolean)[0] || 'Клиент';

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

    const inflationLabel =
        Number.isFinite(inflationRate) && inflationRate > 0
            ? `${inflationRate.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`
            : '5,6%';

    const chartMaxIntro = Math.max(initial, totalCapitalEnd, 1);
    const introLeftH = Math.max(20, Math.round((initial / chartMaxIntro) * 104));
    const introRightH = Math.max(20, Math.round((totalCapitalEnd / chartMaxIntro) * 104));

    const deductionLine =
        Number.isFinite(deduction2026) && deduction2026 > 0
            ? moneyWithPrecision(deduction2026, 2)
            : money(deduction2026);

    return [
        buildShell({
            title: 'Ваш финансовый план',
            subtitle: '',
            logoSrc: rostechLogo59Src || logoFromSettings,
            bgSrc,
            useBackground: false,
            footerText: DISCLAIMER,
            footerLogoSrc: rostechLogo59Src || logoFromSettings || '',
            bodyHtml: `
              <div style="display:flex;gap:10px;align-items:flex-start;">
                <img src="${esc(rostechAvatar59Src || cardImg)}" alt="" style="width:60px;height:68px;object-fit:cover;border-radius:8px;flex-shrink:0;" />
                <div style="flex:1;min-width:0;background:#fff;border:1px solid #f1f1f1;border-radius:10px;padding:10px;">
                  <div style="font-size:13px;line-height:14px;color:#212121;">
                    Я подготовила детальный план для достижения Вашей финансовой цели.<br/><br/>
                    Ваш текущий доход — ${esc(money(currentIncomeMonthly))}/мес. после вычета НДФЛ.<br/><br/>
                    Ваша финансовая цель:
                  </div>
                  <div style="display:flex;gap:24px;align-items:flex-start;margin-top:12px;">
                    <img src="${esc(investmentGoalSrc || cardImg)}" alt="" style="width:120px;height:70px;object-fit:cover;border-radius:8px;flex-shrink:0;" />
                    <div style="font-size:13px;line-height:14px;color:#212121;">
                      <b>1. ${esc(INVEST_GOAL_LABEL)}</b><br/><br/>
                      Первоначальный капитал — ${esc(money(initial))}<br/>
                      Пополнение капитала — ${esc(moneyPerMonth(monthly))}<br/>
                      Срок достижения — ${esc(displayEndYear)} г.
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
                  Прогноз роста капитала
                </div>
                <div style="display:flex;justify-content:space-evenly;align-items:flex-end;gap:38px;padding-top:8px;">
                  <div style="width:190px;text-align:center;">
                    <div style="font-size:16px;font-weight:400;line-height:18px;">${esc(money(initial))}</div>
                    <div style="height:${introLeftH}px;width:53px;background:#8f8f8c;margin:8px auto 0;"></div>
                    <div style="margin-top:12px;font-size:14px;line-height:16px;color:#212121;">Первоначальный<br/>капитал</div>
                  </div>
                  <div style="width:220px;text-align:center;">
                    <div style="font-size:16px;font-weight:400;line-height:18px;">${esc(money(totalCapitalEnd))}</div>
                    <div style="height:${introRightH}px;width:53px;background:#722257;margin:8px auto 0;"></div>
                    <div style="margin-top:12px;font-size:14px;line-height:16px;color:#212121;">Прогнозный капитал<br/>с учётом инфляции ${esc(inflationLabel)} в год</div>
                  </div>
                </div>
              </div>
            `,
        }),
        buildShell({
            title: 'Предлагаемый план',
            subtitle: 'График достижения цели',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 16,
            footerText: FOOTER_INVEST,
            bodyHtml: `
              <div style="display:flex;gap:10px;align-items:flex-start;">
                <img src="${esc(rostechAvatar59Src || cardImg)}" alt="" style="width:56px;height:64px;object-fit:cover;border-radius:10px;flex-shrink:0;" />
                <div style="flex:1;border:1px solid #e2e2e2;border-radius:10px;background:#fff;padding:8px 10px;">
                  <div style="font-size:12px;line-height:1.25;color:#424242;">
                    ${esc(clientFirstName)}, для того чтобы Вы смогли накопить ${esc(money(totalCapitalEnd))}, я подготовила финансовый план.
                  </div>
                  <div style="display:flex;gap:10px;align-items:flex-start;margin-top:6px;">
                    <img src="${esc(investmentGoalSrc || cardImg)}" alt="" style="width:100px;height:58px;object-fit:cover;border-radius:8px;flex-shrink:0;filter:grayscale(100%);" />
                    <div style="font-size:12px;line-height:1.28;color:#424242;">
                      Дата достижения — ${esc(displayEndDateLong)}
                    </div>
                  </div>
                </div>
              </div>
              <div style="font-size:11px;line-height:1.33;color:#212121;margin-top:10px;">
                <b>Предлагаемый план:</b><br/>
                <br/>
                1. Заключить договор долгосрочных сбережений (ПДС) в АО «НПФ «Ростех».<br/>
                Плюсы:<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;• Государство будет добавлять до 36 000 руб./год в течение 10 лет.<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;• Налоговые вычеты (до 22% в год со взносов в пределах 400 000 руб.).<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;• Капитал застрахован (до 2,8 млн руб.).<br/>
                <br/>
                2. Дальнейшие шаги:<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;• Внести первоначальный капитал - ${esc(money(planFacts.initialCapital))}.<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;• В следующие месяцы пополнять по ${esc(money(planFacts.monthlyContribution))}.<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;• Получить ${esc(money(planFacts.cofinancingAmount))} в ${planFacts.cofinancingYear || nextCalendarYear} году от государства.<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;• В ${planFacts.taxDeductionYear || nextCalendarYear} г. подать на налоговый вычет ${esc(moneyWithPrecision(planFacts.taxDeductionAmount, 2))} (рассчитан по ставке 13% НДФЛ).<br/>
                <span style="color:#722257;font-weight:700;">&nbsp;&nbsp;&nbsp;&nbsp;• Прогнозируемая доходность с учетом софинансирования, налогового вычета, доходности от инвестиций за ${highlightedYieldYear} год - ${esc(highlightedYieldPercent.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}% годовых.</span><br/>
                &nbsp;&nbsp;&nbsp;&nbsp;• Актуализировать финансовый план через 6 мес.<br/>
                <br/>
                3. Как растёт капитал?<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;• За счёт пополнения, софинансирования, инвестиционного дохода Вы накопите ${esc(money(totalCapitalEnd))}.
              </div>
              <div style="margin-top:12px;font-size:10px;line-height:1.15;color:#212121;text-align:center;font-weight:700;">
                График достижения цели
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
                <span><span style="display:inline-block;width:8px;height:8px;background:#9f9f9f;border-radius:2px;vertical-align:middle;margin-right:5px;"></span>Собственные средства</span>
                <span><span style="display:inline-block;width:8px;height:8px;background:#000000;border-radius:2px;vertical-align:middle;margin-right:5px;"></span>Процентный доход, софинансирование, налоговые вычеты</span>
                <span><span style="display:inline-block;width:8px;height:8px;background:#722257;border-radius:2px;vertical-align:middle;margin-right:5px;"></span>Итого капитал</span>
              </div>
              <div style="margin-top:12px;border:1px solid #8a2d69;border-radius:8px;padding:6px 10px;text-align:center;font-size:16px;line-height:1.15;color:#722257;font-weight:700;">
                Расчетная доходность Вашего плана на весь срок - ${esc((Number.isFinite(accumulationYieldPercent) && accumulationYieldPercent > 0 ? accumulationYieldPercent : totalYieldPercent).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 2 }))}% годовых
              </div>
            `,
        }),
        buildShell({
            title: 'Структура портфеля НПФ',
            subtitle: 'Консервативный профиль с контролем риска',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 18,
            footerText: FOOTER_INVEST,
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
                    Итак, если Вы начнете пополнять капитал на ${esc(money(planFacts.monthlyContribution))} в этом году, и будете индексировать пополнение на величину инфляции, то за счет процентов Вы накопите ${esc(money(totalCapitalEnd))}.
                  </div>
                  <div style="margin-top:8px;border-radius:9px;overflow:hidden;height:92px;background:#f0f0f0;">
                    <img src="${esc(investmentGoalSrc || cardImg)}" alt="" style="width:100%;height:100%;object-fit:cover;filter:grayscale(100%);" />
                  </div>
                  <div style="margin-top:8px;font-size:10px;line-height:1.2;color:#343434;">
                    По закону Вы сможете забрать весь капитал, если срок накоплений составил 15 лет
                    или Вы достигли 55 (Ж) 60 (М), в зависимости от того, что наступило раньше.
                  </div>
                  <div style="display:flex;justify-content:center;margin-top:10px;">
                    <a href="${esc(startPdsUrl)}" style="display:inline-block;background:#7f1f67;color:#fff;border-radius:12px;padding:8px 28px;font-size:14px;line-height:1;font-weight:700;text-decoration:none;">
                      Начать
                    </a>
                  </div>
                  <div style="margin-top:8px;font-size:8px;color:#555;line-height:1.15;">
                    Финансовый план не является коммерческим предложением или договором, носит исключительно информационный характер.
                  </div>
                </div>
              </div>
            `,
        }),
        buildShell({
            title: 'Методика расчета Госпенсии',
            subtitle: 'Фиксированная выплата + ИПК × стоимость ИПК',
            logoSrc: logoFromSettings,
            bgSrc,
            showTop: false,
            pagePaddingTop: 0,
            footerText: FOOTER_INVEST,
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
                  В соответствии с федеральным законом № 75-ФЗ «О негосударственных пенсионных фондах», государство обязуется добавлять ежегодно ${esc(cofinancingRateText)} на каждый Ваш рубль, но не более 36 000 руб. в год из расчета всех сумм пополнений в течение предыдущего года. И так на протяжении 10 лет.
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
                      <div>Налоговый вычет за ${nextCalendarYear} г. - ${esc(deductionLine)}</div>
                      <div>Всего налоговых вычетов за весь срок - ${esc(money(taxBenefit))}</div>
                    </div>
                  </div>
                </div>

                <div style="position:absolute;left:0;top:552px;width:535px;">
                  <div style="height:33px;background:#722257;border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:center;">
                    <div style="font-size:16px;line-height:14px;font-weight:600;color:#fff;">Резюме</div>
                  </div>
                  <div style="height:205px;background:#f3f3f4;border-radius:0 0 8px 8px;padding:12px 20px 20px;">
                    <div style="font-size:14px;line-height:14px;color:#000;font-weight:600;margin-bottom:8px;">Цель: ${esc(INVEST_GOAL_LABEL)}</div>
                    <div style="font-size:14px;line-height:14px;color:#000;margin-bottom:8px;">Дата - ${esc(displayEndYear)} г.</div>
                    <div style="font-size:14px;line-height:14px;color:#000;margin-bottom:8px;">Первоначальный капитал - ${esc(money(initial))}</div>
                    <div style="font-size:14px;line-height:14px;color:#000;margin-bottom:8px;">Пополнение капитала - ${esc(moneyPerMonth(monthly))}</div>
                    <div style="font-size:14px;line-height:14px;color:#000;margin-bottom:8px;">Всего софинансирование - ${esc(money(cofin))}</div>
                    <div style="font-size:14px;line-height:14px;color:#000;margin-bottom:8px;">Всего налоговых вычетов - ${esc(money(taxBenefit))}</div>
                    <div style="height:1px;background:#722257;margin:12px 0;"></div>
                    <div style="font-size:15px;line-height:16px;font-weight:700;color:#000;">Прогноз по итоговому капиталу - ${esc(money(totalCapitalEnd))}</div>
                  </div>
                </div>
              </div>
            `,
        }),
        ...buildRostechStandardTailHtmlPages({
            goal,
            logoFromSettings,
            bgSrc,
            rostechAvatar59Src,
            cardImg,
            footerText: FOOTER_INVEST,
        }),
    ];
}

module.exports = { buildRostechInvestmentPagesHtml };
