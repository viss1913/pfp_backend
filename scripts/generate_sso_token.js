const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

// Using the UUID from your screenshot!
const testUuid = '77be4c6c-5762-42a9-86d2-14218433a5dd';
const testUserId = 10001;
const testEmail = 'vissarovav@gmail.com';

const payload = {
    id: testUuid,      // This is what SMM AI expects as the primary identifier
    user_id: testUserId, // This is what PFP Backend uses internally
    email: testEmail,
    role: 'agent',
    agentId: 10001
};

const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

console.log('=== SSO TOKEN GENERATOR ===');
console.log('\nPayload:', JSON.stringify(payload, null, 2));
console.log('\nGenerated JWT Token:\n', token);
console.log('\nCopy this token to https://jwt.io to verify the structure.');
console.log('Use JWT_SECRET from your .env to verify the signature.');
