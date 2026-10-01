/**
 * Цифры, которые модель имеет право произносить. Всё вне этого блока — не из расчёта.
 */

function rub(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.round(n);
}

function yearsFromMonths(months) {
    const n = Number(months);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n / 12);
}

function instruments(list) {
    return (Array.isArray(list) ? list : []).map((item) => ({
        name: item?.name || 'Инструмент',
        share_percent: rub(item?.share),
        yield_percent: item?.yield != null ? Number(item.yield) : null,
        amount: rub(item?.amount),
    }));
}

function presentGoal(goal) {
    const summary = goal?.summary || {};
    const details = goal?.details || {};
    const type = String(goal?.goal_type || '').toUpperCase();
    const card = {
        name: goal?.goal_name || goal?.name || 'Цель',
        goal_type: type || null,
        goal_type_id: goal?.goal_type_id ?? null,
        term_months: summary.target_months ?? goal?.term_months ?? null,
        term_years: yearsFromMonths(summary.target_months ?? goal?.term_months),
        initial_capital: rub(summary.initial_capital),
        monthly_replenishment: rub(summary.monthly_replenishment),
        target_amount: rub(summary.target_amount_initial ?? summary.target_coverage),
        yield_percent: summary.accumulation_yield_percent ?? summary.investment_yield_percent ?? null,
        instruments: instruments(details.initial_instruments),
        monthly_instruments: instruments(details.monthly_instruments),
    };

    if (type === 'LIFE' || Number(goal?.goal_type_id) === 5) {
        const coverage = rub(summary.target_coverage ?? summary.target_amount_initial);
        const annual = rub(details.annual_premium ?? summary.initial_capital);
        card.life = {
            program: details.program_name || card.name,
            coverage,
            annual_premium: annual,
            premium_frequency: summary.premium_frequency || null,
            tariff_percent: coverage > 0 && annual != null
                ? Math.round((annual / coverage) * 10000) / 100
                : null,
            risks: (Array.isArray(details.risks) ? details.risks : []).map((risk) => ({
                name: risk.risk_name || risk.name || 'Риск',
                limit: rub(risk.limit_amount),
            })),
        };
    }

    if (goal?.error) card.error = String(goal.error);
    return card;
}

function presentPlan(calculation, intake) {
    const calc = calculation?.calculation || calculation || {};
    const goals = Array.isArray(calc.goals) ? calc.goals.map(presentGoal) : [];
    const portfolio = calc.summary?.consolidated_portfolio || {};

    return {
        instructions: [
            'Презентуй только числа из этого объекта.',
            'Доходность, тариф, взнос и доли инструментов не округляй «от себя» и не подставляй типичные значения.',
            'Если у поля null, скажи, что расчёт его не вернул.',
            'PDF отдай человеку ссылкой pdf_url. Если ссылки нет, а есть pdf_path — отдай файл по этому пути.',
        ],
        inputs: {
            monthly_income: rub(intake?.monthly_income),
            monthly_expenses: rub(intake?.monthly_expenses),
            liquid_capital: rub(intake?.liquid_capital),
            has_children: intake?.has_children === true,
            children_birth_years: Array.isArray(intake?.children_birth_years) ? intake.children_birth_years : [],
            risk_profile: intake?.risk_profile || null,
            goals: Array.isArray(intake?.goals) ? intake.goals.map((goal) => goal.code) : [],
            session_id: intake?.session_id || null,
        },
        goals,
        portfolio: {
            total_initial_capital: rub(portfolio.total_initial_capital),
            total_monthly_replenishment: rub(portfolio.total_monthly_replenishment),
            assets: instruments(portfolio.assets_allocation),
            contributions: instruments(portfolio.cash_flow_allocation),
        },
    };
}

module.exports = { presentPlan };
