const test = require('node:test');
const assert = require('node:assert/strict');

const commissionForecastService = require('../../src/services/commissionForecastService');
const productRepository = require('../../src/repositories/productRepository');

const productRulesFixture = {
    version: 1,
    rules: [
        {
            rule_type: 'ONE_TIME_PERCENT_OF_PREMIUM',
            base: 'INITIAL',
            rate_percent: 10,
        },
        {
            rule_type: 'ANNUAL_PERCENT_OF_PREMIUM',
            base: 'FLOW',
            rate_percent: 5,
        },
        {
            rule_type: 'AUM_MANAGEMENT_FEE',
            base: 'AUM_AVG',
            rate_percent: 1,
        },
    ],
};

test('buildClientCommissionForecast calculates year1 and total', async () => {
    const originalFindById = productRepository.findById;
    productRepository.findById = async () => ({ commission_schema: productRulesFixture });

    try {
        const client = {
            id: 77,
            goals_summary: {
                calculation: {
                    goals: [{ term_months: 24 }],
                    summary: {
                        consolidated_portfolio: {
                            assets_allocation: [
                                { product_id: 10, name: 'NSJ', product_type: 'LIFE', amount: 1000 },
                            ],
                            cash_flow_allocation: [
                                { product_id: 10, name: 'NSJ', product_type: 'LIFE', amount: 100 },
                            ],
                        },
                    },
                },
            },
        };

        const result = await commissionForecastService.buildClientCommissionForecast(client, 99);
        assert.equal(result.client_id, 77);
        assert.equal(result.commission_year_1_rub, 176);
        assert.equal(result.commission_total_rub, 264);
        assert.equal(result.commission_by_product.length, 1);
        assert.equal(result.series.length, 2);
    } finally {
        productRepository.findById = originalFindById;
    }
});

test('Finam LIFE cushion uses 30% of annual premium each year', async () => {
    const originalFindById = productRepository.findById;
    productRepository.findById = async () => ({ commission_schema: null });

    try {
        const client = {
            id: 88,
            goals_summary: {
                calculation: {
                    goals: [
                        {
                            goal_type: 'LIFE',
                            goal_type_id: 5,
                            term_months: 60,
                            details: {
                                program_name: 'Подушка безопасности',
                                annual_premium: 12000,
                            },
                        },
                    ],
                    summary: {
                        consolidated_portfolio: {
                            assets_allocation: [],
                            cash_flow_allocation: [
                                {
                                    name: 'Подушка безопасности',
                                    product_type: 'LIFE',
                                    amount: 1000,
                                },
                            ],
                        },
                    },
                },
            },
        };

        const result = await commissionForecastService.buildClientCommissionForecast(client, 2);
        assert.equal(result.commission_year_1_rub, 3600);
        assert.equal(result.commission_total_rub, 18000);
        assert.equal(result.series.length, 5);
    } finally {
        productRepository.findById = originalFindById;
    }
});

test('buildAgentsCommissionForecast aggregates several clients', async () => {
    const originalFindById = productRepository.findById;
    productRepository.findById = async () => ({ commission_schema: productRulesFixture });

    try {
        const mkClient = (id, initial) => ({
            id,
            goals_summary: {
                calculation: {
                    goals: [{ term_months: 12 }],
                    summary: {
                        consolidated_portfolio: {
                            assets_allocation: [{ product_id: 15, name: 'Prod', amount: initial }],
                            cash_flow_allocation: [{ product_id: 15, name: 'Prod', amount: 50 }],
                        },
                    },
                },
            },
        });
        const result = await commissionForecastService.buildAgentsCommissionForecast(
            [mkClient(1, 1000), mkClient(2, 2000)],
            14
        );
        assert.equal(result.clients.length, 2);
        assert.ok(result.commission_year_1_rub > 0);
        assert.ok(result.commission_total_rub > 0);
        assert.equal(result.series.length, 1);
    } finally {
        productRepository.findById = originalFindById;
    }
});

