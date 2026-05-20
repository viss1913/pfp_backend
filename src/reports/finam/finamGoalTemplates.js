function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^a-zа-я0-9]+/gi, ' ')
        .trim();
}

function includesAny(haystack, needles) {
    return needles.some((needle) => haystack.includes(needle));
}

/** Подпись цели для маппинга шаблонов: не затирается «Сохранить и приумножить» из reportService. */
function finamTemplateLabel(goal) {
    const raw = goal?.goal_title_raw != null && String(goal.goal_title_raw).trim() !== '' ? String(goal.goal_title_raw) : '';
    if (raw) return raw;
    return String(goal?.goal_name || '').trim();
}

function matchesApartmentScenario(label) {
    const n = normalizeText(label);
    return includesAny(n, ['квартир', 'ипотек', 'первоначальн', 'взнос', 'новостро']);
}

/**
 * «Дом» подстрочно ловит «домашн…» и даёт ложный загород — только токены/явные морфемы.
 */
function matchesCountryHouseScenario(label) {
    const n = normalizeText(label);
    const tokens = n.split(/\s+/).filter(Boolean);
    if (includesAny(n, ['загород', 'коттедж', 'дачн', 'участок', 'таунхаус'])) return true;
    return tokens.some((t) => {
        if (t === 'дом' || t === 'дома' || t === 'дому' || t === 'домом' || t === 'доме') return true;
        return false;
    });
}

/**
 * Подпись в шапке и файл картинки цели для OTHER (единый HTML — goal-page-education-finam).
 */
function resolveOtherGoalScenarioMeta(goal) {
    const label = finamTemplateLabel(goal);
    const name = normalizeText(label);
    if (!name) {
        return { docLabel: 'Цель', cardFile: 'obrazovanie_rebyonka.webp' };
    }
    if (matchesApartmentScenario(label)) return { docLabel: 'Квартира', cardFile: 'kvartira.webp' };
    if (matchesCountryHouseScenario(label)) {
        const dl = String(label).trim();
        return { docLabel: (dl || 'Дом').slice(0, 42), cardFile: 'zagorodnayanedvizhimost.webp' };
    }
    if (includesAny(name, ['бизнес', 'свой бизнес'])) return { docLabel: 'Свой бизнес', cardFile: 'svoybiznes.webp' };
    if (includesAny(name, ['управление капиталом', 'капитал'])) return { docLabel: 'Капитал', cardFile: 'upravlenie_capitalom.webp' };
    if (includesAny(name, ['путешеств', 'поездк', 'переезд'])) return { docLabel: 'Путешествие', cardFile: 'puteshestvie.webp' };
    if (includesAny(name, ['автомоб', 'машин', 'авто'])) return { docLabel: 'Автомобиль', cardFile: 'drugoe.webp' };
    if (includesAny(name, ['образован', 'ребенк'])) return { docLabel: 'Образование', cardFile: 'obrazovanie_rebyonka.webp' };
    const short = String(label).trim();
    return { docLabel: short.slice(0, 48) || 'Другое', cardFile: 'drugoe.webp' };
}

/** Все OTHER рендерим одним макетом (как «Образование»); сценарий — только подпись и картинка. */
function resolveOtherGoalTemplateFile() {
    return 'goal-page-education-finam.html';
}

function resolveInvestmentTemplateFile(goalName) {
    const name = normalizeText(goalName);
    if (matchesApartmentScenario(goalName)) return 'goal-page-apartment-finam.html';
    if (includesAny(name, ['управление капиталом', 'капитал'])) return 'goal-page-capital-finam.html';
    return 'goal-page-save-grow-finam.html';
}

function resolveGoalTemplateFile(goal) {
    const label = finamTemplateLabel(goal);
    const id = Number(goal?.goal_type_id);

    if (Number.isFinite(id) && id > 0) {
        if (id === 7) return 'goal-page-fin-reserve-finam.html';
        if (id === 5) return 'goal-page-life-finam.html';
        if (id === 1) return 'goal-page-pension-finam.html';
        if (id === 2) return 'goal-page-passive-income-finam.html';
        if (id === 8) return 'goal-page-passive-income-finam.html';
        if (id === 3) return resolveInvestmentTemplateFile(label);
        if (id === 11) return resolveInvestmentTemplateFile(label);
        if (id === 4 || id === 6 || id === 9) return resolveOtherGoalTemplateFile();
    }

    const goalType = String(goal?.goal_type || '').toUpperCase();
    if (goalType === 'FIN_RESERVE') return 'goal-page-fin-reserve-finam.html';
    if (goalType === 'LIFE') return 'goal-page-life-finam.html';
    if (goalType === 'PENSION') return 'goal-page-pension-finam.html';
    if (goalType === 'PASSIVE_INCOME') return 'goal-page-passive-income-finam.html';
    if (goalType === 'RENT') return 'goal-page-passive-income-finam.html';
    if (goalType === 'INVESTMENT') return resolveInvestmentTemplateFile(label);
    if (goalType === 'INHERITANCE') return resolveInvestmentTemplateFile(label);
    if (goalType === 'OTHER') return resolveOtherGoalTemplateFile();
    return null;
}

module.exports = {
    normalizeText,
    includesAny,
    finamTemplateLabel,
    resolveOtherGoalScenarioMeta,
    resolveOtherGoalTemplateFile,
    resolveGoalTemplateFile,
};
