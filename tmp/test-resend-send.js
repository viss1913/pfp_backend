const { Resend } = require('resend');
const key = process.env.RESEND_API_KEY;
if (!key) {
    console.error('no RESEND_API_KEY');
    process.exit(1);
}
const resend = new Resend(key);
const to = process.argv[2] || 'vissarovav@gmail.com';
resend.emails
    .send({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@bank-future.com',
        to,
        subject: 'PFP Immers smoke',
        html: '<p>test</p>',
    })
    .then(({ data, error }) => {
        if (error) {
            console.error('resend error', JSON.stringify(error));
            process.exit(1);
        }
        console.log('ok', data?.id);
        process.exit(0);
    })
    .catch((e) => {
        console.error('catch', e.message);
        process.exit(1);
    });
