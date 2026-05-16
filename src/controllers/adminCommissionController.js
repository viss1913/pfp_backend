const commissionService = require('../services/commissionService');

class AdminCommissionController {
    async listEvents(req, res, next) {
        try {
            const projectId = req.projectId || req.user?.projectId;
            if (!projectId) {
                return res.status(400).json({ error: 'project_id required' });
            }
            const data = await commissionService.listEvents(projectId, req.query);
            res.json({ data });
        } catch (err) {
            next(err);
        }
    }

    async createEvent(req, res, next) {
        try {
            const projectId = req.projectId || req.user?.projectId;
            const {
                event_type,
                agent_id,
                beneficiary_agent_id,
                client_id,
                subagent_id,
                amount_rub,
                external_ref,
                metadata,
            } = req.body || {};

            if (event_type !== 'partner_deal_confirmed') {
                return res.status(400).json({ error: 'Only partner_deal_confirmed can be created manually' });
            }

            const result = await commissionService.manualPartnerDeal({
                projectId,
                agentId: Number(agent_id),
                beneficiaryAgentId: beneficiary_agent_id ? Number(beneficiary_agent_id) : null,
                amountRub: amount_rub != null ? Number(amount_rub) : null,
                externalRef: external_ref || null,
                notes: req.body?.notes || null,
                metadata: metadata || null,
            });

            res.status(201).json(result);
        } catch (err) {
            next(err);
        }
    }

    async listAccruals(req, res, next) {
        try {
            const projectId = req.projectId || req.user?.projectId;
            const data = await commissionService.listAccruals(projectId, req.query);
            res.json({ data });
        } catch (err) {
            next(err);
        }
    }

    async patchAccrual(req, res, next) {
        try {
            const projectId = req.projectId || req.user?.projectId;
            const { status, notes } = req.body || {};
            if (!status) {
                return res.status(400).json({ error: 'status is required' });
            }
            const row = await commissionService.updateAccrualStatus(
                req.params.id,
                projectId,
                status,
                notes
            );
            res.json(row);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new AdminCommissionController();
