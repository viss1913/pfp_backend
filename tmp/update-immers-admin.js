const bcrypt = require('bcryptjs');
const { execSync } = require('child_process');

const email = 'vissarovav@bank-future.com';
const password = process.argv[2];
const name = 'Alexander Vissarov';

if (!password) {
  console.error('Usage: node update-immers-admin.js <password>');
  process.exit(1);
}

(async () => {
  const hash = await bcrypt.hash(password, 10);
  const sql = `UPDATE users SET email='${email}', password_hash='${hash}', name='${name.replace(/'/g, "''")}' WHERE id=1`;
  execSync(
    `mysql -hmysql -upfp -ppfp_app_2026_secure pfp -e ${JSON.stringify(sql)}`,
    { stdio: 'inherit' }
  );
  console.log('OK', email);
})();
