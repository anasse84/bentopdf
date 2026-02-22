const fs = require('fs');
let file = 'public/libreoffice-wasm/browser.worker.global.js';
let code = fs.readFileSync(file, 'utf8');

// 1) Add reportGap utility
let profilerCode = `
self._reportGapContext = { lastT: Date.now(), lastOp: 'START' };
self._reportGap = (opName) => {
    let now = Date.now();
    let gap = now - self._reportGapContext.lastT;
    if (gap > 2000) { 
        console.warn('[CHRONO-GAP] ' + gap + 'ms gap! Happened AFTER "' + self._reportGapContext.lastOp + '" and BEFORE "' + opName + '"');
    }
    self._reportGapContext.lastT = now;
    self._reportGapContext.lastOp = opName;
};
`;

if (!code.includes('self._reportGap')) {
    code = code.replace('E = self.Module, $("filesystem", "Setting up filesystem...");', 'E = self.Module, $("filesystem", "Setting up filesystem...");' + profilerCode);
}

// 2) Hook FS
let fsHooks = `
let origOpen = E.FS.open; E.FS.open = (p, f, m) => { if(self._reportGap) self._reportGap('FS.open: '+p); return origOpen.call(E.FS, p, f, m); };
let origStat = E.FS.stat; E.FS.stat = (p) => { if(self._reportGap) self._reportGap('FS.stat: '+p); return origStat.call(E.FS, p); };
let origRead = E.FS.read; E.FS.read = (s,b,o,l,p) => { if(self._reportGap && typeof s.path === "string") self._reportGap('FS.read: '+s.path); return origRead.call(E.FS,s,b,o,l,p); };
let origWrite = E.FS.write; E.FS.write = (s,b,o,l,p) => { if(self._reportGap && typeof s.path === "string") self._reportGap('FS.write: '+s.path); return origWrite.call(E.FS,s,b,o,l,p); };
`;

if (!code.includes('origOpen = E.FS.open')) {
    code = code.replace('let s = E.FS;', fsHooks + 'let s = E.FS;');
}

// 3) Hook STDOUT/STDERR
code = code.replace(/print: function \(m\) \{([\s\S]*?)console\.log\([^)]+\)[\s\S]*?\},/, 'print: function (m) { if(self._reportGap) self._reportGap("STDOUT: "+String(m).substring(0,50)); console.log(`[' + new Date().toISOString().split('T')[1] + '] [WASM-STDOUT]`, m); },');
code = code.replace(/printErr: function \(m\) \{([\s\S]*?)console\.warn\([^)]+\)[\s\S]*?\},/, 'printErr: function (m) { if(self._reportGap) self._reportGap("STDERR: "+String(m).substring(0,50)); console.warn(`[' + new Date().toISOString().split('T')[1] + '] [WASM-STDERR]`, m); },');

// 4) Disable Fontconfig
let fcDisable = `
try { E.FS.mkdir('/tmp/nowhere'); E.FS.writeFile('/tmp/dummy-fonts.conf', '<?xml version="1.0"?><fontconfig><dir>/tmp/nowhere</dir></fontconfig>'); } catch(e){}
`;
if (!code.includes('/tmp/nowhere')) {
    code = code.replace('let s = E.FS;', fcDisable + 'let s = E.FS;');
}

if (!code.includes('FONTCONFIG_FILE')) {
    code = code.replace('SAL_NO_DECODER_FALLBACK = "1",', 'SAL_NO_DECODER_FALLBACK = "1", i.ENV.FONTCONFIG_FILE = "/tmp/dummy-fonts.conf",');
}

fs.writeFileSync(file, code);
console.log('Patch success!');
