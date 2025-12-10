const calculationService = require('../services/calculationService');

class ClientController {
    async calculateFirstRun(req, res, next) {
        try {
            const result = await calculationService.calculateFirstRun(req.body);
            res.json(result);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new ClientController();
