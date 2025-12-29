// Простой тест нормализации classes

const testCases = [
    {
        name: "Массив объектов",
        input: [
            { id: 2, code: "PASSIVE_INCOME", name: "Пассивный доход" },
            { id: 3, code: "INVESTMENT", name: "Инвестиции" },
            { id: 4, code: "OTHER", name: "Прочее" }
        ],
        expected: [2, 3, 4]
    },
    {
        name: "Массив чисел",
        input: [2, 3, 4],
        expected: [2, 3, 4]
    },
    {
        name: "Пустой массив",
        input: [],
        expected: []
    },
    {
        name: "null",
        input: null,
        expected: []
    },
    {
        name: "undefined",
        input: undefined,
        expected: undefined
    }
];

console.log('🧪 Тест нормализации classes\n');
console.log('='.repeat(60));

// Логика нормализации из контроллера
function normalizeClassesController(classes) {
    if (classes !== undefined && Array.isArray(classes)) {
        if (classes.length > 0 && typeof classes[0] === 'object' && classes[0] !== null) {
            return classes.map(c => typeof c === 'object' && c !== null ? c.id : c).filter(id => id !== undefined && id !== null);
        }
        return classes;
    }
    return classes;
}

// Логика нормализации из репозитория
function normalizeClassesRepository(classIds) {
    if (classIds !== undefined) {
        let normalized = Array.isArray(classIds) ? classIds : [];
        
        if (normalized.length > 0 && typeof normalized[0] === 'object' && normalized[0] !== null) {
            normalized = normalized.map(c => typeof c === 'object' && c !== null ? c.id : c).filter(id => id !== undefined && id !== null);
        }
        
        return normalized;
    }
    return undefined;
}

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
    console.log(`\n📝 Тест ${index + 1}: ${testCase.name}`);
    console.log(`   Входные данные:`, JSON.stringify(testCase.input));
    
    // Тест контроллера
    const controllerResult = normalizeClassesController(testCase.input);
    console.log(`   Контроллер:`, JSON.stringify(controllerResult));
    
    // Тест репозитория
    const repositoryResult = normalizeClassesRepository(testCase.input);
    console.log(`   Репозиторий:`, JSON.stringify(repositoryResult));
    console.log(`   Ожидается:`, JSON.stringify(testCase.expected));
    
    // Проверка результата репозитория (он должен обрабатывать все случаи)
    const result = repositoryResult !== undefined ? repositoryResult : testCase.input;
    const isMatch = JSON.stringify(result) === JSON.stringify(testCase.expected);
    
    if (isMatch || (testCase.expected === undefined && repositoryResult === undefined)) {
        console.log(`   ✅ PASS`);
        passed++;
    } else {
        console.log(`   ❌ FAIL`);
        failed++;
    }
});

console.log('\n' + '='.repeat(60));
console.log(`📊 Результаты: ${passed} прошло, ${failed} провалено`);
console.log('='.repeat(60));

if (failed === 0) {
    console.log('\n✅ Все тесты прошли успешно!');
    process.exit(0);
} else {
    console.log('\n❌ Некоторые тесты провалились!');
    process.exit(1);
}








