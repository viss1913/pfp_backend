/**
 * One-off: find and hard-delete inactive agent+user by email (reuse email for invite).
 * Usage: node tmp/purge-agent-by-email.js <email>
 */
const db = require('/app/src/config/database');

const email = String(process.argv[2] || '')
    .trim()
    .toLowerCase();
if (!email) {
    console.error('Usage: node tmp/purge-agent-by-email.js <email>');
    process.exit(1);
}

async function main() {
    const users = await db('users').where('email', email).orWhere('email', 'like', `%${email}%`);
    console.log('users_found', users.length);
    for (const u of users) {
        console.log(JSON.stringify(u));
    }

    const exact = await db('users').where({ email }).first();
    if (!exact) {
        console.log('No exact user for', email);
        process.exit(0);
    }

    const agentId = exact.agent_id;
    const projectId = exact.project_id;
    const userId = exact.id;

    await db.transaction(async (trx) => {
        if (agentId) {
            const tokens = await trx('agent_invite_tokens').where({ agent_id: agentId });
            console.log('invite_tokens', tokens.length);
            await trx('agent_invite_tokens').where({ agent_id: agentId }).del();

            const verifs = await trx('email_verifications').where({ email }).orWhere({ email: exact.email });
            console.log('email_verifications', verifs.length);
            await trx('email_verifications').where({ email: exact.email }).del();

            const subagents = await trx('agents').where({ parent_agent_id: agentId });
            console.log('subagents', subagents.length);

            await trx('agents').where({ id: agentId, project_id: projectId }).del();
            console.log('deleted agent', agentId);
        }
        await trx('users').where({ id: userId }).del();
        console.log('deleted user', userId);
    });

    const check = await db('users').where({ email }).first();
    console.log('after', check ? 'STILL_EXISTS' : 'OK_EMAIL_FREE');
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
