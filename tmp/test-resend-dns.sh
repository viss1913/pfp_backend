#!/bin/sh
set -e
echo "=== DNS ==="
getent hosts api.resend.com || echo "FAIL api.resend.com"
getent hosts www.cbr.ru || echo "FAIL cbr"
echo "=== fetch ==="
node -e "fetch('https://api.resend.com').then(r=>console.log('resend status',r.status)).catch(e=>console.error('resend err',e.message))"
node -e "fetch('https://www.cbr.ru').then(r=>console.log('cbr status',r.status)).catch(e=>console.error('cbr err',e.message))"
