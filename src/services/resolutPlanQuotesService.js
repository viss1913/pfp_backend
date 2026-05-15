'use strict';

const clientRepository = require('../repositories/clientRepository');
const productRepository = require('../repositories/productRepository');
const resolutService = require('./resolutService');
const { buildResolutQuoteParameters } = require('./resolutQuoteParameters');
const { isResolutIszhProduct } = require('./resolutIszhQuoteParameters');

/**
 * @param {unknown} stored — clients.goals_summary (string или object)
 * @returns {{ summary?: object, goals?: array }|null}
 */
function parseGoalsSummary(stored) {
    if (stored == null || stored === '') return null;
    let raw = stored;
    if (typeof stored === 'string') {
        try {
            raw = JSON.parse(stored);
        } catch {
            return null;
        }
    }
    const calc = raw.calculation || raw;
    if (!calc || typeof calc !== 'object') return null;
    return {
        summary: calc.summary || null,
        goals: Array.isArray(calc.goals) ? calc.goals : []
    };
}

function maxTermMonthsFromGoals(goals) {
    let m = 0;
    for (const g of goals || []) {
        const t = Number(g.term_months ?? g.summary?.target_months ?? 0);
        if (Number.isFinite(t) && t > m) m = t;
    }
    return m > 0 ? m : 120;
}

/**
 * На демо AV/Resolut для assetShort quote/portfolio при сроке меньше 5 лет даёт calcError
 * «Не заданы выкупные суммы…». Поднимаем срок для plan-quotes / publish-from-plan.
 *
 * RESOLUT_PLAN_MIN_TERM_MONTHS: минимум месяцев (по умолчанию 60). Поставьте 0 чтобы отключить.
 */
function applyResolutPlanTermFloor(termMonths) {
    const raw = process.env.RESOLUT_PLAN_MIN_TERM_MONTHS;
    let floor;
    if (raw === undefined || raw === '') {
        floor = 60;
    } else {
        const n = Number(raw);
        floor = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }
    const requested = Math.max(1, Math.floor(Number(termMonths) || 0));
    if (floor <= 0) {
        return {
            term_months_used: requested,
            term_months_requested: requested,
            term_months_clamped: false,
            resolut_plan_min_term_months: null
        };
    }
    const used = Math.max(requested, floor);
    return {
        term_months_used: used,
        term_months_requested: requested,
        term_months_clamped: used !== requested,
        resolut_plan_min_term_months: floor
    };
}

/**
 * Суммируем amount по product_id.
 */
function mergeByProductId(rows) {
    const map = new Map();
    for (const row of rows || []) {
        const pid = row.product_id != null ? Number(row.product_id) : null;
        if (!pid || pid <= 0) continue;
        const code = row.resolut_pfp_code != null ? String(row.resolut_pfp_code).trim() : '';
        if (!code) continue;
        const amt = Number(row.amount || 0);
        if (!Number.isFinite(amt)) continue;
        const prev = map.get(pid) || { product_id: pid, resolut_pfp_code: code, amount: 0, names: [] };
        prev.amount += amt;
        if (row.name && !prev.names.includes(row.name)) prev.names.push(row.name);
        map.set(pid, prev);
    }
    return [...map.values()];
}

function rowsFromConsolidatedAssets(consolidated) {
    const out = [];
    const assets = consolidated?.assets_allocation;
    if (!Array.isArray(assets)) return out;
    for (const row of assets) {
        out.push({
            product_id: row.product_id,
            resolut_pfp_code: row.resolut_pfp_code,
            amount: row.amount,
            name: row.name
        });
    }
    return out;
}

function rowsFromConsolidatedCashFlow(consolidated) {
    const out = [];
    const flows = consolidated?.cash_flow_allocation;
    if (!Array.isArray(flows)) return out;
    for (const row of flows) {
        out.push({
            product_id: row.product_id,
            resolut_pfp_code: row.resolut_pfp_code,
            amount: row.amount,
            name: row.name
        });
    }
    return out;
}

function collectFromGoals(goals) {
    const out = [];
    for (const g of goals || []) {
        const parts = [
            ...(g.details?.initial_instruments || []),
            ...(g.details?.monthly_instruments || [])
        ];
        for (const inst of parts) {
            out.push({
                product_id: inst.product_id,
                resolut_pfp_code: inst.resolut_pfp_code,
                amount: Number(inst.amount ?? 0),
                name: inst.name
            });
        }
    }
    return out;
}

function applyQuotePatches(quotes, patches) {
    if (!Array.isArray(patches) || patches.length === 0) return quotes;
    const byPid = new Map(patches.map((p) => [Number(p.product_id), p]).filter(([id]) => id > 0));
    return quotes.map((q) => {
        const patch = byPid.get(Number(q.product_id));
        if (!patch) return q;
        const next = { ...q };
        if (patch.code) next.code = String(patch.code).trim();
        if (patch.parameters && typeof patch.parameters === 'object') {
            next.parameters = { ...next.parameters, ...patch.parameters };
        }
        return next;
    });
}

