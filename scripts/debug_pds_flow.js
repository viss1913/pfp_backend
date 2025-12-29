
const initialCapital = 100000;
const monthlyReplenishment = 10000;
const termMonths = 180;
const indexationMonthly = 0.33;
const yieldAnnual = 13;
const yieldMonthly = Math.pow(1 + (yieldAnnual / 100), 1 / 12) - 1;

function simulatePDS(limitYearly = 36000, durationYears = 10, coeff = 1.0) {
    let balance = initialCapital;
    let totalPDS = 0;
    const yearlyContribs = {};

    for (let m = 0; m < termMonths; m++) {
        const year = Math.floor(m / 12) + 1;
        const month = (m % 12) + 1;

        // Growth
        balance *= (1 + yieldMonthly);

        // Replenishment
        let repl = monthlyReplenishment * Math.pow(1 + (indexationMonthly / 100), m);
        balance += repl;
        yearlyContribs[year] = (yearlyContribs[year] || 0) + repl;

        // PDS / Corporate Logic
        // In August of Year N, pay based on Year N-1
        if (month === 8 && year > 1 && (year - 1) <= durationYears) {
            const prevContrib = yearlyContribs[year - 1];
            const benefit = Math.min(prevContrib * coeff, limitYearly); // Apply coeff and limit

            balance += benefit;
            totalPDS += benefit;
        }
    }
    return Math.round(balance);
}

console.log('--- Hypothesis: Corporate/Extended Cofinancing ---');
console.log('User Target: 9 178 154');
console.log('Current Logic (Limit 36k, 10y, Coeff 1?):', simulatePDS(36000, 10, 1.0)); // Note: my code assumed 1:1 up to 36k
// User image says "Coeff 0.5". 
// If Coeff 0.5 means "You get 0.5 of your contrib".
// 120k * 0.5 = 60k.
console.log('Coeff 0.5, Limit 36k, 10y:', simulatePDS(36000, 10, 0.5));
console.log('Coeff 0.5, Limit 60k, 10y:', simulatePDS(60000, 10, 0.5));
console.log('Coeff 0.5, NO LIMIT, 10y:', simulatePDS(999999, 10, 0.5));
console.log('Coeff 0.5, NO LIMIT, 15y:', simulatePDS(999999, 15, 0.5));
console.log('Coeff 1.0, NO LIMIT, 10y:', simulatePDS(999999, 10, 1.0));
