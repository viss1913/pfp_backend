/**
 * Placeholders in B2C orchestrator prompts (agent LK settings, stages, brain).
 * Substituted per turn from session_context + assistant display name.
 *
 * Supported: {{agent}}, {{agent_full_name}}, {{agent_first_name}},
 * {{agent_last_name}}, {{agent_display_name}}, {{ref}}, {{assistant_name}}
 */

const PLACEHOLDER_RE =
    /\{\{\s*(agent_full_name|agent_first_name|agent_last_name|agent_display_name|agent|ref|assistant_name)\s*\}\}/gi;

function buildPromptVarMap({ session = null, assistantName = '' } = {}) {
    const agent = session?.agent && typeof session.agent === 'object' ? session.agent : null;
    const ref = String(session?.ref || '').trim();
    const fullName =
        String(agent?.full_name || '').trim() ||
        [agent?.first_name, agent?.last_name]
            .map((p) => String(p || '').trim())
            .filter(Boolean)
            .join(' ')
            .trim() ||
        String(agent?.display_name || '').trim();
    const displayName = String(agent?.display_name || '').trim() || fullName;

    return {
        agent: fullName,
        agent_full_name: fullName,
        agent_first_name: String(agent?.first_name || '').trim(),
        agent_last_name: String(agent?.last_name || '').trim(),
        agent_display_name: displayName,
        ref,
        assistant_name: String(assistantName || '').trim(),
    };
}

function substitutePromptVars(text, varMap = {}) {
    if (text == null || text === '') return text;
    return String(text).replace(PLACEHOLDER_RE, (_match, key) => {
        const normalized = String(key || '').toLowerCase();
        const value = varMap[normalized];
        return value != null ? String(value) : '';
    });
}

module.exports = {
    PLACEHOLDER_RE,
    buildPromptVarMap,
    substitutePromptVars,
};
