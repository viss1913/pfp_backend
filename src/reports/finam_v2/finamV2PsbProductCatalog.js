/**
 * Витрина УК / НПФ / брокера ПСБ вместо Comon и спецпредложений Финама.
 * Общие page-*-v2.html не меняются.
 */

const PSB_SHOWCASE_CATALOG = Object.freeze({
    equity: {
        pill: 'Акции',
        eyebrow: 'УК ПСБ · upravlyaem.ru',
        headline: 'Фонды акций',
        lead: 'Открытые и биржевые фонды, в основе которых акции.',
        disclaimer: 'Не является индивидуальной инвестиционной рекомендацией. Доходность в прошлом не гарантирует доходность в будущем.',
        sections: [{
            title: 'Акции',
            products: [
                { name: 'ОПИФ «Просто. Акции»', blurb: 'Готовый портфель акций с активным управлением.', href: 'https://www.upravlyaem.ru/funds/shares/', linkLabel: 'Фонд', image: 'shares.png' },
                { name: 'ОПИФ «Дивидендные акции»', blurb: 'Акции с потенциалом дивидендных выплат на счёт.', href: 'https://www.upravlyaem.ru/funds/dividendnye-aktsii/', linkLabel: 'Фонд', image: 'dividend.png' },
                { name: 'ОПИФ «Недра России»', blurb: 'Акции экспортёров нефти, газа и другого сырья.', href: 'https://www.upravlyaem.ru/funds/nedra-rossii/', linkLabel: 'Фонд', image: 'nedra.png' },
                { name: 'ОПИФ «Окно возможностей»', blurb: 'Поиск идей на рынке акций.', href: 'https://www.upravlyaem.ru/funds/promsvyaz-okno-vozmozhnostey/', linkLabel: 'Фонд', image: 'window.png' },
                { name: 'ОПИФ «Перспективные вложения»', blurb: 'Акции финансово устойчивых компаний, в том числе голубые фишки.', href: 'https://www.upravlyaem.ru/funds/kapital-perspective/', linkLabel: 'Фонд', image: 'perspective.png' },
                { name: 'ОПИФ «Курс на Восток»', blurb: 'Фонд с акцентом на восточное направление.', href: 'https://www.upravlyaem.ru/funds/kurs-na-vostok/', linkLabel: 'Фонд', image: 'east.png' },
                { name: 'БПИФ «Российские акции» · PSRE', blurb: 'Биржевой фонд российских акций.', href: 'https://www.upravlyaem.ru/funds/rossiyskie-aktsii/', linkLabel: 'Фонд', image: 'psre.png' },
            ],
        }],
    },
    bonds: {
        pill: 'Облигации',
        eyebrow: 'УК ПСБ · upravlyaem.ru',
        headline: 'Фонды облигаций',
        lead: 'От коротких бумаг и денежного рынка до корпоративных и валютных облигаций.',
        disclaimer: 'Не является индивидуальной инвестиционной рекомендацией. Доходность в прошлом не гарантирует доходность в будущем.',
        sections: [{
            title: 'Облигации',
            products: [
                { name: 'ОПИФ «Просто. Облигации»', blurb: 'ОФЗ и корпоративные облигации под макропрогноз.', href: 'https://www.upravlyaem.ru/funds/bonds/', linkLabel: 'Фонд', image: 'bonds.png' },
                { name: 'ОПИФ «Финансовая подушка»', blurb: 'РЕПО и короткие облигации, горизонт от года.', href: 'https://www.upravlyaem.ru/funds/Finansovaya-podushka/', linkLabel: 'Фонд', image: 'cushion.png' },
                { name: 'ОПИФ «Оборонный»', blurb: 'Облигации, в том числе компаний оборонно-промышленного комплекса.', href: 'https://www.upravlyaem.ru/funds/oboronnyi/', linkLabel: 'Фонд', image: 'defense.png' },
                { name: 'ОПИФ «Мировой баланс»', blurb: 'Облигации с управлением валютным риском.', href: 'https://www.upravlyaem.ru/funds/Mirovoy-balans/', linkLabel: 'Фонд', image: 'world.png' },
                { name: 'БПИФ «Рублевые облигации» · PSRB', blurb: 'Биржевой фонд рублёвых облигаций.', href: 'https://www.upravlyaem.ru/funds/rublevye-obligatsii/', linkLabel: 'Фонд', image: 'psrb.png' },
                { name: 'БПИФ «Денежный рынок» · PSMM', blurb: 'Короткий контур денежного рынка.', href: 'https://www.upravlyaem.ru/funds/denezhnyy-rynok/', linkLabel: 'Фонд', image: 'psmm.png' },
            ],
        }],
    },
    mixed: {
        pill: 'Смешанные',
        eyebrow: 'УК ПСБ · upravlyaem.ru',
        headline: 'Смешанные фонды',
        lead: 'В одном пае и акции, и облигации. Рядом — фонд золота: он не смешанный, но на витрине УК стоит отдельно.',
        disclaimer: 'Не является индивидуальной инвестиционной рекомендацией. Доходность в прошлом не гарантирует доходность в будущем.',
        sections: [{
            title: 'Смешанные и золото',
            products: [
                { name: 'ОПИФ «Просто. Баланс»', blurb: 'Акции и облигации, доли меняются по макропрогнозу.', href: 'https://www.upravlyaem.ru/funds/balanced/', linkLabel: 'Фонд', image: 'balance.png' },
                { name: 'ОПИФ «Финансовый поток»', blurb: 'В основном облигации и ограниченная доля акций, с выплатами на счёт.', href: 'https://www.upravlyaem.ru/funds/finansovyy-potok/', linkLabel: 'Фонд', image: 'flow.png' },
                { name: 'БПИФ «Золотой рынок» · PSGM', blurb: 'Биржевой фонд на золото.', href: 'https://www.upravlyaem.ru/funds/zolotoy-rynok/', linkLabel: 'Фонд', image: 'psgm.png' },
            ],
        }],
    },
    broker: {
        pill: 'Брокер',
        eyebrow: 'ПСБ · брокерский счёт',
        headline: 'Если хотите собрать портфель сами',
        lead: 'Фонды УК ведёт управляющий. Брокерский счёт нужен, когда акции, облигации и валюту выбираете вы.',
        facts: [
            { value: '0 ₽', label: 'Открытие счёта онлайн, около 5 минут' },
            { value: '0 ₽', label: 'Ведение брокерского и депозитарного счетов' },
            { value: 'за сделки', label: 'Комиссия зависит от тарифа' },
            { value: 'Мосбиржа', label: 'Фондовый, валютный и срочный рынок' },
        ],
        disclaimer: 'Доход по бумагам и валюте может расти и падать. Результат в прошлом не гарантирует доход в будущем. Размер комиссии смотрите в тарифах банка: открытие и ведение счетов бесплатные, плата берётся за сделки.',
        sections: [
            {
                title: 'Что можно делать на счёте',
                columns: 2,
                products: [
                    {
                        name: 'Акции и облигации',
                        blurb: 'Покупка и продажа на фондовом рынке Мосбиржи. Состав портфеля определяете сами.',
                        href: 'https://www.psbank.ru/personal/wealth/markets',
                        linkLabel: 'Рынки',
                    },
                    {
                        name: 'Валюта и срочный рынок',
                        blurb: 'Валютные пары: юань, белорусский рубль, тенге и лира. Срочный рынок — FORTS.',
                        href: 'https://www.psbank.ru/personal/wealth/markets',
                        linkLabel: 'Площадки',
                    },
                    {
                        name: 'Тариф «Инвестор»',
                        blurb: 'Единая комиссия на сделки с бумагами и валютой. Для оборота до 1 млн ₽.',
                        href: 'https://www.psbank.ru/personal/wealth/markets',
                        linkLabel: 'Тариф',
                    },
                    {
                        name: 'Тариф «Трейдер»',
                        blurb: 'Для активных сделок на валютном и фондовом рынке, если оборот от 1 млн ₽.',
                        href: 'https://www.psbank.ru/personal/wealth/markets',
                        linkLabel: 'Тариф',
                    },
                ],
            },
        ],
    },
    npfBroker: {
        pill: 'НПФ',
        eyebrow: 'АО НПФ ПСБ · psbnpf.ru',
        headline: 'Пенсия и долгосрочные сбережения',
        lead: 'Пенсионная цель плана ведёт в программу долгосрочных сбережений. Фонд работает с 1993 года, активы — более 30 млрд ₽, участник АСВ.',
        facts: [
            { value: '17,3%', label: 'Доход ПДС за 2024–2025, среднегодовой' },
            { value: 'до 36 000 ₽', label: 'Софинансирование в год, 10 лет' },
            { value: 'до 88 000 ₽', label: 'Налоговый вычет в год' },
            { value: 'до 2,8 млн ₽', label: 'Гарантия АСВ на накопления' },
        ],
        disclaimer: '17,3% — совокупная среднегодовая доходность инвестирования средств клиентов по ПДС за 2024–2025 годы. Результат в прошлом не определяет доход в будущем. Государство и фонд доходность не гарантируют. Гарантия АСВ покрывает накопления, а не доход.',
        sections: [
            {
                title: 'Программы фонда',
                columns: 2,
                products: [
                    {
                        name: 'Программа долгосрочных сбережений',
                        blurb: 'Взнос от 2 000 ₽ в год. Счёт растёт за счёт взносов, софинансирования и дохода фонда.',
                        yieldLabel: '17,3% за 2024–2025',
                        href: 'https://psbnpf.ru/products/programma-dolgosrochnykh-sberezheniy/',
                        linkLabel: 'ПДС',
                    },
                    {
                        name: 'Перевод накопительной пенсии в ПДС',
                        blurb: 'Уже сформированные накопления ОПС можно перевести в программу единовременным взносом.',
                        href: 'https://psbnpf.ru/products/perevod-nakopitelnoy-pensii-v-pds/',
                        linkLabel: 'Перевод',
                    },
                    {
                        name: 'Обязательное пенсионное страхование',
                        blurb: 'Управление накопительной пенсией. Новые взносы работодателя с 2014 года на неё не идут.',
                        href: 'https://psbnpf.ru/products/obyazatelnoe-pensionnoe-strakhovanie/',
                        linkLabel: 'ОПС',
                    },
                    {
                        name: 'Негосударственное пенсионное обеспечение',
                        blurb: 'Дополнительная пенсия из взносов и результата размещения. Выплата по графику или пожизненно.',
                        href: 'https://psbnpf.ru/products/negosudarstvennoe-pensionnoe-obespechenie/',
                        linkLabel: 'НПО',
                    },
                ],
            },
            {
                title: 'Софинансирование по доходу',
                products: [
                    {
                        name: 'До 80 000 ₽ в месяц',
                        blurb: 'Один к одному: на 36 000 ₽ взносов государство добавляет 36 000 ₽.',
                        yieldLabel: '1 : 1',
                        href: 'https://psbnpf.ru/products/programma-dolgosrochnykh-sberezheniy/',
                        linkLabel: 'Условия',
                    },
                    {
                        name: '80–150 тыс. ₽ в месяц',
                        blurb: 'Два к одному: на 36 000 ₽ взносов государство добавляет 18 000 ₽.',
                        yieldLabel: '2 : 1',
                        href: 'https://psbnpf.ru/products/programma-dolgosrochnykh-sberezheniy/',
                        linkLabel: 'Условия',
                    },
                    {
                        name: 'От 150 тыс. ₽ в месяц',
                        blurb: 'Четыре к одному: на 36 000 ₽ взносов государство добавляет 9 000 ₽.',
                        yieldLabel: '4 : 1',
                        href: 'https://psbnpf.ru/products/programma-dolgosrochnykh-sberezheniy/',
                        linkLabel: 'Условия',
                    },
                ],
            },
        ],
    },
});

module.exports = { PSB_SHOWCASE_CATALOG };
