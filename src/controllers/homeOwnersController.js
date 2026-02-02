const HomeOwnersService = require('../services/HomeOwnersService');
const HomeOwnersCalculator = require('../services/calculators/HomeOwnersCalculator');

class HomeOwnersController {
    /**
     * Public/Agent: Calculate insurance premium
     */
    async calculate(req, res) {
        try {
            const { product_id, object_params, limits, client_id } = req.body;
            const agent_id = req.user.id; // From authMiddleware

            if (!product_id || !object_params || !limits) {
                return res.status(400).json({ error: 'Missing required parameters' });
            }

            const calculationResult = await HomeOwnersCalculator.calculate({
                product_id,
                object_params,
                limits
            });

            // Save calculation to history
            await HomeOwnersService.saveCalculation({
                agent_id,
                client_id: client_id || null,
                product_id,
                input_params: { object_params, limits },
                result_data: calculationResult
            });

            res.json(calculationResult);
        } catch (error) {
            console.error('[HomeOwnersController.calculate] Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Public/Agent: Get options for calculation (dropdowns)
     */
    async getOptions(req, res) {
        try {
            const { product_id } = req.query;
            if (!product_id) {
                return res.status(400).json({ error: 'product_id is required' });
            }
            const options = await HomeOwnersService.getOptions(product_id);
            res.json(options);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Public/Agent: Get list of products
     */
    async getProducts(req, res) {
        try {
            const onlyActive = req.query.all !== 'true';
            const products = await HomeOwnersService.getProducts(onlyActive);
            res.json(products);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Admin: Get tariffs for product
     */
    async getTariffs(req, res) {
        try {
            const { product_id } = req.query;
            if (!product_id) {
                return res.status(400).json({ error: 'product_id is required' });
            }
            const tariffs = await HomeOwnersService.getTariffs(product_id);
            res.json(tariffs);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Admin: Upsert product
     */
    async upsertProduct(req, res) {
        try {
            const productId = await HomeOwnersService.upsertProduct(req.body);
            res.json({ success: true, product_id: productId });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Admin: Upsert tariff
     */
    async upsertTariff(req, res) {
        try {
            const tariffId = await HomeOwnersService.upsertTariff(req.body);
            res.json({ success: true, tariff_id: tariffId });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Agent: Get calculation history
     */
    async getHistory(req, res) {
        try {
            const agentId = req.user.id;
            const { client_id } = req.query;
            const history = await HomeOwnersService.getHistory(agentId, client_id);
            res.json(history);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Admin: Delete product
     */
    async deleteProduct(req, res) {
        try {
            const { id } = req.params;
            await HomeOwnersService.deleteProduct(id);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Admin: Delete tariff
     */
    async deleteTariff(req, res) {
        try {
            const { id } = req.params;
            await HomeOwnersService.deleteTariff(id);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new HomeOwnersController();
