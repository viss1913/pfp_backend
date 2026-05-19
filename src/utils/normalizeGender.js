function normalizeGender(raw) {
    if (raw == null || String(raw).trim() === '') return null;
    const s = String(raw).trim().toLowerCase();
    if (s === 'm' || s === 'male' || s === 'мужской') return 'male';
    if (s === 'f' || s === 'female' || s === 'женский') return 'female';
    return null;
}

module.exports = { normalizeGender };
