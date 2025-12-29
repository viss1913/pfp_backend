
const initialCapital = 50000;
const monthlyReplenishment = 5000;
const termMonths = 240;
const indexationMonthly = 0.33;
const yieldAnnual = 13;
const yieldMonthly = Math.pow(1 + (yieldAnnual / 100), 1 / 12) - 1;

function simulateNoPDS() {
    let balance = initialCapital;

    for (let m = 0; m < termMonths; m++) {
        // 1. Interest
        balance *= (1 + yieldMonthly);

        // 2. Replenishment (End of Month)
        let repl = monthlyReplenishment * Math.pow(1 + (indexationMonthly / 100), m);
        balance += repl;
    }
    return Math.round(balance);
}

function simulateNoPDS_AnnuityDue() {
    let balance = initialCapital;

    for (let m = 0; m < termMonths; m++) {
        // 1. Replenishment (Start of Month)
        let repl = monthlyReplenishment * Math.pow(1 + (indexationMonthly / 100), m);
        balance += repl;

        // 2. Interest
        balance *= (1 + yieldMonthly);
    }
    return Math.round(balance);
}

console.log('--- No PDS Simulation ---');
console.log('Ordinary (repl at end):', simulateNoPDS());
console.log('Annuity Due (repl at start):', simulateNoPDS_AnnuityDue());
