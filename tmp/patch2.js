const fs = require("fs");
const p = "src/services/agentService.js";
let s = fs.readFileSync(p, "utf8");
if (s.includes("async deleteAgent")) { console.log("exists"); process.exit(0); }
const method = `
    async deleteAgent(id, projectId = null) {
        const agentId = Number(id);
        if (!Number.isFinite(agentId) || agentId <= 0) {
            throw { status: 400, message: "Invalid agent id" };
        }
        const existing = await this.getAgentById(agentId, projectId);
        if (!existing) throw { status: 404, message: "Agent not found" };
        const resolvedProjectId = existing.project_id;
        if (projectId != null && Number(resolvedProjectId) !== Number(projectId)) {
            throw { status: 404, message: "Agent not found" };
        }
        const clientsRow = await knex("clients").where({ agent_id: agentId, project_id: resolvedProjectId }).count("id as total").first();
        const clientsCount = clientsRow ? parseInt(clientsRow.total, 10) || 0 : 0;
        const subagentsRow = await knex("agents").where({ parent_agent_id: agentId, project_id: resolvedProjectId }).count("id as total").first();
        const subagentsCount = subagentsRow ? parseInt(subagentsRow.total, 10) || 0 : 0;
        if (clientsCount > 0 || subagentsCount > 0) {
            throw {
                status: 409,
                message: clientsCount > 0 ? "Нельзя удалить агента: сначала передайте или удалите его клиентов" : "Нельзя удалить агента: у него есть субагенты",
                clients_count: clientsCount,
                subagents_count: subagentsCount,
            };
        }
        const now = new Date();
        await knex.transaction(async (trx) => {
            await trx("agents").where({ id: agentId, project_id: resolvedProjectId }).update({ is_active: false, updated_at: now });
            await trx("users").where({ agent_id: agentId, project_id: resolvedProjectId }).update({ is_active: false, updated_at: now });
        });
        smmService.syncAgent(agentId).catch((err) => console.error("SMM sync delete failed:", err));
    }
`;
s = s.replace("\n}\n\nmodule.exports = new AgentService();", method + "\n}\n\nmodule.exports = new AgentService();");
fs.writeFileSync(p, s);
console.log("agentService ok");
