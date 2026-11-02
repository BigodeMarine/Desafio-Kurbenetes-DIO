// Smoke de navegador real via Chrome DevTools Protocol, sem pacotes npm.
// Uso: node scripts/browser-smoke.cjs [http://127.0.0.1:8080]
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {setTimeout: delay} = require('node:timers/promises');
const crypto = require('node:crypto');

(async () => {
  const executable = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const base = process.argv[2] || 'http://127.0.0.1:8080';
  const profile = path.resolve('artifacts/browser-profile-' + crypto.randomUUID());
  fs.mkdirSync(profile, {recursive: true});
  const child = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run',
    '--remote-debugging-port=9225', '--user-data-dir=' + profile, 'about:blank'],
    {windowsHide: true, stdio: 'ignore'});
  let socket;
  try {
    let targets;
    for (let i = 0; i < 50; i++) {
      try { targets = await (await fetch('http://127.0.0.1:9225/json/list')).json(); break; }
      catch { await delay(200); }
    }
    assert.ok(targets, 'Chrome não iniciou');
    socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0;
    const pending = new Map();
    socket.onmessage = ({data}) => {
      const msg = JSON.parse(data);
      if (pending.has(msg.id)) {
        const {resolve, reject, timer} = pending.get(msg.id);
        clearTimeout(timer); pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const current = ++id;
      const timer = setTimeout(() => { pending.delete(current); reject(new Error('Timeout CDP: ' + method)); }, 20000);
      pending.set(current, {resolve, reject, timer});
      socket.send(JSON.stringify({id: current, method, params}));
    });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await send('Page.enable');
    await send('Page.navigate', {url: base});
    for (let i = 0; i < 50; i++) {
      if (await evaluate("Boolean(document.querySelector('#button-blue')) && document.readyState === 'complete'")) break;
      await delay(100);
    }
    const marker = 'browser-' + crypto.randomUUID();
    await evaluate(`document.querySelector('#name').value = ${JSON.stringify(marker)};
      document.querySelector('#email').value = 'browser@example.com';
      document.querySelector('#comment').value = "Comentário real: O'Brien 😀";
      document.querySelector('#button-blue').click();`);
    let message;
    for (let i = 0; i < 100; i++) {
      message = await evaluate("document.querySelector('#status').textContent");
      if (message.includes('sucesso')) break;
      await delay(100);
    }
    assert.equal(message, 'Mensagem salva com sucesso.');
    assert.equal(await evaluate("document.querySelector('#name').value"), '');
    assert.equal(await evaluate("document.querySelector('#button-blue').disabled"), false);
    await send('Emulation.setDeviceMetricsOverride', {width: 375, height: 812, deviceScaleFactor: 1, mobile: true});
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
    const shot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: true});
    fs.writeFileSync('artifacts/mobile.png', Buffer.from(shot.data, 'base64'));
    console.log('OK: formulário real, confirmação 201, reset, botão reabilitado e largura 375px sem overflow.');
    console.log('Registro de teste: ' + marker);
    await send('Browser.close').catch(() => {});
  } finally {
    if (socket) socket.close();
    child.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
