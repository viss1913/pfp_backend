const adminRepository = require('../repositories/adminRepository');

class AdminPfpController {
    async getPfpCalculations(req, res) {
        try {
            const { limit, page, sort, order, search } = req.query;
            const results = await adminRepository.getPfpCalculations({
                limit: limit ? parseInt(limit) : 20,
                page: page ? parseInt(page) : 1,
                sort,
                order,
                search
            });
            res.json(results);
        } catch (error) {
            console.error('Admin PFP List Error:', error);
            res.status(500).json({ error: 'Failed to fetch PFP calculations' });
        }
    }
}

module.exports = new AdminPfpController();
