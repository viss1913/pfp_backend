const fs = require("fs");

const asp = "src/services/agentService.js";
let as = fs.readFileSync(asp, "utf8");
if (!as.includes("deleteAgent")) {
  const anchor = "            return result;\r\n        });\r\n    }\r\n}\r\n\r\nmodule.exports = new AgentService();\r\n";
  const replacement = `            return result;\r\n        });\r\n    }\r\n\r\n    async deleteAgent(id, projectId = null) {\r\n        const agentId = Number(id);\r\n        if (!Number.isFinite(agentId) || agentId <= 0) {\r\n            throw { status: 400, message: 'Invalid agent id' };\r\n        }\r\n        const existing = await this.getAgentById(agentId, projectId);\r\n        if (!existing) throw { status: 404, message: 'Agent not found' };\r\n        const resolvedProjectId = existing.project_id;\r\n        if (projectId != null && Number(resolvedProjectId) !== Number(projectId)) {\r\n            throw { status: 404, message: 'Agent not found' };\r\n        }\r\n        const clientsRow = await knex('clients')\r\n            .where({ agent_id: agentId, project_id: resolvedProjectId })\r\n            .count('id as total')\r\n            .first();\r\n        const clientsCount = clientsRow ? parseInt(clientsRow.total, 10) || 0 : 0;\r\n        const subagentsRow = await knex('agents')\r\n            .where({ parent_agent_id: agentId, project_id: resolvedProjectId })\r\n            .count('id as total')\r\n            .first();\r\n        const subagentsCount = subagentsRow ? parseInt(subagentsRow.total, 10) || 0 : 0;\r\n        if (clientsCount > 0 || subagentsCount > 0) {\r\n            throw {\r\n                status: 409,\r\n                message: clientsCount > 0\r\n                    ? 'Нельзя удалить агента: сначала передайте или удалите его клиентов'\r\n                    : 'Нельзя удалить агента: у него есть субагенты',\r\n                clients_count: clientsCount,\r\n                subagents_count: subagentsCount,\r\n            };\r\n        }\r\n        const now = new Date();\r\n        await knex.transaction(async (trx) => {\r\n            await trx('agents').where({ id: agentId, project_id: resolvedProjectId }).update({\r\n                is_active: false,\r\n                updated_at: now,\r\n            });\r\n            await trx('users').where({ agent_id: agentId, project_id: resolvedProjectId }).update({\r\n                is_active: false,\r\n                updated_at: now,\r\n            });\r\n        });\r\n        smmService.syncAgent(agentId).catch((err) => console.error('SMM sync delete failed:', err));\r\n    }\r\n}\r\n\r\nmodule.exports = new AgentService();\r\n`;
  if (!as.includes(anchor)) { console.error("anchor missing"); process.exit(1); }
  as = as.replace(anchor, replacement);
  fs.writeFileSync(asp, as);
  console.log("agentService ok");
}

const acp = "src/controllers/agentController.js";
let ac = fs.readFileSync(acp, "utf8");
if (!ac.includes("async delete(req")) {
  const ins = `    async delete(req, res, next) {\r\n        try {\r\n            const isAdmin = ['admin', 'super_admin'].includes(req.user.role);\r\n            if (!isAdmin) {\r\n                return res.status(403).json({ error: 'Forbidden: Admin role required' });\r\n            }\r\n            const isSuperAdmin = req.user.role === 'super_admin';\r\n            const projectId = isSuperAdmin ? null : (req.projectId || req.user?.projectId);\r\n            await agentService.deleteAgent(req.params.id, projectId);\r\n            return res.status(204).send();\r\n        } catch (err) {\r\n            if (err.status === 409) {\r\n                return res.status(409).json({\r\n                    error: 'Conflict',\r\n                    message: err.message,\r\n                    clients_count: err.clients_count ?? 0,\r\n                    subagents_count: err.subagents_count ?? 0,\r\n                });\r\n            }\r\n            next(err);\r\n        }\r\n    }\r\n\r\n`;
  const anchor2 = "    /**\r\n     * POST /api/pfp/agents/:id/signature-upload";
  ac = ac.replace(anchor2, ins + anchor2);
  fs.writeFileSync(acp, ac);
  console.log("controller ok");
}

const rp = "src/routes/agentRoutes.js";
let ar = fs.readFileSync(rp, "utf8");
if (!ar.includes("router.delete")) {
  ar = ar.replace(
    "router.patch('/:id', agentController.update);\r\n\r\nmodule.exports = router;\r\n",
    "router.patch('/:id', agentController.update);\r\nrouter.delete('/:id', agentController.delete.bind(agentController));\r\n\r\nmodule.exports = router;\r\n"
  );
  fs.writeFileSync(rp, ar);
  console.log("routes ok");
}
