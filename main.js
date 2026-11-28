const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const { execFile } = require('child_process');
const net = require('net');
const path = require('path');

let win, tray = null, quitting = false;
const settings = { tray: false };

function createWindow() {
  win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 440,
    minHeight: 480,
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
  win.on('close', (e) => {
    if (settings.tray && !quitting) {
      e.preventDefault();
      ensureTray();
      win.hide();
    }
  });
}

function showWin() { if (win) { win.show(); win.focus(); } }
function ensureTray() {
  if (tray) return;
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'logo.png')).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('JX');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show JX', click: showWin },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('click', showWin);
}

app.whenReady().then(createWindow);
app.on('before-quit', () => { quitting = true; });
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
const DOMAIN = /^(?=.{1,253}$)([A-Za-z0-9_-]{1,63}\.)+[A-Za-z]{2,63}$/;
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
  const r = await ps(`(Get-DnsClientServerAddress -InterfaceIndex ${index}).ServerAddresses -join ','`);
  return r.ok && r.out ? r.out.split(',').filter(Boolean) : [];
});

ipcMain.handle('set-dns', async (_e, { index, servers, doh, flush }) => {
  if (!validIndex(index)) return { ok: false, out: 'Invalid adapter' };
  const list = (servers || []).filter(Boolean);
  if (!list.length || !list.every(validIp)) return { ok: false, out: 'Invalid DNS address' };
  if (doh && !DOH.test(doh)) return { ok: false, out: 'Invalid DoH URL' };

  const arr = list.map((s) => `'${s}'`).join(',');
  const r = await ps(`Set-DnsClientServerAddress -InterfaceIndex ${index} -ServerAddresses ${arr}`);
  if (!r.ok) return r;

  if (doh) {
    for (const s of list) {
      await ps(
        `Add-DnsClientDohServerAddress -ServerAddress '${s}' -DohTemplate '${doh}' ` +
          `-AllowFallbackToUdp $false -AutoUpgrade $true -ErrorAction SilentlyContinue`
      );
    }
  }
  if (flush !== false) await ps('Clear-DnsClientCache');
  return { ok: true, out: '' };
});

ipcMain.handle('reset-dns', async (_e, index) => {
  if (!validIndex(index)) return { ok: false, out: 'Invalid adapter' };
  const r = await ps(`Set-DnsClientServerAddress -InterfaceIndex ${index} -ResetServerAddresses`);
  if (r.ok) await ps('Clear-DnsClientCache');
  return r;
});

ipcMain.handle('flush-dns', () => ps('Clear-DnsClientCache'));

ipcMain.handle('lookup', async (_e, { domain, server }) => {
  if (!DOMAIN.test(domain || '')) return { ok: false, out: 'Invalid domain' };
  if (server && !validIp(server)) return { ok: false, out: 'Invalid DNS address' };
  const cmd =
    `$ErrorActionPreference='Stop'; $sw=[Diagnostics.Stopwatch]::StartNew(); ` +
    `$r=Resolve-DnsName -Name '${domain}' -Type A -DnsOnly ${server ? `-Server '${server}' ` : ''}; $sw.Stop(); ` +
    `[pscustomobject]@{ips=@($r | Where-Object {$_.IPAddress} | ForEach-Object {$_.IPAddress}); ms=[int]$sw.ElapsedMilliseconds} | ConvertTo-Json -Compress`;
  const r = await ps(cmd);
  if (!r.ok) return { ok: false, out: r.out.split('\n')[0].slice(0, 160) };
  try {
    const d = JSON.parse(r.out);
    return { ok: true, ips: [].concat(d.ips || []), ms: d.ms };
  } catch {
    return { ok: false, out: 'Parse error' };
  }
});

ipcMain.handle('ping', (_e, ip) => {
  if (!validIp(ip)) return null;
  const once = () =>
    new Promise((resolve) => {
      const t = process.hrtime.bigint();
      const s = net.connect({ host: ip, port: 53, timeout: 2000 });
      s.once('connect', () => { s.destroy(); resolve(Number(process.hrtime.bigint() - t) / 1e6); });
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

ipcMain.on('settings', (_e, s) => {
  settings.tray = !!(s && s.tray);
  if (!settings.tray && tray) { tray.destroy(); tray = null; }
});

ipcMain.on('win', (_e, action) => {
  if (!win) return;
  if (action === 'min') win.minimize();
  if (action === 'max') (win.isMaximized() ? win.unmaximize() : win.maximize());
  if (action === 'close') win.close();
});
