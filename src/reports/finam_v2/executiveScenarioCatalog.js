/**
 * Каталог управленческих сценариев для страницы 5 Finam v2.
 * Тексты — playbook на всех клиентов; цифры подставляются из расчёта.
 * Пороги согласованы с cashflowDiagnostics / goalsDiagnostics.
 */

/** @readonly Пороги выбора сценария (продуктовые константы) */
const EXECUTIVE_SCENARIO_THRESHOLDS = Object.freeze({
    /** Доля дохода на взносы по целям → goal_overload */
    goalLoadRatio: 0.45,
    /** Доля свободного потока после обязательств и ПФП */
    freeCashflowThin: 0.15,
    freeCashflowWorking: 0.30,
    /** Доля ежемесячного ресурса на пенсионную группу → retirement_gap */
    pensionDominantPercent: 40,
});

/**
 * Приоритет сверху вниз (см. docs/plan «Заполнение страницы ИФУС»).
 * @returns {string} ключ сценария
 */
function pickExecutiveScenarioKey({ cashflowDiagnostics, goalsDiagnostics }) {
    const freeRatio = Number(cashflowDiagnostics?.freeCashflowRatio);
    const goalLoadRatio = Number(goalsDiagnostics?.goalLoadRatio ?? cashflowDiagnostics?.goalLoadRatio);
    const reserveGap = !goalsDiagnostics?.hasReserve;
    const protectionGap =
        reserveGap || (!goalsDiagnostics?.hasLife && toFinite(cashflowDiagnostics?.obligations, 0) > 0);
    const pensionDominant =
        goalsDiagnostics?.hasPension &&
        goalsDiagnostics?.largestGroup?.id === 'pension' &&
        goalsDiagnostics.largestGroup.percent >= EXECUTIVE_SCENARIO_THRESHOLDS.pensionDominantPercent;

    if (toFinite(cashflowDiagnostics?.freeCashflow, 0) < 0) return 'cashflow_negative';
    if (Number.isFinite(goalLoadRatio) && goalLoadRatio >= EXECUTIVE_SCENARIO_THRESHOLDS.goalLoadRatio) {
        return 'goal_overload';
    }
    if (protectionGap) return 'protection_gap';
    if (pensionDominant) return 'retirement_gap';
    if (Number.isFinite(freeRatio) && freeRatio < EXECUTIVE_SCENARIO_THRESHOLDS.freeCashflowThin) {
        return 'cashflow_thin';
    }
    if (Number.isFinite(freeRatio) && freeRatio < EXECUTIVE_SCENARIO_THRESHOLDS.freeCashflowWorking) {
        return 'cashflow_working';
    }
    return 'growth_ready';
}

