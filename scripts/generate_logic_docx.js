
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle } = require('docx');

const generateDoc = async () => {
    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    text: "Описание логики расчета финансовых целей (НПФ Ростех)",
                    heading: HeadingLevel.TITLE,
                    spacing: { after: 200 },
                }),
                new Paragraph({
                    text: "В данном документе описана пошаговая логика расчета для четырех основных типов целей: Государственная пенсия, Пассивный доход (Рантье), Инвестиции (Накопление) и Целевая покупка (Дом/Квартира).",
                    spacing: { after: 200 },
                }),

                // --- 1. Входящие Данные ---
                new Paragraph({
                    text: "1. Входящие данные (Input Data)",
                    heading: HeadingLevel.HEADING_1,
                    spacing: { before: 200, after: 100 },
                }),
                new Paragraph({
                    text: "Для проведения расчетов система собирает следующий набор данных. Часть данных (профиль клиента) является обязательной для всех типов целей, так как влияет на расчет налогов, госпенсии и лимитов софинансирования.",
                    spacing: { after: 100 },
                }),

                new Paragraph({
                    text: "1.1. Профиль клиента (Обязательно для всех целей)",
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 100, after: 50 },
                }),
                new Paragraph({ text: "Независимо от выбранной цели, у клиента запрашиваются:" }),
                new Paragraph({ text: "1. Пол (Sex): Необходим для определения возраста выхода на государственную пенсию (60 лет для женщин, 65 для мужчин).", bullet: { level: 0 } }),
                new Paragraph({ text: "2. Дата рождения (Age): Необходима для расчета текущего возраста, срока до пенсии и горизонта инвестирования.", bullet: { level: 0 } }),
                new Paragraph({ text: "3. Среднемесячный доход (Income): Используется для:", bullet: { level: 0 } }),
                new Paragraph({ text: "Расчета накопленных и будущих пенсионных баллов (ИПК).", bullet: { level: 1 } }),
                new Paragraph({ text: "Расчета доступных налоговых вычетов.", bullet: { level: 1 } }),

                new Paragraph({
                    children: [
                        new TextRun({ text: "Важно (НПФ Ростех): ", bold: true }),
                        new TextRun("В расчетах для НПФ Ростех всегда предполагается наличие "),
                        new TextRun({ text: "Программы Долгосрочных Сбережений (ПДС)", bold: true }),
                        new TextRun(" в составе инвестиционного портфеля. Это означает, что логика автоматического расчета государственного софинансирования активна для всех целей."),
                    ],
                    spacing: { before: 100, after: 100 },
                    border: {
                        left: { color: "auto", space: 1, style: BorderStyle.SINGLE, size: 6 },
                    },
                }),

                new Paragraph({
                    text: "1.2. Параметры цели",
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 100, after: 50 },
                }),
                new Paragraph({ text: "Для каждой конкретной цели дополнительно запрашиваются:" }),
                new Paragraph({ text: "Срок цели (Term): Когда нужны деньги (или дата выхода на пенсию).", bullet: { level: 0 } }),
                new Paragraph({ text: "Стартовый капитал: Сколько есть сейчас.", bullet: { level: 0 } }),
                new Paragraph({ text: "Желаемая сумма (Target): Для целей типа \"Покупка\" или желаемый ежемесячный доход для \"Пенсии\"/\"Рантье\".", bullet: { level: 0 } }),
                new Paragraph({ text: "Ежемесячный взнос: Сколько клиент готов откладывать (для цели \"Инвестиции\").", bullet: { level: 0 } }),

                // --- 2. Общие Принципы ---
                new Paragraph({
                    text: "2. Общие принципы расчета",
                    heading: HeadingLevel.HEADING_1,
                    spacing: { before: 200, after: 100 },
                }),
                new Paragraph({ text: "При расчетах используются следующие базовые допущения:", spacing: { after: 100 } }),
                new Paragraph({
                    children: [
                        new TextRun({ text: "Инфляция (inflation_rate):", bold: true }),
                        new TextRun(" Все будущие стоимости (целевые суммы) индексируются на уровень инфляции. По умолчанию 4-5% (настраивается)."),
                    ],
                    bullet: { level: 0 }
                }),
                new Paragraph({
                    children: [
                        new TextRun({ text: "Доходность портфелей:", bold: true }),
                        new TextRun(" Для каждой цели подбирается инвестиционный портфель (стратегия), доходность которого зависит от риск-профиля (Консервативный, Сбалансированный, Агрессивный) и срока инвестирования. Доходность рассчитывается как средневзвешенная по инструментам внутри портфеля."),
                    ],
                    bullet: { level: 0 }
                }),
                new Paragraph({
                    children: [
                        new TextRun({ text: "Индексация взносов (investment_expense_growth_monthly):", bold: true }),
                        new TextRun(" Предполагается, что клиент ежегодно увеличивает сумму своего ежемесячного взноса (обычно на уровень инфляции), чтобы сохранять реальную покупательную способность сбережений."),
                    ],
                    bullet: { level: 0 }
                }),
                new Paragraph({
                    children: [
                        new TextRun({ text: "ПДС (Программа Долгосрочных Сбережений):", bold: true }),
                        new TextRun(" Так как для НПФ Ростех ПДС включена всегда, система автоматически рассчитывает государственное софинансирование (до 36 000 руб. в год в течение первых 10 лет) при выполнении условий по взносам и добавляет его к капиталу клиента."),
                    ],
                    bullet: { level: 0 }
                }),

                // --- 3. Логика по типам целей ---
                new Paragraph({
                    text: "3. Логика по типам целей",
                    heading: HeadingLevel.HEADING_1,
                    spacing: { before: 200, after: 100 },
                }),

                // 3.1 Pension
                new Paragraph({
                    text: "3.1. Государственная пенсия (State Pension)",
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 100, after: 50 },
                }),
                new Paragraph({
                    text: "Цель: Оценить будущую государственную пенсию и рассчитать необходимый капитал, чтобы покрыть разницу между желаемой пенсией и государственной.",
                    italics: true,
                    spacing: { after: 100 },
                }),
                new Paragraph({ text: "Алгоритм:", bold: true }),
                new Paragraph({ text: "1. Расчет возраста выхода на пенсию:", bullet: { level: 0 } }),
                new Paragraph({ text: "Мужчины: 65 лет.", bullet: { level: 1 } }),
                new Paragraph({ text: "Женщины: 60 лет.", bullet: { level: 1 } }),
                new Paragraph({ text: "Определяется срок до пенсии (YearsToPension).", bullet: { level: 1 } }),
                new Paragraph({ text: "2. Оценка пенсионных баллов (ИПК):", bullet: { level: 0 } }),
                new Paragraph({ text: "Накопленные баллы: Берутся из данных клиента или оцениваются приближенно.", bullet: { level: 1 } }),
                new Paragraph({ text: "Будущие баллы: Рассчитываются исходя из текущей зарплаты клиента.", bullet: { level: 1 } }),
                new Paragraph({ text: "Формула балла за год: (ГодовойДоход / ПредельнаяБаза) * 10.", bullet: { level: 1 } }),
                new Paragraph({ text: "3. Расчет размера пенсии:", bullet: { level: 0 } }),
                new Paragraph({ text: "Пенсия = (СуммаБаллов * СтоимостьБалла) + ФиксированнаяВыплата.", bullet: { level: 1 } }),
                new Paragraph({ text: "Стоимость балла и фиксированная выплата индексируются на инфляцию.", bullet: { level: 1 } }),
                new Paragraph({ text: "4. Сравнение с желаемым доходом:", bullet: { level: 0 } }),
                new Paragraph({ text: "Пользователь указывает желаемую пенсию (в текущих ценах). Она приводится к будущей стоимости через инфляцию.", bullet: { level: 1 } }),
                new Paragraph({ text: "Считается Дефицит (PensionGap): Желаемая - Государственная.", bullet: { level: 1 } }),
                new Paragraph({ text: "5. Покрытие дефицита:", bullet: { level: 0 } }),
                new Paragraph({ text: "Если Дефицит > 0, запускается логика Пассивного дохода (см. п. 3.2).", bullet: { level: 1 } }),

                // 3.2 Passive Income
                new Paragraph({
                    text: "3.2. Пассивный доход / Рантье (Passive Income)",
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 100, after: 50 },
                }),
                new Paragraph({
                    text: "Цель: Рассчитать, какой капитал нужно накопить к концу срока, чтобы жить на проценты (ренту) в размере желаемой суммы.",
                    italics: true,
                    spacing: { after: 100 },
                }),
                new Paragraph({ text: "Алгоритм:", bold: true }),
                new Paragraph({ text: "1. Желаемый доход: Индексируется на уровень инфляции к концу срока накопления.", bullet: { level: 0 } }),
                new Paragraph({ text: "2. Расчет целевого капитала (Required Capital):", bullet: { level: 0 } }),
                new Paragraph({ text: "Используется ставка доходности на этапе выплат (Payout Yield).", bullet: { level: 1 } }),
                new Paragraph({ text: "ЦелевойКапитал = (ЕжемесячныйДоход * 12) / СтавкаВыплат.", bullet: { level: 1 } }),
                new Paragraph({ text: "3. Расчет взносов (Накопительный этап):", bullet: { level: 0 } }),
                new Paragraph({ text: "Определяется текущий стартовый капитал и его будущая стоимость.", bullet: { level: 1 } }),
                new Paragraph({ text: "Капитальный разрыв (Gap) = ЦелевойКапитал - БудущаяСтоимостьСтартового.", bullet: { level: 1 } }),
                new Paragraph({ text: "Рассчитывается необходимый ежемесячный взнос (RecommendedReplenishment).", bullet: { level: 1 } }),
                new Paragraph({ text: "4. Учет ПДС:", bullet: { level: 0 } }),
                new Paragraph({ text: "Покрывается (уменьшается) часть необходимого взноса за счет государственного софинансирования.", bullet: { level: 1 } }),

                // 3.3 Investment
                new Paragraph({
                    text: "3.3. Инвестиции / Накопление (Investment)",
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 100, after: 50 },
                }),
                new Paragraph({
                    text: "Цель: Узнать, сколько денег накопится при заданных стартовых вложениях и ежемесячных пополнениях (Проекция).",
                    italics: true,
                    spacing: { after: 100 },
                }),
                new Paragraph({ text: "Алгоритм:", bold: true }),
                new Paragraph({ text: "1. Вводные: Стартовая сумма, Ежемесячное пополнение, Срок, Портфель.", bullet: { level: 0 } }),
                new Paragraph({ text: "2. Моделирование потока (Cashflow):", bullet: { level: 0 } }),
                new Paragraph({ text: "Для каждого месяца начисляется доход на остаток (сложный процент).", bullet: { level: 1 } }),
                new Paragraph({ text: "Добавляется ежемесячный взнос (индексируемый).", bullet: { level: 1 } }),
                new Paragraph({ text: "В августе каждого года добавляется бонус от государства (ПДС), если выполнены условия.", bullet: { level: 1 } }),
                new Paragraph({ text: "3. Результат: Итоговая сумма накоплений, собственные вложения, инвест. доход, сумма господдержки.", bullet: { level: 0 } }),

                // 3.4 House
                new Paragraph({
                    text: "3.4. Целевая покупка / Недвижимость (Other / House)",
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 100, after: 50 },
                }),
                new Paragraph({
                    text: "Цель: Накопить конкретную сумму (например, 10 млн руб.) к определенной дате.",
                    italics: true,
                    spacing: { after: 100 },
                }),
                new Paragraph({ text: "Алгоритм:", bold: true }),
                new Paragraph({ text: "1. Целевая сумма: Пересчитывается в будущие цены с учетом инфляции.", bullet: { level: 0 } }),
                new Paragraph({ text: "2. Оценка имеющихся средств: Стартовый капитал инвестируется в портфель до конца срока.", bullet: { level: 0 } }),
                new Paragraph({ text: "3. Расчет дефицита: НедостающаяСумма = TargetAmountFuture - FV_Initial.", bullet: { level: 0 } }),
                new Paragraph({ text: "4. Расчет взноса: Подбирается ежемесячный платеж для покрытия дефицита.", bullet: { level: 0 } }),
                new Paragraph({ text: "5. ПДС: Софинансирование ПДС снижает расчетный ежемесячный платеж.", bullet: { level: 0 } }),

                // --- Table ---
                new Paragraph({
                    text: "Сводная таблица отличий",
                    heading: HeadingLevel.HEADING_2,
                    spacing: { before: 200, after: 100 },
                }),
                new Table({
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({ children: [new Paragraph({ text: "Тип цели", bold: true })] }),
                                new TableCell({ children: [new Paragraph({ text: "Что задается (Вход)", bold: true })] }),
                                new TableCell({ children: [new Paragraph({ text: "Что считается (Результат)", bold: true })] }),
                                new TableCell({ children: [new Paragraph({ text: "Роль инфляции", bold: true })] }),
                            ],
                        }),
                        new TableRow({
                            children: [
                                new TableCell({ children: [new Paragraph("Госпенсия")] }),
                                new TableCell({ children: [new Paragraph("Зарплата, Возраст, Желаемая пенсия")] }),
                                new TableCell({ children: [new Paragraph("Прогноз госпенсии, Дефицит, Необходимый капитал")] }),
                                new TableCell({ children: [new Paragraph("Индексирует пенсию и желание")] }),
                            ],
                        }),
                        new TableRow({
                            children: [
                                new TableCell({ children: [new Paragraph("Пассивный доход")] }),
                                new TableCell({ children: [new Paragraph("Желаемый доход в месяц")] }),
                                new TableCell({ children: [new Paragraph("Необходимый капитал (тело), Ежемесячный взнос")] }),
                                new TableCell({ children: [new Paragraph("Увеличивает желаемый доход и тело капитала")] }),
                            ],
                        }),
                        new TableRow({
                            children: [
                                new TableCell({ children: [new Paragraph("Инвестиции")] }),
                                new TableCell({ children: [new Paragraph("Взнос, Стартовая сумма")] }),
                                new TableCell({ children: [new Paragraph("Итоговая сумма накоплений (Проекция)")] }),
                                new TableCell({ children: [new Paragraph("Индексирует взносы")] }),
                            ],
                        }),
                        new TableRow({
                            children: [
                                new TableCell({ children: [new Paragraph("Покупка (Дом)")] }),
                                new TableCell({ children: [new Paragraph("Стоимость цели (Target)")] }),
                                new TableCell({ children: [new Paragraph("Ежемесячный взнос для достижения цели")] }),
                                new TableCell({ children: [new Paragraph("Увеличивает стоимость цели")] }),
                            ],
                        }),
                    ],
                    width: { size: 100, type: WidthType.PERCENTAGE },
                }),
            ],
        }],
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync("LOGIC_DESCRIPTION.docx", buffer);
    console.log("Document created successfully");
};

generateDoc();
