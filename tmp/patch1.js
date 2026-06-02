const fs = require("fs");
const p = "src/services/clientService.js";
let s = fs.readFileSync(p, "utf8");
const a = "await clientRepository.findByEmail(clientData.email, null, trx)";
const b = "await clientRepository.findByEmail(clientData.email, clientData.project_id || null, trx)";
if (!s.includes(a)) { console.log("skip or already patched", s.includes(b)); process.exit(s.includes(b)?0:1); }
s = s.replace(a, b);
s = s.replace("await clientRepository.update(clientId, clientData, null, trx)", "await clientRepository.update(clientId, clientData, clientData.project_id || null, trx)");
// insert project_id resolve before email block
const marker = "// 1. Check if client exists by email";
if (!s.includes("upsertProjectId")) {
  s = s.replace(marker, `if (!clientData.project_id && clientData.agent_id) {
                const agentRow = await trx("agents").where({ id: clientData.agent_id }).first();
                if (agentRow) clientData.project_id = agentRow.project_id;
            }

            ${marker}`);
}
fs.writeFileSync(p, s);
console.log("patched");