function toFinite(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {object} ctx
 * @param {object} ctx.cashflowDiagnostics
 * @param {object} ctx.goalsDiagnostics
 * @param {object} ctx.portfolio
 * @param {function} ctx.formatMoney
 * @param {function} ctx.formatPercent
 */
function buildExecutiveScenarioCatalog(ctx) {
    const { cashflowDiagnostics, goalsDiagnostics, portfolio, formatMoney, formatPercent } = ctx;
    const freeCashflow = toFinite(cashflowDiagnostics.freeCashflow, 0);
    const freeRatio = Number(cashflowDiagnostics.freeCashflowRatio);
    const freePct = Number.isFinite(freeRatio) ? formatPercent(freeRatio * 100) : '—';
    const loadPct = Number.isFinite(goalsDiagnostics?.goalLoadRatio)
        ? formatPercent(goalsDiagnostics.goalLoadRatio * 100)
        : '—';
    const projected = formatMoney(portfolio.projectedTotal, { short: true }).replace(/\s*₽$/, '');
    const largestGoal = goalsDiagnostics.largestGoal?.title || 'ключевая цель';
    const largestGroup = goalsDiagnostics.largestGroup?.title || 'цели';
    const reserveGap = !goalsDiagnostics.hasReserve;

    return {
        cashflow_negative: {
            headline: 'План требует паузы: сначала закрыть кассовый разрыв',
            lead: 'Главный вопрос — восстановить положительный денежный поток после обязательств и взносов по целям, а не доходность портфеля.',
            keyInsight: `При доходе ${formatMoney(cashflowDiagnostics.income)} и обязательствах ${formatMoney(cashflowDiagnostics.obligations)} план уходит в минус на ${formatMoney(Math.abs(freeCashflow))} в месяц. Новые цели и продукты лучше не добавлять до выравнивания бюджета.`,
            risk: ['Кассовый разрыв', formatMoney(Math.abs(freeCashflow), { short: true }), 'дефицит в месяц после обязательств и ПФП'],
            lever: ['Главный рычаг', '0–90 дней', 'сократить нагрузку и вернуть поток в плюс'],
            decisionRows: [
                ['Сократить нагрузку', 'Остановить рост дефицита и не продавать активы в неудачный момент.', 'Пересчитать взносы и обязательства.'],
                ['Приоритизировать цели', 'Оставить только обязательные цели до выхода cash flow в плюс.', `Первой проверить «${largestGoal}».`],
                ['Зафиксировать контроль', 'Без контроля бюджет снова уйдёт в минус.', 'Сверять факт расходов ежемесячно.'],
            ],
            recommendedScenario:
                'Первые 90 дней — восстановление положительного денежного потока. Затем — резерв и защита жизни, только после этого долгосрочные цели.',
        },
        cashflow_thin: {
            headline: 'План возможен, если жёстко держать свободный поток',
            lead: 'Запас прочности есть, но он тонкий: рост обязательств или взносов быстро ломает траекторию.',
            keyInsight: `После обязательств и ПФП остаётся ${formatMoney(freeCashflow)} — около ${freePct} дохода. План держится на дисциплине и приоритизации, а не на запасе по ИФУС.`,
            risk: ['Тонкий запас', freePct, 'дохода остаётся после обязательств и ПФП'],
            lever: ['Главный рычаг', '12 мес', 'закрепить резерв в месяцах обязательных расходов'],
            decisionRows: [
                ['Зафиксировать резерв', 'Снять риск кассового разрыва и не трогать долгие активы.', 'Держать пополнение резерва первым платежом.'],
                ['Разделить цели', 'Не перегрузить бюджет долгосрочными взносами.', 'Разнести обязательные и опциональные цели.'],
                ['Вести сценарии', 'Показать последствия стресса и роста дохода.', 'Пересматривать план и ИФУС раз в квартал.'],
            ],
            recommendedScenario:
                'Первые 90 дней — защита бюджета и резерв. Следующие 12 месяцев — стабилизация пополнений, затем расширение инвестиционного блока.',
        },
        cashflow_working: {
            headline: 'План рабочий, если сохранить квартальный контроль',
            lead: 'Денежный поток выдерживает текущую структуру целей; важно пересчитывать план при изменении дохода или обязательств.',
            keyInsight: `Свободный поток — ${formatMoney(freeCashflow)} (${freePct} дохода). Этого достаточно для планового движения без агрессивного ускорения.`,
            risk: ['Контроль дисциплины', freePct, 'дохода остаётся после обязательств и ПФП'],
            lever: ['Главный рычаг', 'квартал', 'сверять факт пополнений и ИФУС'],
            decisionRows: [
                ['Сохранить взносы', 'План держится на регулярности, а не на разовых решениях.', 'Зафиксировать автоплатежи или календарь.'],
                ['Проверить сроки', 'Длинные цели чувствительны к просадкам и инфляции.', `Первой сверить группу «${largestGroup}».`],
                ['Держать сценарии', 'Решения — по правилам, а не по эмоциям.', 'Обновлять расчёт и ИФУС раз в квартал.'],
            ],
            recommendedScenario:
                'Базовый сценарий — сохранять текущий темп; раз в квартал проверять фактический поток и не увеличивать обязательства без пересчёта.',
        },
        goal_overload: {
            headline: 'Портфель целей перегружает ежемесячный ресурс',
            lead: 'Проблема не в количестве целей, а в доле дохода, которую они забирают каждый месяц.',
            keyInsight: `Взносы по целям — около ${loadPct} дохода. Главный блок — «${largestGroup}»; порядок целей важнее новых продуктов.`,
            risk: ['Перегруз целей', loadPct, 'дохода уходит на плановые взносы'],
            lever: ['Главный рычаг', largestGroup, 'пересобрать сроки и приоритеты'],
            decisionRows: [
                ['Сократить перегруз', 'Вернуть план в пределы устойчивого cash flow.', `Первой пересчитать «${largestGoal}».`],
                ['Развести приоритеты', 'Обязательные цели не должны конкурировать с опциональными.', 'Пометить цели must-have / optional.'],
                ['Проверить срок', 'Удлинение горизонта часто снижает ежемесячный платёж.', 'Сравнить 2–3 срока по ключевой цели.'],
            ],
            recommendedScenario:
                'Сначала снизить ежемесячную нагрузку по тяжёлым целям, затем закрепить резерв и защиту жизни, после — опциональные цели.',
        },
        protection_gap: {
            headline: 'Плану не хватает защитного контура',
            lead: 'Перед усилением инвестиций нужно закрыть ликвидность и семейные риски — это напрямую отражается в ИФУС.',
            keyInsight: reserveGap
                ? 'В плане не выделен финансовый резерв. Риск — продать долгие активы при внезапных расходах; блок резерва в ИФУС будет слабым.'
                : 'Резерв в плане есть, но страховая защита жизни не выделена — проверьте покрытие на фоне обязательств и семьи.',
            risk: ['Защитный разрыв', reserveGap ? 'резерв' : 'LIFE', 'контур нужно закрыть до ускорения целей'],
            lever: ['Главный рычаг', reserveGap ? 'резерв' : 'НСЖ', 'сначала ликвидность и защита жизни'],
            decisionRows: [
                [
                    'Закрыть защиту',
                    'Снизить риск кассового разрыва и резкой продажи активов.',
                    reserveGap ? 'Добавить или усилить цель «Финансовый резерв».' : 'Добавить или проверить цель защиты жизни (НСЖ).',
                ],
                ['Не ускорять цели', 'Инвестиционный блок не должен заменять ликвидность.', 'Сначала подтвердить защитный контур.'],
                ['Назначить контроль', 'Защита зависит от дохода, семьи и обязательств.', 'Пересматривать защиту и ИФУС раз в год.'],
            ],
            recommendedScenario:
                'Первые 90 дней — резерв и защита жизни. После подтверждения устойчивости по ИФУС — плановое движение к долгосрочным целям.',
        },
        retirement_gap: {
            headline: 'Пенсионный блок — главный контур долгосрочного капитала',
            lead: 'План должен защищать текущий cash flow и одновременно удерживать пенсионную траекторию.',
            keyInsight: `Группа «${largestGroup}» формирует ключевую долгосрочную нагрузку. Оценивать не только взнос, но срок, доходность и регулярность — и не ослаблять резерв ради пенсии.`,
            risk: ['Пенсионный фокус', largestGroup, 'главная долгосрочная зона контроля'],
            lever: ['Главный рычаг', '20+ лет', 'дисциплина пополнений и пересчёт доходности'],
            decisionRows: [
                ['Сохранить траекторию', 'Пенсионная цель чувствительна к ранним пропускам взносов.', 'Закрепить регулярный платёж.'],
                ['Проверить доходность', 'Долгий срок усиливает эффект ставки и инфляции.', 'Сверить базовый и стресс-сценарии.'],
                ['Не ломать резерв', 'Пенсионный капитал не должен закрывать краткосрочные расходы.', 'Держать резерв отдельно от пенсии.'],
            ],
            recommendedScenario:
                'Сначала резерв и защита жизни, затем стабильный пенсионный взнос; пересматривать сценарий доходности не реже раза в квартал.',
        },
        growth_ready: {
            headline: 'План устойчив: можно управлять ускорением целей',
            lead: 'Свободный поток и структура целей позволяют обсуждать ускорение приоритетных направлений при сохранении защитного контура.',
            keyInsight: `После обязательств и ПФП остаётся ${formatMoney(freeCashflow)} — около ${freePct} дохода. При высоком ИФУС есть пространство для ускорения без потери контроля.`,
            risk: ['Риск дисциплины', freePct, 'дохода остаётся после обязательств и ПФП'],
            lever: ['Главный рычаг', 'ускорение', 'направлять избыток в приоритетные цели'],
            decisionRows: [
                ['Ускорить приоритеты', 'Свободный поток можно направить в цели с максимальным эффектом.', `Проверить ускорение для «${largestGoal}».`],
                ['Сохранить резерв', 'Рост не должен съедать ликвидность.', 'Оставить резерв отдельным контуром.'],
                ['Контролировать риск', 'Ускорение должно соответствовать риск-профилю.', 'Сверять портфель и ИФУС раз в квартал.'],
            ],
            recommendedScenario:
                'Базовый сценарий можно усилить: часть свободного потока — в приоритетные цели после проверки резерва, LIFE и риск-профиля.',
        },
    };
}

/**
 * Собирает executiveDecision (без ИФУС — score legacy только для отладки).
 */
function buildExecutiveDecisionContent(ctx) {
    const scenarioKey = pickExecutiveScenarioKey(ctx);
    const catalog = buildExecutiveScenarioCatalog(ctx);
    const selected = catalog[scenarioKey] || catalog.cashflow_working;
    const projected = ctx.formatMoney(ctx.portfolio.projectedTotal, { short: true }).replace(/\s*₽$/, '');

    return {
        scenario: scenarioKey,
        headline: selected.headline,
        lead: selected.lead,
        keyInsight: selected.keyInsight,
        cards: [
            { kind: 'risk', title: selected.risk[0], metric: selected.risk[1], body: selected.risk[2] },
            { kind: 'lever', title: selected.lever[0], metric: selected.lever[1], body: selected.lever[2] },
            { kind: 'effect', title: 'Главный эффект', metric: projected || '—', body: 'целевой капитал по базовому сценарию' },
        ],
        decisionRows: selected.decisionRows.map(([decision, why, nextStep]) => ({ decision, why, nextStep })),
        recommendedScenario: selected.recommendedScenario,
        source: 'deterministic-template',
        thresholds: { ...EXECUTIVE_SCENARIO_THRESHOLDS },
    };
}

/** Дополняет keyInsight строкой про ИФУС, если индекс уже посчитан. */
function enrichExecutiveNarrativeWithIfus(decision, ifus) {
    if (!decision || !ifus || !ifus.totalScoreFormatted) return decision;
    const suffix = ` ИФУС семьи: ${ifus.totalScoreFormatted} из 10 (${ifus.band?.label || 'оценка устойчивости'}).`;
    if (String(decision.keyInsight || '').includes('ИФУС семьи')) return decision;
    return {
        ...decision,
        keyInsight: `${decision.keyInsight || ''}${suffix}`.trim(),
    };
}

module.exports = {
    EXECUTIVE_SCENARIO_THRESHOLDS,
    pickExecutiveScenarioKey,
    buildExecutiveScenarioCatalog,
    buildExecutiveDecisionContent,
    enrichExecutiveNarrativeWithIfus,
};
