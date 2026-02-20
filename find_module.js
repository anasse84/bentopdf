
import fs from 'fs';
const path = 'c:\\Users\\HP\\Desktop\\Apps\\bentopdf\\public\\libreoffice-wasm\\browser.worker.global.js';
try {
    const data = fs.readFileSync(path, 'utf8');
    console.log('File length:', data.length);
    console.log('First 500 chars:', data.substring(0, 500));

    // Also search for "ENV" string
    const envIdx = data.indexOf('ENV');
    if (envIdx !== -1) {
        console.log('Found ENV at:', envIdx);
        console.log('Context:', data.substring(envIdx - 50, envIdx + 50));
    } else {
        console.log('ENV string not found.');
    }

    // Search for "mainScriptUrlOrBlob"
    const msIdx = data.indexOf('mainScriptUrlOrBlob');
    if (msIdx !== -1) {
        console.log('Found mainScriptUrlOrBlob at:', msIdx);
        console.log('Context:', data.substring(msIdx - 50, msIdx + 50));
    } else {
        console.log('mainScriptUrlOrBlob string not found.');
    }

} catch (err) {
    console.error(err);
}
