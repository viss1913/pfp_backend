const newsFeedService = require('../services/news/newsFeedService');
const { runIngest } = require('../services/news/newsIngestService');
const { config } = require('../services/news/newsConfig');

const getFeed = async (req, res) => {
    try {
        const agentId = req.user?.agentId || req.user?.id;
        const payload = await newsFeedService.getFeed({
            limit: req.query.limit,
            hours: req.query.hours,
            eventType: req.query.event_type || req.query.eventType,
            agentId: agentId ? Number(agentId) : undefined,
        });
        res.json(payload);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const markRead = async (req, res) => {
    try {
        const agentId = req.user?.agentId || req.user?.id;
        if (!agentId) {
            return res.status(401).json({ success: false, message: 'Agent context required' });
        }
        const articleId = parseInt(req.params.id, 10);
        if (!Number.isFinite(articleId)) {
            return res.status(400).json({ success: false, message: 'Invalid article id' });
        }
        const result = await newsFeedService.markRead(Number(agentId), articleId);
        if (!result) {
            return res.status(404).json({ success: false, message: 'Article not found' });
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

const triggerSync = async (req, res) => {
    try {
        if (!config.enabled) {
            return res.status(503).json({ success: false, message: 'News ingest disabled (NEWS_ENABLED=false)' });
        }
        const result = await runIngest();
        res.json({
            success: true,
            message: 'News ingest completed',
            result,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getFeed,
    markRead,
    triggerSync,
};
