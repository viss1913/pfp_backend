const FIVE_SLICE_MARKERS = new Set(['MODERATELY_CONSERVATIVE', 'MODERATELY_AGGRESSIVE']);

/**
 * @param {unknown} riskProfiles
 * @returns {object[]}
 */
function coerceRiskProfilesArray(riskProfiles) {
    let list = riskProfiles;
    if (typeof list === 'string') {
        try {
            list = JSON.parse(list);
        } catch (_) {
            list = [];
        }
    }
    return Array.isArray(list) ? list : [];
}

/**
 * Портфель в «режиме 5 срезов», если в нём явно заданы умеренные уровни.
 * @param {object[]} riskProfiles
 */
function portfolioHasFiveRiskSlices(riskProfiles) {
    if (!Array.isArray(riskProfiles) || riskProfiles.length === 0) return false;
    return riskProfiles.some((p) => {
        const t = String(p?.risk_profile || p?.profile_type || '').toUpperCase();
        return FIVE_SLICE_MARKERS.has(t);
    });
}

function profileRowType(p) {
    return String(p?.risk_profile || p?.profile_type || '').toUpperCase();
}

function findRowByType(riskProfiles, typeUpper) {
    return riskProfiles.find((p) => profileRowType(p) === typeUpper) || null;
}

/**
 * Выбор строки портфеля под цель: при портфеле с MODERATELY_* — сначала risk_profile_extended, иначе risk_profile (3).
 * @param {object[]} riskProfiles
 * @param {object} goal
 * @returns {{ profile: object, searchKeyUsed: string }}
 */
function findPortfolioRiskProfileRow(riskProfiles, goal) {
    const list = coerceRiskProfilesArray(riskProfiles);
    if (list.length === 0) {
        throw new Error('No risk profiles in portfolio');
    }

    const base3 = String(goal?.risk_profile || 'BALANCED').toUpperCase();
    const useFive = portfolioHasFiveRiskSlices(list);

    if (useFive) {
        const extRaw =
            goal?.risk_profile_extended
            ?? goal?.risk_profile_details?.risk_profile_extended
            ?? null;
        if (extRaw != null && String(extRaw).trim() !== '') {
            const ext = String(extRaw).toUpperCase();
            const byExt = findRowByType(list, ext);
            if (byExt) {
                return { profile: byExt, searchKeyUsed: ext };
            }
        }
    }

    const by3 = findRowByType(list, base3);
    if (!by3) {
        throw new Error(`Risk profile ${base3} not found in portfolio`);
    }
    return { profile: by3, searchKeyUsed: base3 };
}

module.exports = {
    coerceRiskProfilesArray,
    portfolioHasFiveRiskSlices,
    findPortfolioRiskProfileRow,
    FIVE_SLICE_MARKERS
};
