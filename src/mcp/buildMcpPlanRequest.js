const { goalByCode } = require('./goalCatalog');

const RISK_ALIASES = {
    conservative: 'CONSERVATIVE',
    conservative_ru: 'CONSERVATIVE',
    'консервативный': 'CONSERVATIVE',
    balanced: 'BALANCED',
    'сбалансированный': 'BALANCED',
    aggressive: 'AGGRESSIVE',
    'агрессивный': 'AGGRESSIVE',
};

function ask(questions) {
    return { ok: false, ask_next: questions };
}

function normalizeRisk(value) {
    const raw = String(value || '').trim();
    const upper = raw.toUpperCase();
    if (upper === 'CONSERVATIVE' || upper === 'BALANCED' || upper === 'AGGRESSIVE') return upper;
    return RISK_ALIASES[raw.toLowerCase()] || null;
}

function normalizeSex(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'male' || raw === 'm' || raw === 'мужской' || raw === 'м') return 'male';
    if (raw === 'female' || raw === 'f' || raw === 'женский' || raw === 'ж') return 'female';
    return null;
}

function finiteNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function childBirthDate(year) {
    const y = Number(year);
    if (!Number.isInteger(y) || y < 1980 || y > new Date().getFullYear()) return null;
    return `${y}-01-01`;
}

/**
 * Простые ответы агента → тело calculateFirstRun.
 * Пустые обязательные поля не подставляются: модель должна спросить.
 * @param {object} input
 * @param {number} projectId
 */
