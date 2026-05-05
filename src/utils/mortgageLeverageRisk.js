/**
 * LTV для смягчения компонента «долг» в risk profile: стоимость жилья из family_profile vs остаток ипотеки.
 */

function _norm(s) {
    return String(s || '').toLowerCase();
}

function isMortgageLiability(item) {
    if (!item || typeof item !== 'object') return false;
    const type = _norm(item.type);
    const name = _norm(item.name);
    if (/mortgage|ипотек|ipotek/i.test(type)) return true;
    if (/mortgage|ипотек|ipotek/i.test(name)) return true;
    return false;
}

function sumRealEstateValue(familyProfile) {
    const fp = familyProfile && typeof familyProfile === 'object' ? familyProfile : {};
    const re = Array.isArray(fp.real_estate) ? fp.real_estate : [];
    return re.reduce((sum, x) => sum + Number(x?.estimated_value || 0), 0);
}

function hasMortgageStatusRealEstate(familyProfile) {
    const fp = familyProfile && typeof familyProfile === 'object' ? familyProfile : {};
    const re = Array.isArray(fp.real_estate) ? fp.real_estate : [];
    return re.some((x) => _norm(x?.status) === 'mortgage');
}

/**
 * @returns {{ total_value: number, mortgage_remaining: number, ltv: number|null, source: string }}
 */
function getMortgageLeverageSnapshot(client = {}) {
    const fp = client.family_profile && typeof client.family_profile === 'object' ? client.family_profile : {};
    const liabilities = Array.isArray(client.liabilities) ? client.liabilities : [];
    const totalValue = sumRealEstateValue(fp);

    let mortgageRemaining = 0;
    let source = 'none';
    for (const item of liabilities) {
        if (isMortgageLiability(item)) {
            mortgageRemaining += Number(item.remaining_amount ?? 0);
        }
    }
    if (mortgageRemaining > 0) {
        source = 'liability_match';
    } else if (
        totalValue > 0
        && hasMortgageStatusRealEstate(fp)
        && liabilities.length === 1
    ) {
        mortgageRemaining = Number(liabilities[0].remaining_amount ?? 0);
        if (mortgageRemaining > 0) source = 'single_liability_fallback';
    }

    let ltv = null;
    if (totalValue > 0 && mortgageRemaining >= 0) {
        ltv = Math.min(1, mortgageRemaining / totalValue);
    }

    return {
        total_value: totalValue,
        mortgage_remaining: mortgageRemaining,
        ltv,
        source
    };
}

/**
 * @param {number} baseDebtScore — целое 1..5 из платёж/доход
 * @param {{ ltv: number|null }} snapshot
 * @returns {{ debtScore: number, debt_adjustment: number }}
 */
function applyLtvDebtBonus(baseDebtScore, snapshot) {
    const base = Number(baseDebtScore);
    const safeBase = Number.isFinite(base) ? Math.max(1, Math.min(5, base)) : 3;
    if (snapshot.ltv == null || !Number.isFinite(snapshot.ltv)) {
        return { debtScore: safeBase, debt_adjustment: 0 };
    }
    let adj = 0;
    if (snapshot.ltv <= 0.35) adj = 1;
    else if (snapshot.ltv <= 0.55) adj = 0.5;

    const debtScore = Math.max(1, Math.min(5, safeBase + adj));
    return { debtScore, debt_adjustment: adj };
}

module.exports = {
    getMortgageLeverageSnapshot,
    applyLtvDebtBonus,
    isMortgageLiability,
};
