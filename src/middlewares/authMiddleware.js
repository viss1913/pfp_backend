module.exports = (req, res, next) => {
    // Try to get agent_id from header (simplified for this task as per instructions)
    const agentIdHeader = req.headers['x-agent-id'];

    // In a real app, we would parse the Bearer token here.
    // For this task, we assume the gateway/auth service passes the ID or we read it from dev headers.

    if (agentIdHeader) {
        req.user = {
            id: parseInt(agentIdHeader, 10),
            // Mock admin role if needed, e.g. x-role header
            isAdmin: req.headers['x-role'] === 'admin'
        };
    } else {
        // If auth is strictly required for everything:
        // return res.status(401).json({ error: 'Unauthorized: agent_id missing' });

        // However, maybe some endpoints are public? 
        // The prompt says "In all requests agent_id is needed".
        // So we reject.
        return res.status(401).json({ error: 'Unauthorized: agent_id missing' });
    }

    next();
};