function buildMcpPlanRequest(input, projectId) {
    const src = input && typeof input === 'object' ? input : {};
    const simple = src.simple === true;
    const questions = [];

    let birthDate = String(src.birth_date || '').trim();
    if (simple && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) birthDate = '1985-01-01';
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
        questions.push('Дата рождения в формате ГГГГ-ММ-ДД.');
    }
    let sex = normalizeSex(src.sex);
    if (simple && !sex) sex = 'male';
    else if (!sex) questions.push('Пол: мужской или женский.');

    let monthlyIncome = finiteNumber(src.monthly_income);
    if (simple && (monthlyIncome == null || monthlyIncome < 0)) monthlyIncome = 0;
    else if (monthlyIncome == null || monthlyIncome < 0) {
        questions.push('Доход в месяц до налога, в рублях.');
    }
    let monthlyExpenses = finiteNumber(src.monthly_expenses);
    if (simple && (monthlyExpenses == null || monthlyExpenses < 0)) monthlyExpenses = 0;
    else if (monthlyExpenses == null || monthlyExpenses < 0) {
        questions.push('Текущие расходы в месяц, в рублях.');
    }
    const liquidCapital = finiteNumber(src.liquid_capital);
    if (liquidCapital == null || liquidCapital < 0) {
        questions.push('Первоначальный капитал, в рублях. Если его нет — 0.');
    }

    if (!simple && typeof src.has_children !== 'boolean') {
        questions.push('Есть ли дети? Ответ да или нет. Если да — год рождения каждого.');
    } else if (src.has_children) {
        const years = Array.isArray(src.children_birth_years) ? src.children_birth_years : [];
        if (!years.length || years.some((year) => !childBirthDate(year))) {
            questions.push('Год рождения каждого ребёнка.');
        }
    }

    let riskProfile = normalizeRisk(src.risk_profile);
    if (!riskProfile && simple) riskProfile = 'BALANCED';
    else if (!riskProfile) {
        questions.push('Риск-профиль: консервативный, сбалансированный или агрессивный.');
    }

    const selected = Array.isArray(src.goals) ? src.goals : [];
    if (!selected.length) {
        questions.push('Какие цели считаем. Коды: reserve, life, pension, investment, purchase, passive_income, inheritance.');
    }

    const goals = [];
    selected.forEach((item, index) => {
        const code = String(item?.code || '').trim();
        const spec = goalByCode(code);
        if (!spec) {
            questions.push(`Цель ${index + 1}: неизвестный код «${code}». Возьми код из каталога.`);
            return;
        }
        const goal = {
            goal_type_id: spec.goal_type_id,
            name: String(item.name || spec.name).trim() || spec.name,
        };
        if (spec.goal_type_id !== 5 && spec.goal_type_id !== 7) {
            goal.risk_profile = riskProfile;
        }

        if (code === 'reserve' && simple) {
            const amount = finiteNumber(item.target_amount);
            const years = finiteNumber(item.term_years);
            if (amount == null || amount <= 0) questions.push('Стоимость резерва, в рублях.');
            if (years == null || years <= 0) questions.push('Срок резерва в годах.');
            if (amount > 0) goal.target_amount = Math.round(amount);
            if (years > 0) goal.term_months = Math.round(years * 12);
        } else if (code === 'reserve') {
            const months = finiteNumber(item.reserve_months);
            const reserveMonths = months != null && months > 0 ? Math.round(months) : 6;
            if (monthlyExpenses == null || monthlyExpenses <= 0) {
                questions.push('Для резерва нужна сумма расходов в месяц.');
            } else {
                goal.target_amount = Math.round(monthlyExpenses * reserveMonths);
                goal.term_months = 12;
            }
        } else if (code === 'life') {
            const coverage = finiteNumber(item.coverage ?? item.target_amount);
            if (coverage == null || coverage <= 0) {
                questions.push('Страховая сумма по защите жизни, в рублях.');
            } else {
                goal.target_amount = Math.round(coverage);
                goal.payment_variant = 1;
                const years = finiteNumber(item.term_years);
                if (simple && (years == null || years <= 0)) questions.push('Срок защиты жизни в годах.');
                if (years != null && years > 0) goal.term_months = Math.round(years * 12);
            }
        } else if (code === 'pension') {
            if (simple) {
                const amount = finiteNumber(item.target_amount);
                if (amount == null || amount <= 0) questions.push('Желаемая пенсия в месяц, в рублях.');
                else goal.target_amount = Math.round(amount);
            }
        } else if (code === 'passive_income') {
            const income = finiteNumber(item.desired_monthly_income ?? (simple ? item.target_amount : undefined));
            if (simple) {
                const years = finiteNumber(item.term_years);
                if (years == null || years <= 0) questions.push('Срок пассивного дохода в годах.');
                else goal.term_months = Math.round(years * 12);
            }
            if (income == null || income <= 0) {
                questions.push('Желаемый пассивный доход в месяц, в рублях.');
            } else {
                goal.desired_monthly_income = Math.round(income);
            }
        } else if (code === 'purchase' || code === 'inheritance') {
            const amount = finiteNumber(item.target_amount);
            const years = finiteNumber(item.term_years);
            if (amount == null || amount <= 0) questions.push(`Стоимость цели «${goal.name}», в рублях.`);
            if (years == null || years <= 0) questions.push(`Срок цели «${goal.name}» в годах.`);
            if (amount > 0) goal.target_amount = Math.round(amount);
            if (years > 0) goal.term_months = Math.round(years * 12);
        } else if (code === 'investment') {
            const years = finiteNumber(item.term_years);
            const amount = finiteNumber(item.target_amount);
            if (simple && (amount == null || amount <= 0)) questions.push('Стоимость цели «Сохранить и приумножить», в рублях.');
            if (years == null || years <= 0) questions.push('Срок цели «Сохранить и приумножить» в годах.');
            if (years > 0) goal.term_months = Math.round(years * 12);
            if (amount != null && amount > 0) goal.target_amount = Math.round(amount);
        }

        goals.push(goal);
    });

    if (questions.length) return ask(questions);

    const children = src.has_children
        ? src.children_birth_years.map((year, index) => ({
            first_name: `Ребёнок ${index + 1}`,
            birth_date: childBirthDate(year),
        }))
        : [];

    const displayName = String(src.display_name || 'Клиент').trim() || 'Клиент';
    const sessionId = String(src.session_id || '').trim();
    const email = `mcp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}@plans.local`;

    return {
        ok: true,
        body: {
            client: {
                project_id: projectId,
                name: displayName,
                email,
                ...(sessionId ? { uuid: sessionId } : {}),
                birth_date: birthDate,
                sex,
                avg_monthly_income: Math.round(monthlyIncome),
                total_liquid_capital: Math.round(liquidCapital),
                enable_children_tax_deduction: children.length > 0,
                tax_children: children.map((child) => ({ birth_date: child.birth_date })),
                family_profile: {
                    children,
                },
                assets: liquidCapital > 0 ? [{
                    type: 'CASH',
                    name: 'Ликвидный капитал',
                    amount: Math.round(liquidCapital),
                    current_value: Math.round(liquidCapital),
                }] : [],
            },
            expenses: [{
                category: 'LIVING',
                name: 'Текущие расходы',
                amount: Math.round(monthlyExpenses),
                currency: 'RUB',
            }],
            goals,
        },
    };
}

module.exports = {
    buildMcpPlanRequest,
    normalizeRisk,
    normalizeSex,
};
