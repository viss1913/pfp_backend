'use strict';

const productRepository = require('../repositories/productRepository');
const {
    parseGoalsSummary,
    isLifeGoal,
} = require('../utils/goalsSummaryMetrics');
const {
    FINAM_PROJECT_ID,
    IMMERS_TEST_FINAM_PROJECT_ID,
    fixedLifeTermYearsForProject,
} = require('../algorithms/calculators/lifeTermDefaults');

const DEFAULT_TERM_YEARS = Math.max(1, Number(process.env.CRM_COMMISSION_DEFAULT_TERM_YEARS || 10));

/** Finam / Immers-test: «Подушка безопасности» — 30% от годовой премии каждый год (пока без commission_schema на продукте). */
const LIFE_CUSHION_BUILTIN_SCHEMA = {
    version: 1,
    rules: [
        {
            rule_type: 'ANNUAL_PERCENT_OF_PREMIUM',
            base: 'FLOW',
            rate_percent: 30,
        },
    ],
};

const FINAM_COMMISSION_PROJECT_IDS = new Set([FINAM_PROJECT_ID, IMMERS_TEST_FINAM_PROJECT_ID]);

function toNum(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function roundRub(value) {
    return Math.round((toNum(value) + Number.EPSILON) * 100) / 100;
}

function collectProductPositions(parsedSummary) {
    const consolidated = parsedSummary?.summary?.consolidated_portfolio || {};
    const assets = Array.isArray(consolidated.assets_allocation) ? consolidated.assets_allocation : [];
    const flow = Array.isArray(consolidated.cash_flow_allocation) ? consolidated.cash_flow_allocation : [];
    const map = new Map();

    for (const row of assets) {
        const productId = row?.product_id != null ? Number(row.product_id) : null;
        const key = productId != null && Number.isFinite(productId) ? `id:${productId}` : `name:${String(row?.name || 'Unknown')}`;
        const prev = map.get(key) || {
            key,
            product_id: Number.isFinite(productId) ? productId : null,
            name: String(row?.name || 'Unknown'),
            product_type: row?.product_type ? String(row.product_type).toUpperCase() : null,
            initial_amount_rub: 0,
            monthly_flow_rub: 0,
        };
        prev.initial_amount_rub += toNum(row?.amount);
        map.set(key, prev);
    }

    for (const row of flow) {
        const productId = row?.product_id != null ? Number(row.product_id) : null;
        const key = productId != null && Number.isFinite(productId) ? `id:${productId}` : `name:${String(row?.name || 'Unknown')}`;
        const prev = map.get(key) || {
            key,
            product_id: Number.isFinite(productId) ? productId : null,
            name: String(row?.name || 'Unknown'),
            product_type: row?.product_type ? String(row.product_type).toUpperCase() : null,
            initial_amount_rub: 0,
            monthly_flow_rub: 0,
        };
        prev.monthly_flow_rub += toNum(row?.amount);
        map.set(key, prev);
    }

    return Array.from(map.values());
}

function detectTermYears(parsedSummary) {
    const goals = parsedSummary?.goals || [];
    let maxMonths = 0;
    for (const goal of goals) {
        const months = toNum(goal?.term_months ?? goal?.summary?.target_months ?? goal?.details?.term_months);
        if (months > maxMonths) maxMonths = months;
    }
    if (maxMonths > 0) return Math.max(1, Math.ceil(maxMonths / 12));
    return DEFAULT_TERM_YEARS;
}

function isFinamCommissionProject(projectId) {
    const pid = Number(projectId);
    return Number.isFinite(pid) && FINAM_COMMISSION_PROJECT_IDS.has(pid);
}

function isLifeCushionPosition(position) {
    const pt = String(position?.product_type || '').toUpperCase();
    if (pt === 'LIFE' || pt === 'NSJ' || pt === 'LIFE_INSURANCE') return true;
    const name = String(position?.name || '').toLowerCase();
    return /подушк|безопасност|нсж|страхован.*жизн/.test(name);
}

function shouldUseLifeCushionBuiltin(position, projectId) {
    return isFinamCommissionProject(projectId) && isLifeCushionPosition(position);
}

function extractLifeAnnualPremiumFromGoal(goal) {
    const details = goal?.details && typeof goal.details === 'object' ? goal.details : {};
    const nsj =
        details.nsj_calculation && typeof details.nsj_calculation === 'object'
            ? details.nsj_calculation
            : goal?.nsj_calculation && typeof goal.nsj_calculation === 'object'
              ? goal.nsj_calculation
              : {};
    return toNum(details.annual_premium ?? nsj.annual_premium);
}

function enrichPositionsFromLifeGoals(positions, parsed) {
    if (!parsed?.goals?.length) return positions;
    const out = positions.map((p) => ({ ...p }));

    for (const goal of parsed.goals) {
        if (!isLifeGoal(goal)) continue;
        const annual = extractLifeAnnualPremiumFromGoal(goal);
        if (annual <= 0) continue;

        const details = goal.details && typeof goal.details === 'object' ? goal.details : {};
        const name = String(details.program_name || goal.goal_name || 'Подушка безопасности').trim() || 'Подушка безопасности';

        let pos = out.find((p) => isLifeCushionPosition(p) && String(p.name).trim() === name);
        if (!pos) {
            pos = out.find((p) => isLifeCushionPosition(p));
        }
        if (!pos) {
            pos = {
                key: `name:${name}`,
                product_id: null,
                name,
                product_type: 'LIFE',
                initial_amount_rub: 0,
                monthly_flow_rub: 0,
            };
            out.push(pos);
        }
        if (toNum(pos.monthly_flow_rub) <= 0) {
            pos.monthly_flow_rub = annual / 12;
        }
        if (!pos.product_type) pos.product_type = 'LIFE';
    }

    return out;
}

function resolvePositionTermYears(position, parsed, projectId) {
    if (!isLifeCushionPosition(position)) {
        return detectTermYears(parsed);
    }
    const fixedYears = fixedLifeTermYearsForProject(projectId);
    if (fixedYears != null) return fixedYears;

    let maxLifeMonths = 0;
    for (const goal of parsed?.goals || []) {
        if (!isLifeGoal(goal)) continue;
        const months = toNum(goal?.term_months ?? goal?.summary?.target_months ?? goal?.details?.term_months);
        if (months > maxLifeMonths) maxLifeMonths = months;
    }
    if (maxLifeMonths > 0) return Math.max(1, Math.ceil(maxLifeMonths / 12));
    return detectTermYears(parsed);
}

function resolveEffectiveCommissionSchema(dbSchema, position, projectId) {
    const rules = Array.isArray(dbSchema?.rules) ? dbSchema.rules : [];
    if (rules.length > 0) return dbSchema;
    if (shouldUseLifeCushionBuiltin(position, projectId)) {
        return LIFE_CUSHION_BUILTIN_SCHEMA;
    }
    return null;
}

function isRuleActiveForYear(rule, year) {
    if (!rule?.years) return true;
    return year >= Number(rule.years.start) && year <= Number(rule.years.end);
}

function resolveContributionBase(rule, yearPack) {
    const base = String(rule?.base || 'INITIAL_PLUS_FLOW').toUpperCase();
    if (base === 'INITIAL') return yearPack.year === 1 ? yearPack.initial : 0;
    if (base === 'FLOW') return yearPack.annualFlow;
    if (base === 'AUM_AVG') return yearPack.avgAum;
    return (yearPack.year === 1 ? yearPack.initial : 0) + yearPack.annualFlow;
}

function applyRuleForYear(rule, yearPack) {
    const rate = toNum(rule?.rate_percent) / 100;
    const fixed = toNum(rule?.fixed_amount_rub);
    const contributionBase = resolveContributionBase(rule, yearPack);
    const ruleType = String(rule?.rule_type || '').toUpperCase();

    if (!isRuleActiveForYear(rule, yearPack.year)) return 0;

    switch (ruleType) {
        case 'ONE_TIME_FIXED':
            return yearPack.year === 1 ? fixed : 0;
        case 'ONE_TIME_PERCENT_OF_PREMIUM':
            return yearPack.year === 1 ? contributionBase * rate : 0;
        case 'FIRST_YEAR_PERCENT_OF_PREMIUMS':
            return yearPack.year === 1 ? contributionBase * rate : 0;
        case 'TOTAL_TERM_PERCENT_OF_PREMIUMS':
        case 'ANNUAL_PERCENT_OF_PREMIUM':
            return contributionBase * rate;
        case 'AUM_MANAGEMENT_FEE':
            return yearPack.avgAum * rate;
        case 'TIERED_BY_YEAR': {
            const tiers = Array.isArray(rule?.tiers) ? rule.tiers : [];
            const tier = tiers.find((t) => yearPack.year >= Number(t.year_from) && yearPack.year <= Number(t.year_to));
            if (!tier) return 0;
            return contributionBase * (toNum(tier.rate_percent) / 100);
        }
        default:
            return 0;
    }
}

function projectPositionForecast(position, commissionSchema, termYears) {
    const rules = Array.isArray(commissionSchema?.rules) ? commissionSchema.rules : [];
    const yearly = [];
    const initial = toNum(position.initial_amount_rub);
    const annualFlow = toNum(position.monthly_flow_rub) * 12;

    for (let year = 1; year <= termYears; year += 1) {
        const startAum = initial + annualFlow * (year - 1);
        const avgAum = startAum + annualFlow / 2;
        const yearPack = {
            year,
            initial,
            annualFlow,
            startAum,
            avgAum,
        };
        let amount = 0;
        for (const rule of rules) {
            amount += applyRuleForYear(rule, yearPack);
        }
        yearly.push({ year, amount_rub: roundRub(amount) });
    }

    const year1 = yearly.find((y) => y.year === 1)?.amount_rub || 0;
    const total = yearly.reduce((sum, y) => sum + toNum(y.amount_rub), 0);

    return {
        product_id: position.product_id,
        name: position.name,
        product_type: position.product_type || null,
        commission_year_1_rub: roundRub(year1),
        commission_total_rub: roundRub(total),
        by_year: yearly,
    };
}

function mergeYearSeries(productForecastRows) {
    const map = new Map();
    for (const row of productForecastRows) {
        for (const y of row.by_year || []) {
            const prev = map.get(y.year) || { year: y.year, commission_rub: 0 };
            prev.commission_rub += toNum(y.amount_rub);
            map.set(y.year, prev);
        }
    }
    return Array.from(map.values())
        .map((row) => ({ ...row, commission_rub: roundRub(row.commission_rub) }))
        .sort((a, b) => a.year - b.year);
}

async function resolveProductRuleMap(projectId, positions) {
    const ids = Array.from(
        new Set(
            positions
                .map((p) => (p.product_id != null ? Number(p.product_id) : null))
                .filter((id) => Number.isFinite(id) && id > 0)
        )
    );
    const out = new Map();
    for (const productId of ids) {
        const product = await productRepository.findById(productId, projectId);
        out.set(productId, product?.commission_schema || null);
    }
    return out;
}

async function buildClientCommissionForecast(client, projectId) {
    const parsed = parseGoalsSummary(client?.goals_summary);
    if (!parsed) {
        return {
            client_id: client?.id || null,
            commission_year_1_rub: 0,
            commission_total_rub: 0,
            commission_by_product: [],
            series: [],
        };
    }

    const positions = enrichPositionsFromLifeGoals(collectProductPositions(parsed), parsed);
    const ruleMap = await resolveProductRuleMap(projectId, positions);
    const productRows = positions.map((position) => {
        const dbSchema = position.product_id != null ? ruleMap.get(position.product_id) : null;
        const schema = resolveEffectiveCommissionSchema(dbSchema, position, projectId);
        const termYears = resolvePositionTermYears(position, parsed, projectId);
        return projectPositionForecast(position, schema, termYears);
    });

    const year1 = productRows.reduce((sum, row) => sum + toNum(row.commission_year_1_rub), 0);
    const total = productRows.reduce((sum, row) => sum + toNum(row.commission_total_rub), 0);
    const series = mergeYearSeries(productRows);

    return {
        client_id: client?.id || null,
        commission_year_1_rub: roundRub(year1),
        commission_total_rub: roundRub(total),
        commission_by_product: productRows.map((row) => ({
            product_id: row.product_id,
            name: row.name,
            product_type: row.product_type,
            commission_year_1_rub: row.commission_year_1_rub,
            commission_total_rub: row.commission_total_rub,
        })),
        series,
    };
}

function mergeForecastRows(rows) {
    const productMap = new Map();
    const yearMap = new Map();
    let year1 = 0;
    let total = 0;

    for (const row of rows) {
        year1 += toNum(row.commission_year_1_rub);
        total += toNum(row.commission_total_rub);
        for (const p of row.commission_by_product || []) {
            const key = p.product_id != null ? `id:${p.product_id}` : `name:${p.name}`;
            const prev = productMap.get(key) || {
                product_id: p.product_id ?? null,
                name: p.name || 'Unknown',
                product_type: p.product_type || null,
                commission_year_1_rub: 0,
                commission_total_rub: 0,
            };
            prev.commission_year_1_rub += toNum(p.commission_year_1_rub);
            prev.commission_total_rub += toNum(p.commission_total_rub);
            productMap.set(key, prev);
        }
        for (const y of row.series || []) {
            const prev = yearMap.get(y.year) || { year: y.year, commission_rub: 0 };
            prev.commission_rub += toNum(y.commission_rub);
            yearMap.set(y.year, prev);
        }
    }

    return {
        commission_year_1_rub: roundRub(year1),
        commission_total_rub: roundRub(total),
        commission_by_product: Array.from(productMap.values())
            .map((row) => ({
                ...row,
                commission_year_1_rub: roundRub(row.commission_year_1_rub),
                commission_total_rub: roundRub(row.commission_total_rub),
            }))
            .sort((a, b) => b.commission_total_rub - a.commission_total_rub),
        series: Array.from(yearMap.values())
            .map((row) => ({ ...row, commission_rub: roundRub(row.commission_rub) }))
            .sort((a, b) => a.year - b.year),
    };
}

async function buildAgentsCommissionForecast(clients, projectId) {
    const perClient = [];
    for (const client of clients || []) {
        perClient.push(await buildClientCommissionForecast(client, projectId));
    }
    const aggregate = mergeForecastRows(perClient);
    return {
        ...aggregate,
        clients: perClient,
        as_of: new Date().toISOString(),
    };
}

module.exports = {
    buildClientCommissionForecast,
    buildAgentsCommissionForecast,
};

