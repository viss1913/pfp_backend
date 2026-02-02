const https = require('https');
const fs = require('fs');
const path = require('path');

const fontUrl = 'https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Regular.ttf';
const dest = path.join(__dirname, '../assets/fonts/Roboto-Regular.ttf');

const dir = path.dirname(dest);
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

console.log(`📥 Downloading font from: ${fontUrl}`);
console.log(`📂 Destination: ${dest}`);

const file = fs.createWriteStream(dest);
https.get(fontUrl, (response) => {
    if (response.statusCode !== 200) {
        console.error(`❌ Failed to download: ${response.statusCode} ${response.statusMessage}`);
        process.exit(1);
    }
    response.pipe(file);
    file.on('finish', () => {
        file.close();
        console.log('✅ Font downloaded successfully!');
        process.exit(0);
    });
}).on('error', (err) => {
    fs.unlink(dest, () => { });
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
});