async function buildQuoteLinesForMergedRows({
    projectId,
    client,
    mergedRows,
    termMonths,
    valuationType,
    pTypeOverride,
    lineIdPrefix
}) {
    const quotes = [];
    const skipped = [];

    for (const row of mergedRows) {
        const lineId = `${lineIdPrefix}_${row.product_id}`;
        const product = await productRepository.findById(row.product_id, projectId);
        if (!product) {
            skipped.push({
                line_id: lineId,
                product_id: row.product_id,
                reason: 'product_not_found',
                name: row.names?.[0] || null
            });
            continue;
        }

        const amount = row.amount;
        if (!(amount > 0)) {
            skipped.push({
                line_id: lineId,
                product_id: row.product_id,
                reason: 'zero_amount',
                product_name: product.name || null
            });
            continue;
        }

        try {
            if (isResolutIszhProduct(product) && valuationType === 'byPremium' && pTypeOverride === 12) {
                skipped.push({
                    line_id: lineId,
                    product_id: row.product_id,
                    reason: 'iszh_monthly_flow_skipped',
                    message: 'ISZH uses lump premium only; monthly cash-flow lines are not supported',
                    product_name: product.name || null
                });
                continue;
            }
            const { code, parameters } = buildResolutQuoteParameters({
                projectId,
                product,
                clientRow: client,
                termMonths,
                amount,
                valuationType,
                pTypeOverride
            });
            quotes.push({
                line_id: lineId,
                product_id: row.product_id,
                code,
                parameters
            });
        } catch (e) {
            const err = e && e.error ? e : { error: 'BUILD_QUOTE_FAILED', message: String(e.message || e) };
            skipped.push({
                line_id: lineId,
                product_id: row.product_id,
                code: product.resolut_pfp_code || null,
                reason: err.error || 'build_failed',
                message: err.message || null,
                product_name: product.name || null
            });
        }
    }

    return { quotes, skipped };
}

class ResolutPlanQuotesService {
    /**
     * Собрать quotes[] из последнего goals_summary клиента.
     * Lump-sum: consolidated assets (byLimit). Cash-flow: опционально отдельные строки (byPremium, pType 12).
     */
    async buildQuotes({
        projectId,
        clientId,
        termMonths: termMonthsOverride = null,
        includeMonthlyFlow = false,
        quotePatches = null
    }) {
        resolutService.assertProjectAllowed(projectId);

        const client = await clientRepository.findById(clientId, projectId);
        if (!client) {
            throw {
                status: 404,
                error: 'CLIENT_NOT_FOUND',
                message: 'Client not found or no access in project scope'
            };
        }

        const parsed = parseGoalsSummary(client.goals_summary);
        if (!parsed) {
            throw {
                status: 400,
                error: 'NO_CALCULATION_SNAPSHOT',
                message: 'Client has no goals_summary / calculation snapshot'
            };
        }

        const goals = parsed.goals || [];
        const consolidated = parsed.summary?.consolidated_portfolio || null;

        const termMonthsRaw = termMonthsOverride != null && Number(termMonthsOverride) > 0
            ? Number(termMonthsOverride)
            : maxTermMonthsFromGoals(goals);
        const termPack = applyResolutPlanTermFloor(termMonthsRaw);
        const termMonths = termPack.term_months_used;

        let assetRows = consolidated
            ? mergeByProductId(rowsFromConsolidatedAssets(consolidated))
            : [];

        if (assetRows.length === 0) {
            assetRows = mergeByProductId(collectFromGoals(goals));
        }

        const { quotes: assetQuotes, skipped: assetSkipped } = await buildQuoteLinesForMergedRows({
            projectId,
            client,
            mergedRows: assetRows,
            termMonths,
            valuationType: 'byLimit',
            pTypeOverride: null,
            lineIdPrefix: 'plan_asset'
        });

        let flowQuotes = [];
        let flowSkipped = [];
        if (includeMonthlyFlow && consolidated) {
            const flowRows = mergeByProductId(rowsFromConsolidatedCashFlow(consolidated));
            const built = await buildQuoteLinesForMergedRows({
                projectId,
                client,
                mergedRows: flowRows,
                termMonths,
                valuationType: 'byPremium',
                pTypeOverride: 12,
                lineIdPrefix: 'plan_flow'
            });
            flowQuotes = built.quotes;
            flowSkipped = built.skipped;
        } else if (consolidated?.cash_flow_allocation?.length) {
            for (const row of consolidated.cash_flow_allocation) {
                const pid = row.product_id != null ? Number(row.product_id) : null;
                const code = row.resolut_pfp_code != null ? String(row.resolut_pfp_code).trim() : '';
                if (pid && code) {
                    assetSkipped.push({
                        line_id: `cash_flow_${pid}`,
                        product_id: pid,
                        code,
                        reason: 'monthly_flow_skipped',
                        hint: 'Pass include_monthly_flow=true on plan-quotes / publish-from-plan',
                        product_name: row.name || null
                    });
                }
            }
        }

        const quotes = applyQuotePatches([...assetQuotes, ...flowQuotes], quotePatches);

        return {
            success: true,
            data: {
                client_id: Number(clientId),
                term_months_used: termMonths,
                term_months_requested: termPack.term_months_requested,
                term_months_clamped: termPack.term_months_clamped,
                include_monthly_flow: includeMonthlyFlow,
                quotes,
                skipped: [...assetSkipped, ...flowSkipped],
                meta: {
                    snapshot_source: consolidated ? 'consolidated_with_goals_fallback' : 'goals_only',
                    asset_positions: assetRows.length,
                    flow_positions: includeMonthlyFlow && consolidated
                        ? mergeByProductId(rowsFromConsolidatedCashFlow(consolidated)).length
                        : 0,
                    term_months_requested: termPack.term_months_requested,
                    term_months_clamped: termPack.term_months_clamped,
                    resolut_plan_min_term_months: termPack.resolut_plan_min_term_months
                }
            }
        };
    }
}

module.exports = new ResolutPlanQuotesService();
module.exports.parseGoalsSummary = parseGoalsSummary;
module.exports.applyResolutPlanTermFloor = applyResolutPlanTermFloor;
