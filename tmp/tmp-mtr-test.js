const dns = require('dns').promises;
const https = require('https');

(async () => {
    try {
        const v4 = await dns.lookup('api.resend.com', { family: 4 });
        console.log('dns.lookup v4:', v4);
    } catch (e) {
        console.log('dns.lookup v4 ERR:', e.message);
    }
    try {
        const all = await dns.lookup('api.resend.com', { all: true });
        console.log('dns.lookup all:', all);
    } catch (e) {
        console.log('dns.lookup all ERR:', e.message);
    }

    await new Promise((resolve) => {
        const req = https.get('https://api.resend.com', (res) => {
            console.log('GET status:', res.statusCode);
            res.resume();
            resolve();
        });
        req.on('error', (e) => {
            console.log('GET ERR:', e.code, e.message);
            resolve();
        });
        req.setTimeout(15000, () => {
            req.destroy();
            console.log('GET TIMEOUT');
            resolve();
        });
    });

    const body = JSON.stringify({ probe: 'x'.repeat(100000) });
    await new Promise((resolve) => {
        const req = https.request(
            {
                hostname: 'api.resend.com',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                },
                family: 4,
            },
            (res) => {
                console.log('POST large status:', res.statusCode);
                res.resume();
                resolve();
            }
        );
        req.on('error', (e) => {
            console.log('POST large ERR:', e.code, e.message);
            resolve();
        });
        req.setTimeout(30000, () => {
            req.destroy();
            console.log('POST large TIMEOUT');
            resolve();
        });
        req.write(body);
        req.end();
    });
})();
