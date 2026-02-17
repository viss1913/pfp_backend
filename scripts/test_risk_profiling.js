const axios = require('axios');
const db = require('../src/config/database');

const API_URL = 'http://localhost:3000/api';
const TEST_EMAIL = `risk_test_${Date.now()}@test.com`;

async function testRiskProfiling() {
    console.log('═══════════════════════════════════════════');
    console.log('  RISK PROFILING (DENGINA) TEST');
    console.log('═══════════════════════════════════════════');

    try {
        // 1. Register and Verify
        console.log('\n1️⃣  Registering client...');
        await axios.post(`${API_URL}/auth/register-client`, {
            email: TEST_EMAIL,
            name: 'Risk Tester',
            project_key: 'pk_9cfe10dcec21667bd5c557ea' // Default project key
        });

        const verification = await db('email_verifications').where({ email: TEST_EMAIL }).orderBy('created_at', 'desc').first();
        const code = verification.code;
        console.log(`   ✅ Code from DB: ${code}`);

        const verifyRes = await axios.post(`${API_URL}/auth/verify-code`, {
            email: TEST_EMAIL,
            code: code,
            password: 'password123'
        });
        const token = verifyRes.data.token;
        const clientId = verifyRes.data.user.clientId;
        console.log(`   ✅ Account created! clientId: ${clientId}`);

        const headers = { Authorization: `Bearer ${token}` };

        // 2. First Run with Risk Answers
        // Sum Q2-Q10 = 30 points
        const riskAnswers = {
            q2: 3, q3: 3, q4: 4, q5: 3, q6: 3, q7: 4, q8: 3, q9: 3, q10: 4
        };

        console.log('\n2️⃣  Running First Run with 2 goals (12mo and 300mo)...');
        const firstRunRes = await axios.post(`${API_URL}/my/plan/first-run`, {
            goals: [
                {
                    goal_type_id: 4,
                    name: 'Short Term Goal',
                    target_amount: 1000000,
                    term_months: 12, // Q1 = 1 point. Total = 30 + 1 = 31 -> BALANCED
                    risk_profile: 'BALANCED' // Optional now, but Joi might require it or it gets overwritten
                },
                {
                    goal_type_id: 4,
                    name: 'Long Term Goal',
                    target_amount: 10000000,
                    term_months: 300, // Q1 = 5 points. Total = 30 + 5 = 35 -> AGGRESSIVE
                    risk_profile: 'BALANCED'
                }
            ],
            client: {
                risk_profile_answers: riskAnswers
            }
        }, { headers });

        const goals = firstRunRes.data.goals;
        const shortGoal = goals.find(g => g.goal_name === 'Short Term Goal');
        const longGoal = goals.find(g => g.goal_name === 'Long Term Goal');

        console.log(`   Short Term Goal Profile: ${shortGoal.risk_profile}`);
        console.log(`   Long Term Goal Profile: ${longGoal.risk_profile}`);

        if (shortGoal.risk_profile === 'BALANCED' && longGoal.risk_profile === 'AGGRESSIVE') {
            console.log('   ✅ SUCCESS: Profiles calculated correctly based on horizon!');
        } else {
            console.log('   ❌ FAILURE: Profiles do not match expected values.');
        }

        // 3. Recalculate Short Goal to Long Term
        console.log('\n3️⃣  Recalculating Short Goal to 300 months...');
        const recalcRes = await axios.post(`${API_URL}/my/plan/${shortGoal.goal_id}/recalculate`, {
            term_months: 300 // Should now become AGGRESSIVE (30 + 5 points)
        }, { headers });

        const updatedGoal = recalcRes.data.goals.find(g => g.goal_id === shortGoal.goal_id);
        console.log(`   Updated Goal Profile: ${updatedGoal.risk_profile}`);

        if (updatedGoal.risk_profile === 'AGGRESSIVE') {
            console.log('   ✅ SUCCESS: Profile updated automatically after term change!');
        } else {
            console.log('   ❌ FAILURE: Profile did not update.');
        }

        // 4. Check DB Persistence
        console.log('\n4️⃣  Checking if answers are saved in DB...');
        const clientInDb = await db('clients').where({ id: clientId }).first();
        if (clientInDb.risk_profile_answers) {
            console.log('   ✅ Answers found in DB');
        } else {
            console.log('   ❌ Answers NOT found in DB');
        }

        console.log('\n🧹 Cleaning up test data...');
        await db('users').where({ email: TEST_EMAIL }).del();
        await db('email_verifications').where({ email: TEST_EMAIL }).del();
        // client record will be deleted by ON DELETE CASCADE if configured, or manually:
        await db('clients').where({ id: clientId }).del();
        console.log('   ✅ Cleaned up');

    } catch (err) {
        console.error('\n❌ TEST FAILED:');
        if (err.response) {
            console.error('Status:', err.response.status);
            console.error('Data:', JSON.stringify(err.response.data, null, 2));
        } else {
            console.error(err.stack);
        }
    } finally {
        process.exit();
    }
}

testRiskProfiling();
