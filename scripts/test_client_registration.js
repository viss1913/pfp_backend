/**
 * Test script for client registration flow
 * Run from project root: node scripts/test_client_registration.js
 */

require('dotenv').config();
const path = require('path');
const BASE = 'http://localhost:3000/api';

async function request(method, urlPath, body = null, token = null) {
    const url = `${BASE}${urlPath}`;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const data = await res.json();
    return { status: res.status, data };
}

async function main() {
    const testEmail = `test_client_${Date.now()}@test.com`;
    const PROJECT_KEY = 'pk_9cfe10dcec21667bd5c557ea';

    // Load DB from project root
    const db = require(path.resolve(__dirname, '..', 'src', 'config', 'database'));

    console.log('═══════════════════════════════════════════');
    console.log('  CLIENT REGISTRATION FLOW TEST');
    console.log('═══════════════════════════════════════════\n');

    // 1. Register client (send code)
    console.log('1️⃣  POST /auth/register-client');
    const reg = await request('POST', '/auth/register-client', {
        email: testEmail,
        name: 'Тест Клиент',
        project_key: PROJECT_KEY
    });
    console.log(`   Status: ${reg.status}`);
    console.log(`   Response:`, JSON.stringify(reg.data, null, 2));

    if (reg.status !== 200) {
        console.error('❌ Registration endpoint failed!');
        await db.destroy();
        process.exit(1);
    }
    console.log('   ✅ Code sent (or logged in dev mode)');

    // 2. Get code from DB
    console.log('\n2️⃣  Getting verification code from DB...');
    const verification = await db('email_verifications')
        .where({ email: testEmail })
        .orderBy('created_at', 'desc')
        .first();

    if (!verification) {
        console.error('❌ No verification record found in DB!');
        await db.destroy();
        process.exit(1);
    }
    console.log(`   ✅ Code: ${verification.code}`);
    console.log(`   Project ID: ${verification.project_id}`);

    // 3. Verify code + create account
    console.log('\n3️⃣  POST /auth/verify-code');
    const verify = await request('POST', '/auth/verify-code', {
        email: testEmail,
        code: verification.code,
        password: 'test123456'
    });
    console.log(`   Status: ${verify.status}`);
    console.log(`   Response:`, JSON.stringify(verify.data, null, 2));

    if (verify.status !== 201) {
        console.error('❌ Verification failed!');
        await db.destroy();
        process.exit(1);
    }

    const clientToken = verify.data.token;
    console.log(`   ✅ Account created! clientId: ${verify.data.user.clientId}, role: ${verify.data.user.role}`);

    // 4. GET /my/plan
    console.log('\n4️⃣  GET /my/plan (with client token)');
    const plan = await request('GET', '/my/plan', null, clientToken);
    console.log(`   Status: ${plan.status}`);
    if (plan.data && plan.data.first_name) {
        console.log(`   ✅ Client: ${plan.data.first_name} ${plan.data.last_name}`);
        console.log(`   Goals: ${(plan.data.goals || []).length}`);
    } else {
        console.log(`   Response:`, JSON.stringify(plan.data));
    }

    // 5. Login as client
    console.log('\n5️⃣  POST /auth/login (as client)');
    const login = await request('POST', '/auth/login', {
        email: testEmail,
        password: 'test123456'
    });
    console.log(`   Status: ${login.status}`);
    console.log(`   ✅ Role: ${login.data.user?.role}, ClientId: ${login.data.user?.clientId}, ProjectId: ${login.data.user?.projectId}`);

    // 6. Agent login still works
    console.log('\n6️⃣  POST /auth/login (as existing agent — should still work)');
    const agentLogin = await request('POST', '/auth/login', {
        email: 'vissarovav@gmail.com',
        password: '123456'
    });
    console.log(`   Status: ${agentLogin.status}`);
    if (agentLogin.status === 200) {
        console.log(`   ✅ Agent login OK! Role: ${agentLogin.data.user?.role}, AgentId: ${agentLogin.data.user?.agentId}`);
    } else {
        console.error('   ❌ Agent login broken!');
    }

    // 7. Agent should NOT access /my/plan
    console.log('\n7️⃣  GET /my/plan (with agent token — should be 403)');
    const agentPlan = await request('GET', '/my/plan', null, agentLogin.data.token);
    console.log(`   Status: ${agentPlan.status} ${agentPlan.status === 403 ? '✅ Correctly blocked' : '❌ Should be 403!'}`);

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await db('goals').whereIn('client_id', db('clients').select('id').where({ email: testEmail })).del();
    await db('clients').where({ email: testEmail }).del();
    await db('users').where({ email: testEmail }).del();
    await db('email_verifications').where({ email: testEmail }).del();
    console.log('   ✅ Cleaned up');

    console.log('\n═══════════════════════════════════════════');
    console.log('  ✅ ALL TESTS COMPLETED');
    console.log('═══════════════════════════════════════════');

    await db.destroy();
    process.exit(0);
}

main().catch(async (err) => {
    console.error('❌ Test failed:', err.message || err);
    process.exit(1);
});
