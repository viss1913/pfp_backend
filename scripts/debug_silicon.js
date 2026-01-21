const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const endpoints = [
    'https://api.siliconflow.cn/v1',
    'https://api.siliconflow.com/v1'
];

async function testEndpoint(endpoint, apiKey) {
    console.log(`\n⏳ Testing endpoint: ${endpoint} ...`);
    try {
        // Try getting user info first (lighter weight)
        const response = await axios.get(`${endpoint}/user/info`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            timeout: 10000
        });
        console.log(`✅ SUCCESS! Connected to ${endpoint}`);
        console.log(`   User Info: ${JSON.stringify(response.data)}`);
        return true;
    } catch (error) {
        console.log(`❌ FAILED on ${endpoint}`);
        if (error.response) {
            console.log(`   Status: ${error.response.status}`);
            console.log(`   Reason:`, error.response.data);
        } else {
            console.log(`   Error: ${error.message}`);
        }
        return false;
    }
}

rl.question('Введите ваш SiliconFlow API Key (sk-...): ', async (apiKey) => {
    apiKey = apiKey.trim();
    if (!apiKey) {
        console.error('Key is empty');
        rl.close();
        return;
    }

    console.log(`\n🔎 Testing Key: ${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 6)}`);

    let success = false;
    for (const endpoint of endpoints) {
        if (await testEndpoint(endpoint, apiKey)) {
            success = true;
        }
    }

    if (success) {
        console.log('\n🎉 Key is VALID for at least one endpoint.');
    } else {
        console.log('\n💀 Key failed on ALL endpoints. Check the key again.');
    }
    rl.close();
});
