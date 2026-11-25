const { app, BrowserWindow, ipcMain } = require('electron');
const { execFile } = require('child_process');
const net = require('net');
const path = require('path');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1040,
    height: 700,
    minWidth: 900,
    minHeight: 620,
    frame: false,
    backgroundColor: '#04070f',
    title: 'JX',
    icon: path.join(__dirname, 'assets', 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

/* ---------- helpers ---------- */
function ps(command) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { windowsHide: true, timeout: 30000 },
      (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout || ''}${stderr || ''}`.trim() })
    );
  });
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^(?=.*:)[0-9a-fA-F:]{2,39}$/;
const DOH = /^https:\/\/[A-Za-z0-9.-]+(:\d{1,5})?(\/[A-Za-z0-9._~\-\/]*)?$/;
const validIp = (s) => typeof s === 'string' && (IPV4.test(s) || IPV6.test(s));
const validIndex = (n) => Number.isInteger(n) && n > 0 && n < 100000;

/* ---------- IPC ---------- */
ipcMain.handle('is-admin', () =>
  new Promise((resolve) => execFile('net', ['session'], { windowsHide: true }, (err) => resolve(!err)))
);

ipcMain.handle('adapters', async () => {
  const r = await ps(
    "Get-NetAdapter | Where-Object {$_.Status -eq 'Up'} | Select-Object Name,InterfaceIndex | ConvertTo-Json -Compress"
  );
  if (!r.ok || !r.out) return [];
  try {
    const d = JSON.parse(r.out);
    return (Array.isArray(d) ? d : [d]).map((x) => ({ name: x.Name, index: x.InterfaceIndex }));
  } catch {
    return [];
  }
});

ipcMain.handle('get-dns', async (_e, index) => {
  if (!validIndex(index)) return [];
  const r = await ps(
    `(Get-DnsClientServerAddress -InterfaceIndex ${index}).ServerAddresses -join ','`
  );
  return r.ok && r.out ? r.out.split(',').filter(Boolean) : [];
});

ipcMain.handle('set-dns', async (_e, { index, servers, doh }) => {
  if (!validIndex(index)) return { ok: false, out: 'Invalid adapter' };
  const list = (servers || []).filter(Boolean);
  if (!list.length || !list.every(validIp)) return { ok: false, out: 'Invalid DNS address' };
  if (doh && !DOH.test(doh)) return { ok: false, out: 'Invalid DoH URL' };

  const arr = list.map((s) => `'${s}'`).join(',');
  const r = await ps(`Set-DnsClientServerAddress -InterfaceIndex ${index} -ServerAddresses ${arr}`);
  if (!r.ok) return r;

  let dohNote = '';
  if (doh) {
    for (const s of list) {
      await ps(
        `Add-DnsClientDohServerAddress -ServerAddress '${s}' -DohTemplate '${doh}' ` +
          `-AllowFallbackToUdp $false -AutoUpgrade $true -ErrorAction SilentlyContinue`
      );
    }
    dohNote = 'DoH';
  }
  await ps('Clear-DnsClientCache');
  return { ok: true, out: dohNote };
});

ipcMain.handle('reset-dns', async (_e, index) => {
  if (!validIndex(index)) return { ok: false, out: 'Invalid adapter' };
  const r = await ps(`Set-DnsClientServerAddress -InterfaceIndex ${index} -ResetServerAddresses`);
  if (r.ok) await ps('Clear-DnsClientCache');
  return r;
});

ipcMain.handle('flush-dns', () => ps('Clear-DnsClientCache'));

ipcMain.handle('ping', (_e, ip) => {
  if (!validIp(ip)) return null;
  const once = () =>
    new Promise((resolve) => {
      const t = process.hrtime.bigint();
      const s = net.connect({ host: ip, port: 53, timeout: 2000 });
      s.once('connect', () => {
        s.destroy();
        resolve(Number(process.hrtime.bigint() - t) / 1e6);
      });
      s.once('timeout', () => { s.destroy(); resolve(null); });
      s.once('error', () => resolve(null));
    });
  return (async () => {
    const times = [];
    for (let i = 0; i < 3; i++) {
      const v = await once();
      if (v !== null) times.push(v);
    }
    return times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  })();
});

ipcMain.on('win', (_e, action) => {
  if (!win) return;
  if (action === 'min') win.minimize();
  if (action === 'max') (win.isMaximized() ? win.unmaximize() : win.maximize());
  if (action === 'close') win.close();
});
