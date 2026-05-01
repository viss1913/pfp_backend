'use strict';

/**
 * Извлечь идентификаторы публикации портфеля из тела upstream `data`
 * (формат партнёра может отличаться от OpenAPI: плоский vs вложенный content).
 *
 * @param {unknown} raw - norm.data после операции portfolio
 * @returns {{
 *   portfolio_code: string|null,
 *   portfolio_number: string|null,
 *   client_code: string|null,
 *   contracts: Array<object>,
 * }}
 */
function extractPortfolioOutcome(raw) {
    const empty = {
        portfolio_code: null,
        portfolio_number: null,
        client_code: null,
        contracts: []
    };

    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ...empty };
    }

    let portfolio_code =
        raw.code != null ? String(raw.code)
            : (raw.portfolioCode != null ? String(raw.portfolioCode)
                : (raw.portfolio_code != null ? String(raw.portfolio_code) : null));

    let portfolio_number =
        raw.portfolioNumber != null ? String(raw.portfolioNumber)
            : (raw.portfolio_number != null ? String(raw.portfolio_number) : null);

    let client_code =
        raw.clientCode != null ? String(raw.clientCode)
            : (raw.client_code != null ? String(raw.client_code) : null);

    let contracts = [];
    if (Array.isArray(raw.contracts)) {
        contracts = raw.contracts.slice();
    }

    const content = raw.content;
    if (content && typeof content === 'object' && !Array.isArray(content)) {
        if (portfolio_number == null && content.number != null) {
            portfolio_number = String(content.number);
        }
        if (client_code == null && content.clientCode != null) {
            client_code = String(content.clientCode);
        }
        if (Array.isArray(content.contracts) && content.contracts.length > 0) {
            contracts = content.contracts.slice();
        }
    }

    return {
        portfolio_code,
        portfolio_number,
        client_code,
        contracts
    };
}

module.exports = {
    extractPortfolioOutcome
};
