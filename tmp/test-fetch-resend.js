async function main() {
    try {
        const r = await fetch('https://api.resend.com');
        console.log('resend HTTP', r.status);
    } catch (e) {
        console.error('resend FAIL', e.cause?.code || e.cause?.message || e.message);
    }
    try {
        const r2 = await fetch('https://www.cbr.ru');
        console.log('cbr HTTP', r2.status);
    } catch (e) {
        console.error('cbr FAIL', e.cause?.code || e.cause?.message || e.message);
    }
}
main();
