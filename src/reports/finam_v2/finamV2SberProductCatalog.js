/**
 * MVP-витрина продуктов Сбера в Finam Report v2 (projectId 29).
 * Placeholder-карточки; реальные названия/доходности — фаза 2 (settings/API).
 */

const SBER_UK_FUNDS_URL = 'https://first-am.ru/fund';
const SBER_INVESTMENTS_URL = 'https://www.sberbank.ru/ru/person/investments';

function placeholderProducts(baseHref, blurbPrefix) {
    return [
        {
            name: 'Продукт 1',
            blurb: `${blurbPrefix} Карточка-заглушка: название и условия уточняются на витрине партнёра.`,
            yieldLabel: '—',
            href: baseHref,
            linkLabel: 'Подробнее',
        },
        {
            name: 'Продукт 2',
            blurb: `${blurbPrefix} Вторая опция витрины для сравнения с клиентом перед оформлением.`,
            yieldLabel: '—',
            href: baseHref,
            linkLabel: 'Подробнее',
        },
    ];
}

const SBER_SHOWCASE_CATALOG = Object.freeze({
    equities: Object.freeze({
        pill: 'Акции',
        eyebrow: 'Акционерный контур портфеля',
        headline: 'Варианты реализации доли акций в плане',
        lead:
            'Ниже — ориентиры витрин УК «Первая» и Сбер Инвестиции. Выбор конкретного продукта — после согласования доли в портфеле, горизонта и риск-профиля; цифры доходности не входят в расчёт финплана.',
        insight:
            'Смысл блока: сопоставить управляемые фонды и брокерский контур с долей роста в портфеле, а не гнаться за максимальной цифрой на баннере.',
        disclaimer:
            'Ожидаемая доходность и условия продуктов — ориентиры витрины партнёра. Они не заменяют договор, регламент и проверку актуальных условий на сайте перед подключением.',
        sections: Object.freeze([
            Object.freeze({
                title: 'УК «Первая»',
                products: Object.freeze(placeholderProducts(SBER_UK_FUNDS_URL, 'Фонд / стратегия УК «Первая».')),
            }),
            Object.freeze({
                title: 'Сбер Инвестиции',
                products: Object.freeze(
                    placeholderProducts(SBER_INVESTMENTS_URL, 'Решение в контуре Сбер Инвестиции.')
                ),
            }),
        ]),
    }),
    bonds: Object.freeze({
        pill: 'Облигации',
        eyebrow: 'Облигационный контур портфеля',
        headline: 'Варианты реализации доли облигаций в плане',
        lead:
            'Витрина для купонного потока и снижения волатильности: фонды УК «Первая» и продукты Сбер Инвестиции. Ожидаемые доходности — маркетинговые ориентиры сайта, не расчёт финплана.',
        insight:
            'Смысл блока: подобрать инструмент под роль облигаций в портфеле (купон, дюрация, валюта), а не по максимальной доходности на баннере.',
        disclaimer:
            'Ожидаемая доходность, минимальные суммы и описания продуктов являются ориентиром витрины. Они не заменяют договор и проверку актуальных условий на сайте партнёра.',
        sections: Object.freeze([
            Object.freeze({
                title: 'УК «Первая»',
                products: Object.freeze(placeholderProducts(SBER_UK_FUNDS_URL, 'Облигационный фонд / стратегия УК «Первая».')),
            }),
            Object.freeze({
                title: 'Сбер Инвестиции',
                products: Object.freeze(
                    placeholderProducts(SBER_INVESTMENTS_URL, 'Облигационное решение в контуре Сбер Инвестиции.')
                ),
            }),
        ]),
    }),
});

module.exports = {
    SBER_UK_FUNDS_URL,
    SBER_INVESTMENTS_URL,
    SBER_SHOWCASE_CATALOG,
};
