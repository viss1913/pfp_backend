const db = require('../config/database');
const resolutService = require('./resolutService');
const clientRepository = require('../repositories/clientRepository');
const productRepository = require('../repositories/productRepository');
const { extractPortfolioOutcome } = require('../utils/resolutPortfolioResponse');
const { normalizeResolutQuoteLine } = require('./resolutQuoteParameters');

function toDdMmYyyy(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

function normalizeSex(value) {
    const s = String(value || '').toLowerCase();
    if (s === 'male' || s === 'm' || s === 'мужской') return 'male';
    if (s === 'female' || s === 'f' || s === 'женский') return 'female';
    return null;
}

function compactObject(obj) {
    const out = {};
    Object.keys(obj || {}).forEach((k) => {
        if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') out[k] = obj[k];
    });
    return out;
}

class ResolutPublishService {
    async getClientOrThrow(clientId, projectId) {
        const client = await clientRepository.findById(clientId, projectId);
        if (!client) {
            throw { status: 404, error: 'CLIENT_NOT_FOUND', message: 'Client not found or no access in project scope' };
        }
        return client;
    }

    mapPfpClientToResolutClient(clientRow) {
        return compactObject({
            lastName: clientRow.last_name || null,
            firstName: clientRow.first_name || null,
            middleName: clientRow.middle_name || null,
            dob: toDdMmYyyy(clientRow.birth_date),
            sex: normalizeSex(clientRow.gender),
            phone: clientRow.phone || null,
            email: clientRow.email || null
        });
    }

    async filterQuotesForResolut(projectId, quotesInput = [], clientRow = null) {
        const eligible = [];
        const skipped = [];

        for (let i = 0; i < quotesInput.length; i++) {
            const line = quotesInput[i] || {};
            const lineId = line.line_id || `line_${i}`;
            const productId = line.product_id != null ? Number(line.product_id) : null;

            if (!line.parameters || typeof line.parameters !== 'object') {
                skipped.push({ line_id: lineId, product_id: productId, code: line.code || null, reason: 'missing_parameters' });
                continue;
            }

            if (productId) {
                const product = await productRepository.findById(productId, projectId);
                if (!product) {
                    skipped.push({ line_id: lineId, product_id: productId, code: line.code || null, reason: 'product_not_found' });
                    continue;
                }
                const productCode = String(product.resolut_pfp_code || '').trim();
                if (!productCode) {
                    skipped.push({
                        line_id: lineId,
                        product_id: productId,
                        code: line.code || null,
                        reason: 'no_resolut_code',
                        product_name: product.name || null
                    });
                    continue;
                }
                if (line.code && String(line.code).trim() !== productCode) {
                    skipped.push({
                        line_id: lineId,
                        product_id: productId,
                        code: String(line.code).trim(),
                        reason: 'code_mismatch',
                        expected_code: productCode,
                        product_name: product.name || null
                    });
                    continue;
                }
                try {
                    const normalized = normalizeResolutQuoteLine({
                        projectId,
                        product,
                        clientRow: clientRow || {},
                        code: productCode,
                        parameters: line.parameters,
                        amountHint: line.amount
                    });
                    eligible.push({
                        line_id: lineId,
                        product_id: productId,
                        code: normalized.code,
                        parameters: normalized.parameters
                    });
                } catch (e) {
                    skipped.push({
                        line_id: lineId,
                        product_id: productId,
                        code: productCode,
                        reason: e.error || 'normalize_failed',
                        message: e.message || null,
                        product_name: product.name || null
                    });
                }
                continue;
            }

            const code = String(line.code || '').trim();
            if (!code) {
                skipped.push({ line_id: lineId, product_id: null, code: null, reason: 'missing_code' });
                continue;
            }
            try {
                const normalized = normalizeResolutQuoteLine({
                    projectId,
                    clientRow: clientRow || {},
                    code,
                    parameters: line.parameters,
                    amountHint: line.amount
                });
                eligible.push({
                    line_id: lineId,
                    product_id: null,
                    code: normalized.code,
                    parameters: normalized.parameters
                });
            } catch (e) {
                skipped.push({
                    line_id: lineId,
                    product_id: null,
                    code,
                    reason: e.error || 'normalize_failed',
                    message: e.message || null
                });
            }
        }

        return { eligible, skipped };
    }

    async ensureResolutClient(projectId, userId, clientRow, resolutClientInput = null) {
        const mapped = this.mapPfpClientToResolutClient(clientRow);
        const incoming = compactObject(resolutClientInput || {});
        const merged = { ...mapped, ...incoming };
        const existingCode = clientRow.resolut_client_code ? String(clientRow.resolut_client_code) : null;

        if (!existingCode) {
            const required = ['lastName', 'firstName', 'dob', 'sex', 'phone', 'email'];
            const missing = required.filter((k) => !merged[k]);
            if (missing.length > 0) {
                throw {
                    status: 400,
                    error: 'RESOLUT_CLIENT_INCOMPLETE',
                    message: `Missing Resolut client fields: ${missing.join(', ')}`,
                    details: { missing_fields: missing }
                };
            }
            const created = await resolutService.client(projectId, merged, { userId });
            const code = created?.data?.code;
            if (!code) {
                throw { status: 502, error: 'RESOLUT_CLIENT_CODE_MISSING', message: 'Resolut client create returned no code' };
            }
            await clientRepository.update(clientRow.id, {
                resolut_client_code: String(code),
                resolut_client_synced_at: new Date()
            }, projectId);
            return {
                clientCode: String(code),
                clientPayload: { code: String(code), ...merged }
            };
        }

        if (Object.keys(incoming).length > 0) {
            await resolutService.client(projectId, { code: existingCode, ...incoming }, { userId });
            await clientRepository.update(clientRow.id, {
                resolut_client_synced_at: new Date()
            }, projectId);
        }

        return {
            clientCode: existingCode,
            clientPayload: { code: existingCode, ...merged }
        };
    }

    async preview({ projectId, clientId, quotes, userId }) {
        await resolutService.assertProjectAllowed(projectId);
        const client = await this.getClientOrThrow(clientId, projectId);
        const filtered = await this.filterQuotesForResolut(projectId, quotes || [], client);
        return {
            success: true,
            data: {
                client_id: Number(clientId),
                resolut_client_code: client.resolut_client_code || null,
                eligible: filtered.eligible,
                skipped: filtered.skipped
            }
        };
    }

    async publish({ projectId, clientId, quotes, userId, agentId = null, resolutClient = null }) {
        await resolutService.assertProjectAllowed(projectId);
        const client = await this.getClientOrThrow(clientId, projectId);
        const filtered = await this.filterQuotesForResolut(projectId, quotes || [], client);

        if (filtered.eligible.length === 0) {
            throw {
                status: 400,
                error: 'RESOLUT_NOTHING_TO_PUBLISH',
                message: 'No eligible quotes for Resolut publication',
                details: { skipped: filtered.skipped }
            };
        }

        const { clientCode, clientPayload } = await this.ensureResolutClient(projectId, userId, client, resolutClient);

        const portfolioPayload = {
            quotes: filtered.eligible.map((q) => ({ code: q.code, parameters: q.parameters })),
            client: clientPayload
        };
        const upstream = await resolutService.portfolio(projectId, portfolioPayload, { userId });

        const extracted = extractPortfolioOutcome(upstream?.data || null);
        const portfolioCode = extracted.portfolio_code;
        const portfolioNumber = extracted.portfolio_number;
        const contracts = extracted.contracts;

        const [publicationId] = await db('resolut_portfolio_publications').insert({
            client_id: Number(clientId),
            project_id: Number(projectId),
            agent_id: agentId ? Number(agentId) : null,
            resolut_client_code: clientCode,
            resolut_portfolio_code: portfolioCode,
            resolut_portfolio_number: portfolioNumber,
            contracts_json: JSON.stringify(contracts),
            quotes_submitted_json: JSON.stringify(filtered.eligible),
            skipped_json: JSON.stringify(filtered.skipped),
            upstream_response_json: JSON.stringify(upstream?.data || null)
        });

        return {
            success: true,
            data: {
                client_id: Number(clientId),
                resolut_client_code: clientCode,
                publication_id: publicationId,
                skipped: filtered.skipped,
                portfolio: {
                    portfolio_code: portfolioCode,
                    portfolio_number: portfolioNumber,
                    contracts,
                    upstream_client_code: extracted.client_code
                },
                resolut: upstream
            }
        };
    }

    async listPublications({ projectId, clientId, limit = 50 }) {
        await resolutService.assertProjectAllowed(projectId);
        await this.getClientOrThrow(clientId, projectId);

        const lim = Math.max(1, Math.min(Number(limit) || 50, 200));
        const rows = await db('resolut_portfolio_publications')
            .select('*')
            .where({ client_id: Number(clientId) })
            .orderBy('created_at', 'desc')
            .limit(lim);

        const items = rows.map((r) => ({
            id: r.id,
            client_id: r.client_id,
            project_id: r.project_id,
            agent_id: r.agent_id,
            resolut_client_code: r.resolut_client_code,
            resolut_portfolio_code: r.resolut_portfolio_code,
            resolut_portfolio_number: r.resolut_portfolio_number,
            contracts_json: typeof r.contracts_json === 'string' ? JSON.parse(r.contracts_json) : r.contracts_json,
            quotes_submitted_json: typeof r.quotes_submitted_json === 'string' ? JSON.parse(r.quotes_submitted_json) : r.quotes_submitted_json,
            skipped_json: typeof r.skipped_json === 'string' ? JSON.parse(r.skipped_json) : r.skipped_json,
            created_at: r.created_at
        }));

        return { success: true, data: { items } };
    }
}

module.exports = new ResolutPublishService();

