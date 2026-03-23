const { clientComonStrategyService } = require('../services/clientComonStrategyService');

function requireClientId(req, res) {
    const clientId = req.user?.clientId;
    if (!clientId) {
        res.status(403).json({
            success: false,
            error: 'Раздел доступен только пользователям с ролью клиента',
        });
        return null;
    }
    return clientId;
}

async function list(req, res, next) {
    try {
        const clientId = requireClientId(req, res);
        if (clientId == null) return;
        const projectId = req.projectId ?? req.user.projectId ?? null;
        const payload = await clientComonStrategyService.listForClient(clientId, projectId);
        res.json({ success: true, data: payload });
    } catch (e) {
        next(e);
    }
}

async function getOne(req, res, next) {
    try {
        const clientId = requireClientId(req, res);
        if (clientId == null) return;
        const projectId = req.projectId ?? req.user.projectId ?? null;
        const payload = await clientComonStrategyService.getOneForClient(
            clientId,
            projectId,
            req.params.id
        );
        res.json({ success: true, data: payload });
    } catch (e) {
        if (e.status === 404) {
            return res.status(404).json({ success: false, error: e.message });
        }
        next(e);
    }
}

async function profit(req, res, next) {
    try {
        const clientId = requireClientId(req, res);
        if (clientId == null) return;
        const projectId = req.projectId ?? req.user.projectId ?? null;
        const payload = await clientComonStrategyService.getProfitForClient(
            clientId,
            projectId,
            req.params.id
        );
        res.json({ success: true, data: payload });
    } catch (e) {
        if (e.status === 404) {
            return res.status(404).json({ success: false, error: e.message });
        }
        if (e.message && String(e.message).includes('Comon strategy profit HTTP')) {
            return res.status(502).json({ success: false, error: e.message });
        }
        next(e);
    }
}

async function metrics(req, res, next) {
    try {
        const clientId = requireClientId(req, res);
        if (clientId == null) return;
        const projectId = req.projectId ?? req.user.projectId ?? null;
        const payload = await clientComonStrategyService.getMetricsForClient(
            clientId,
            projectId,
            req.params.id
        );
        res.json({ success: true, data: payload });
    } catch (e) {
        if (e.status === 404) {
            return res.status(404).json({ success: false, error: e.message });
        }
        if (e.message && String(e.message).includes('Comon strategy profit HTTP')) {
            return res.status(502).json({ success: false, error: e.message });
        }
        next(e);
    }
}

module.exports = {
    list,
    getOne,
    profit,
    metrics,
};
