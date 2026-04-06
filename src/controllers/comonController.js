const comonService = require('../services/comonService');
const { sendComonUpstreamIfAny } = require('../utils/comonUpstreamResponse');

const resolveStrategyFromUrl = async (req, res) => {
    try {
        const raw = req.body?.url ?? req.body?.link;
        if (raw == null || typeof raw !== 'string' || !String(raw).trim()) {
            return res.status(400).json({ success: false, message: 'Body must include non-empty "url" or "link"' });
        }
        const data = comonService.resolveStrategyLink(raw.trim());
        res.json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const getMaintenanceInfo = async (req, res) => {
    try {
        const data = await comonService.getMaintenanceInfo();
        res.json({ success: true, data });
    } catch (error) {
        res.status(502).json({ success: false, message: error.message });
    }
};

const getStrategyProfit = async (req, res) => {
    try {
        const { id } = req.params;
        const payload = await comonService.getStrategyProfit(id);
        res.json({ success: true, data: payload });
    } catch (error) {
        const invalid = error.message === 'Invalid strategy id';
        if (invalid) {
            return res.status(400).json({ success: false, message: error.message });
        }
        if (sendComonUpstreamIfAny(res, error, { useMessageKey: true })) return;
        res.status(502).json({ success: false, message: error.message });
    }
};

const getStrategy = async (req, res) => {
    try {
        const { id } = req.params;
        const payload = await comonService.getStrategyPagePayload(id);
        res.json({ success: true, data: payload });
    } catch (error) {
        const invalid = error.message === 'Invalid strategy id';
        if (invalid) {
            return res.status(400).json({ success: false, message: error.message });
        }
        if (sendComonUpstreamIfAny(res, error, { useMessageKey: true })) return;
        res.status(502).json({ success: false, message: error.message });
    }
};

/** Урезанный снимок полей из __NEXT_DATA__ (без HTML и без полного nextData). */
const getStrategyDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const payload = await comonService.getNormalizedStrategyDetails(id);
        res.json({ success: true, data: payload });
    } catch (error) {
        const invalid = error.message === 'Invalid strategy id';
        if (invalid) {
            return res.status(400).json({ success: false, message: error.message });
        }
        if (sendComonUpstreamIfAny(res, error, { useMessageKey: true })) return;
        res.status(502).json({ success: false, message: error.message });
    }
};

module.exports = {
    resolveStrategyFromUrl,
    getMaintenanceInfo,
    getStrategyProfit,
    getStrategy,
    getStrategyDetails,
};
