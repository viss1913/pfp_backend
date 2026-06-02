const fs = require("fs");
// controller
const p = "src/controllers/agentController.js";
let s = fs.readFileSync(p, "utf8");
if (!s.includes("async delete(req")) {
  const ins = `
    async delete(req, res, next) {
        try {
            const isAdmin = ["admin", "super_admin"].includes(req.user.role);
            if (!isAdmin) return res.status(403).json({ error: "Forbidden: Admin role required" });
            const isSuperAdmin = req.user.role === "super_admin";
            const projectId = isSuperAdmin ? null : (req.projectId || req.user?.projectId);
            await agentService.deleteAgent(req.params.id, projectId);
            return res.status(204).send();
        } catch (err) {
            if (err.status === 409) {
                return res.status(409).json({
                    error: "Conflict",
                    message: err.message,
                    clients_count: err.clients_count ?? 0,
                    subagents_count: err.subagents_count ?? 0,
                });
            }
            next(err);
        }
    }
`;
  s = s.replace("    /**\n     * POST /api/pfp/agents/:id/signature-upload", ins + "\n    /**\n     * POST /api/pfp/agents/:id/signature-upload");
  fs.writeFileSync(p, s);
  console.log("controller ok");
} else console.log("controller exists");

// routes
const r = "src/routes/agentRoutes.js";
let ar = fs.readFileSync(r, "utf8");
if (!ar.includes("router.delete")) {
  ar = ar.replace("router.patch('/:id', agentController.update);\n", "router.patch('/:id', agentController.update);\nrouter.delete('/:id', agentController.delete.bind(agentController));\n");
  fs.writeFileSync(r, ar);
  console.log("routes ok");
}

// email guard - only upsert when project_id
const cs = "src/services/clientService.js";
let c = fs.readFileSync(cs, "utf8");
c = c.replace(
  "// 1. Check if client exists by email (Upsert logic)\n            if (clientData.email) {",
  "// 1. Check if client exists by email within project (Upsert logic)\n            if (clientData.email && clientData.project_id) {"
);
fs.writeFileSync(cs, c);
console.log("client email guard ok");
