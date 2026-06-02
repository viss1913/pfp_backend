const fs = require("fs");
const p = "openapi/OPENAPI_SPEC.yaml";
let o = fs.readFileSync(p, "utf8");
if (o.includes("Деактивировать агента")) { console.log("exists"); process.exit(0); }
const marker = "  /pfp/agents/me/subagents:";
const idx = o.indexOf(marker);
if (idx < 0) { console.error("marker not found"); process.exit(1); }
const block = `    delete:
      summary: Деактивировать агента (админка)
      description: |
        Мягкое удаление (is_active=false). Только admin / super_admin.
        409 если у агента есть клиенты или прямые субагенты.
      tags: [Agents]
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: integer }
      responses:
        '204': { description: Агент деактивирован }
        '403': { description: Forbidden }
        '404': { description: Agent not found }
        '409':
          description: Conflict
          content:
            application/json:
              schema:
                type: object
                properties:
                  error: { type: string }
                  message: { type: string }
                  clients_count: { type: integer }
                  subagents_count: { type: integer }

`;
o = o.slice(0, idx) + block + o.slice(idx);
fs.writeFileSync(p, o);
console.log("openapi ok");
