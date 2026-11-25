(() => {
  const $ = (id) => document.getElementById(id);
  const PROVIDERS = [
    { id: 'cloudflare', name: 'Cloudflare', ips: ['1.1.1.1', '1.0.0.1'], doh: 'https://cloudflare-dns.com/dns-query', tag: 'tag_fast' },
    { id: 'cloudflare-family', name: 'Cloudflare Family', ips: ['1.1.1.3', '1.0.0.3'], doh: 'https://family.cloudflare-dns.com/dns-query', tag: 'tag_family' },
    { id: 'google', name: 'Google', ips: ['8.8.8.8', '8.8.4.4'], doh: 'https://dns.google/dns-query', tag: 'tag_reliable' },
    { id: 'quad9', name: 'Quad9', ips: ['9.9.9.9', '149.112.112.112'], doh: 'https://dns.quad9.net/dns-query', tag: 'tag_secure' },
    { id: 'adguard', name: 'AdGuard', ips: ['94.140.14.14', '94.140.15.15'], doh: 'https://dns.adguard-dns.com/dns-query', tag: 'tag_ads' },
    { id: 'opendns', name: 'OpenDNS', ips: ['208.67.222.222', '208.67.220.220'], doh: 'https://doh.opendns.com/dns-query', tag: 'tag_filter' }
  ];

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  let lang = store.get('jx.lang', 'en');
  let theme = store.get('jx.theme', 'dark');
  let profiles = store.get('jx.profiles', []);
  let selectedProv = null;
  let adapters = [];
  const latencies = {};

  const t = (k) => (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k;

  /* ---------- language & theme ---------- */
  function applyLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
    document.querySelectorAll('[data-i18n-title]').forEach((el) => (el.title = t(el.dataset.i18nTitle)));
    $('lang').value = lang;
    renderProviders();
    renderProfiles();
    refreshCurrent();
  }
  function applyTheme() {
    document.documentElement.dataset.theme = theme;
    $('themeLight').classList.toggle('on', theme === 'light');
    $('themeDark').classList.toggle('on', theme === 'dark');
  }

  /* ---------- log ---------- */
  function log(msg, type = '') {
    const row = document.createElement('div');
    const time = new Date().toLocaleTimeString([], { hour12: false });
    row.innerHTML = `<span class="t">${time}</span>`;
    const text = document.createElement('span');
    text.className = type;
    text.textContent = msg;
    row.appendChild(text);
    $('log').appendChild(row);
    $('log').scrollTop = $('log').scrollHeight;
  }

  /* ---------- providers ---------- */
  function renderProviders() {
    const box = $('providers');
    box.innerHTML = '';
    PROVIDERS.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'prov' + (selectedProv === p.id ? ' sel' : '');
      const ms = latencies[p.id];
      const pct = ms == null ? 0 : Math.max(8, Math.min(100, 110 - ms * 0.5));
      b.innerHTML = `<b></b><code></code><small></small><div class="meter"><div class="bar"><i></i></div><span class="ms"></span></div>`;
      b.querySelector('b').textContent = p.name;
      b.querySelector('code').textContent = p.ips.join(' · ');
      b.querySelector('small').textContent = t(p.tag);
      b.querySelector('i').style.width = pct + '%';
      b.querySelector('.ms').textContent = ms === undefined ? '' : ms === null ? t('timeout') : ms + ' ms';
      b.addEventListener('click', () => selectProvider(p.id));
      box.appendChild(b);
    });
  }
  function selectProvider(id) {
    selectedProv = id;
    const p = PROVIDERS.find((x) => x.id === id);
    $('dns1').value = p.ips[0];
    $('dns2').value = p.ips[1] || '';
    $('dohUrl').value = p.doh;
    renderProviders();
  }

  /* ---------- profiles ---------- */
  function renderProfiles() {
    const box = $('profiles');
    box.innerHTML = '';
    if (!profiles.length) {
      const n = document.createElement('span');
      n.className = 'none';
      n.textContent = t('noProfiles');
      box.appendChild(n);
      return;
    }
    profiles.forEach((p, i) => {
      const c = document.createElement('span');
      c.className = 'chip';
      const use = document.createElement('button');
      use.textContent = p.name;
      use.addEventListener('click', () => {
        selectedProv = null;
        $('dns1').value = p.dns1; $('dns2').value = p.dns2; $('dohUrl').value = p.doh || '';
        $('useDoh').checked = !!p.useDoh; syncDoh(); renderProviders();
      });
      const x = document.createElement('button');
      x.className = 'x'; x.textContent = '✕'; x.title = t('del');
      x.addEventListener('click', () => {
        profiles.splice(i, 1); store.set('jx.profiles', profiles); renderProfiles(); log(t('deleted'));
      });
      c.append(use, x);
      box.appendChild(c);
    });
  }
  function saveProfile() {
    const name = $('profileName').value.trim();
    const dns1 = $('dns1').value.trim();
    if (!dns1) return log(t('needPrimary'), 'err');
    if (!name) return $('profileName').focus();
    profiles = profiles.filter((p) => p.name !== name);
    profiles.push({ name, dns1, dns2: $('dns2').value.trim(), doh: $('dohUrl').value.trim(), useDoh: $('useDoh').checked });
    store.set('jx.profiles', profiles);
    $('profileName').value = '';
    renderProfiles();
    log(`${t('saved')}: ${name}`, 'ok');
  }
  function syncDoh() { $('dohWrap').classList.toggle('off', !$('useDoh').checked); }

  /* ---------- adapters / current DNS ---------- */
  const idx = () => { const v = parseInt($('adapter').value, 10); return Number.isFinite(v) ? v : null; };

  async function loadAdapters() {
    adapters = await jx.adapters();
    const sel = $('adapter');
    sel.innerHTML = '';
    adapters.forEach((a) => {
      const o = document.createElement('option');
      o.value = a.index; o.textContent = a.name;
      sel.appendChild(o);
    });
    if (!adapters.length) log(t('noAdapters'), 'err');
    refreshCurrent();
  }
  async function refreshCurrent() {
    const i = idx();
    const chips = $('currentDns');
    const name = $('currentName');
    chips.innerHTML = '';
    if (i === null) { name.textContent = ''; return; }
    const list = await jx.getDns(i);
    if (!list.length) {
      const s = document.createElement('span'); s.textContent = t('auto'); chips.appendChild(s);
      name.textContent = t('auto');
      return;
    }
    list.forEach((ip) => { const s = document.createElement('span'); s.textContent = ip; chips.appendChild(s); });
    const match = PROVIDERS.find((p) => list.includes(p.ips[0]));
    name.textContent = match ? match.name : t('custom_label');
  }

  /* ---------- actions ---------- */
  async function apply() {
    const i = idx();
    if (i === null) return log(t('selectAdapter'), 'err');
    const d1 = $('dns1').value.trim(), d2 = $('dns2').value.trim();
    if (!d1) return log(t('needPrimary'), 'err');
    const useDoh = $('useDoh').checked;
    const r = await jx.setDns({ index: i, servers: [d1, d2], doh: useDoh ? $('dohUrl').value.trim() : '' });
    if (r.ok) log(`${t('applied')} ${[d1, d2].filter(Boolean).join(', ')}${useDoh ? ' (DoH)' : ''}`, 'ok');
    else log(`${t('failed')}: ${r.out}`, 'err');
    refreshCurrent();
  }
  async function reset() {
    const i = idx();
    if (i === null) return log(t('selectAdapter'), 'err');
    const r = await jx.resetDns(i);
    log(r.ok ? t('resetDone') : `${t('failed')}: ${r.out}`, r.ok ? 'ok' : 'err');
    refreshCurrent();
  }
  async function flush() {
    const r = await jx.flushDns();
    log(r.ok ? t('flushed') : `${t('failed')}: ${r.out}`, r.ok ? 'ok' : 'err');
  }
  async function testSpeed() {
    $('btnTest').disabled = true; $('btnFastest').disabled = true;
    log(t('testing'));
    await Promise.all(PROVIDERS.map(async (p) => { latencies[p.id] = await jx.ping(p.ips[0]); renderProviders(); }));
    const ok = PROVIDERS.filter((p) => latencies[p.id] != null).sort((a, b) => latencies[a.id] - latencies[b.id]);
    ok.forEach((p) => log(`${p.name.padEnd(18)} ${latencies[p.id]} ms`));
    $('btnTest').disabled = false;
    $('btnFastest').disabled = !ok.length;
    if (ok.length) log(`${t('fastest')}: ${ok[0].name}`, 'ok');
  }
  function useFastest() {
    const ok = PROVIDERS.filter((p) => latencies[p.id] != null).sort((a, b) => latencies[a.id] - latencies[b.id]);
    if (ok.length) selectProvider(ok[0].id);
  }

  /* ---------- init ---------- */
  $('lang').addEventListener('change', (e) => { lang = e.target.value; store.set('jx.lang', lang); applyLang(); });
  document.querySelectorAll('[data-theme-set]').forEach((b) =>
    b.addEventListener('click', () => { theme = b.dataset.themeSet; store.set('jx.theme', theme); applyTheme(); })
  );
  $('adapter').addEventListener('change', refreshCurrent);
  $('btnApply').addEventListener('click', apply);
  $('btnReset').addEventListener('click', reset);
  $('btnFlush').addEventListener('click', flush);
  $('btnTest').addEventListener('click', testSpeed);
  $('btnFastest').addEventListener('click', useFastest);
  $('btnSave').addEventListener('click', saveProfile);
  $('useDoh').addEventListener('change', syncDoh);
  ['dns1', 'dns2'].forEach((id) => $(id).addEventListener('input', () => { selectedProv = null; renderProviders(); }));
  $('btnMin').addEventListener('click', () => jx.win('min'));
  $('btnMax').addEventListener('click', () => jx.win('max'));
  $('btnClose').addEventListener('click', () => jx.win('close'));

  applyTheme();
  syncDoh();
  applyLang();
  selectProvider('cloudflare');
  loadAdapters();
  jx.isAdmin().then((ok) => { $('adminBanner').hidden = ok; });
})();
