const TaxService = require('../src/services/TaxService');

async function testProgressive() {
    console.log("--- TEST 1: Standard Income (13%) ---");
    const income1 = 150000 * 12; // 1.8M
    const contrib1 = 400000;
    const res1 = await TaxService.calculatePdsRefundDelta(income1, contrib1, 2024);
    console.log(`Income: ${income1}, Contrib: ${contrib1}`);
    console.log(`Refund: ${res1.refundAmount} (Expect ~52000 if 13%)`);

    console.log("\n--- TEST 2: High Income (15%) ---");
    const income2 = 600000 * 12; // 7.2M
    const contrib2 = 400000;
    const res2 = await TaxService.calculatePdsRefundDelta(income2, contrib2, 2024);
    console.log(`Income: ${income2}, Contrib: ${contrib2}`);
    console.log(`Refund: ${res2.refundAmount} (Expect ~60000 if 15%)`);

    if (res2.refundAmount > res1.refundAmount) {
        console.log("\n✅ SUCCESS: Progressive tax applied. High income gets more refund for same contribution.");
    } else {
        console.log("\n❌ FAIL: Progressive tax NOT applied or results are incorrect.");
    }
}

testProgressive();
