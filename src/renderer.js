(() => {
  const $ = (id) => document.getElementById(id);

  /* id, name, ips, doh, tag, categories, auto = non-filtering candidate for "fastest" */
  const P = (id, name, ips, doh, tag, cats, auto = false) => ({ id, name, ips, doh, tag, cats, auto });
  const PROVIDERS = [
    P('cloudflare', 'Cloudflare', ['1.1.1.1', '1.0.0.1'], 'https://cloudflare-dns.com/dns-query', 'tag_fast', ['fast', 'privacy'], true),
    P('cloudflare-security', 'Cloudflare Security', ['1.1.1.2', '1.0.0.2'], 'https://security.cloudflare-dns.com/dns-query', 'tag_secure', ['security']),
    P('cloudflare-family', 'Cloudflare Family', ['1.1.1.3', '1.0.0.3'], 'https://family.cloudflare-dns.com/dns-query', 'tag_family', ['family', 'security']),
    P('google', 'Google', ['8.8.8.8', '8.8.4.4'], 'https://dns.google/dns-query', 'tag_reliable', ['fast'], true),
    P('quad9', 'Quad9', ['9.9.9.9', '149.112.112.112'], 'https://dns.quad9.net/dns-query', 'tag_secure', ['security', 'privacy']),
    P('quad9-open', 'Quad9 Unfiltered', ['9.9.9.10', '149.112.112.10'], 'https://dns10.quad9.net/dns-query', 'tag_unfiltered', ['privacy', 'fast'], true),
    P('adguard', 'AdGuard', ['94.140.14.14', '94.140.15.15'], 'https://dns.adguard-dns.com/dns-query', 'tag_ads', ['ads']),
    P('adguard-family', 'AdGuard Family', ['94.140.14.15', '94.140.15.16'], 'https://family.adguard-dns.com/dns-query', 'tag_family', ['family', 'ads']),
    P('adguard-open', 'AdGuard Unfiltered', ['94.140.14.140', '94.140.14.141'], 'https://unfiltered.adguard-dns.com/dns-query', 'tag_unfiltered', ['privacy'], true),
    P('opendns', 'OpenDNS', ['208.67.222.222', '208.67.220.220'], 'https://doh.opendns.com/dns-query', 'tag_filter', ['security']),
    P('opendns-family', 'OpenDNS FamilyShield', ['208.67.222.123', '208.67.220.123'], 'https://doh.familyshield.opendns.com/dns-query', 'tag_family', ['family']),
    P('cleanbrowsing-family', 'CleanBrowsing Family', ['185.228.168.168', '185.228.169.168'], 'https://doh.cleanbrowsing.org/doh/family-filter/', 'tag_family', ['family']),
    P('cleanbrowsing-security', 'CleanBrowsing Security', ['185.228.168.9', '185.228.169.9'], 'https://doh.cleanbrowsing.org/doh/security-filter/', 'tag_secure', ['security']),
    P('controld', 'Control D', ['76.76.2.0', '76.76.10.0'], 'https://freedns.controld.com/p0', 'tag_privacy', ['privacy', 'fast'], true),
    P('mullvad', 'Mullvad', ['194.242.2.2'], 'https://dns.mullvad.net/dns-query', 'tag_privacy', ['privacy'], true),
    P('dnssb', 'DNS.SB', ['185.222.222.222', '45.11.45.11'], 'https://doh.sb/dns-query', 'tag_privacy', ['privacy'], true),
    P('comodo', 'Comodo Secure', ['8.26.56.26', '8.20.247.20'], '', 'tag_secure', ['security']),
    P('verisign', 'Verisign', ['64.6.64.6', '64.6.65.6'], '', 'tag_reliable', ['privacy'], true),
    P('level3', 'Level3', ['4.2.2.1', '4.2.2.2'], '', 'tag_reliable', ['fast'], true),
    P('yandex', 'Yandex Basic', ['77.88.8.8', '77.88.8.1'], '', 'tag_fast', ['fast'], true),
    P('alternate', 'Alternate DNS', ['76.76.19.19', '76.223.122.150'], '', 'tag_ads', ['ads'])
  ];
  const CATS = ['all', 'fav', 'fast', 'privacy', 'security', 'family', 'ads'];

  const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  const IPV6 = /^(?=.*:)[0-9a-fA-F:]{2,39}$/;
  const DOMAIN = /^(?=.{1,253}$)([a-z0-9_-]{1,63}\.)+[a-z]{2,63}$/;
  const isIp = (s) => IPV4.test(s) || IPV6.test(s);

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };

  let lang = store.get('jx.lang', 'en');
  let theme = store.get('jx.theme', 'dark');
  let profiles = store.get('jx.profiles', []);
  let favs = store.get('jx.favs', []);
  let settings = Object.assign({ flush: true, tray: false }, store.get('jx.settings', {}));
  let selectedProv = null;
  let filter = 'all';
  const latencies = {};

  const t = (k) => (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k;

  /* ---------- language & theme ---------- */
  function applyLang() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
    document.querySelectorAll('[data-i18n-title]').forEach((el) => (el.title = t(el.dataset.i18nTitle)));
    $('lang').value = lang;
    renderCats();
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
    const time = document.createElement('span');
    time.className = 't';
    time.textContent = new Date().toLocaleTimeString([], { hour12: false });
    const text = document.createElement('span');
    text.className = type;
    text.textContent = msg;
    row.append(time, text);
    $('log').appendChild(row);
    $('log').scrollTop = $('log').scrollHeight;
  }

  /* ---------- providers ---------- */
  function renderCats() {
    const box = $('cats');
    box.innerHTML = '';
    CATS.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'cat' + (filter === c ? ' on' : '');
      b.textContent = t('cat_' + c);
      b.addEventListener('click', () => { filter = c; renderCats(); renderProviders(); });
      box.appendChild(b);
    });
  }
  function visibleProviders() {
    const q = $('search').value.trim().toLowerCase();
    return PROVIDERS.filter((p) => {
      if (filter === 'fav' && !favs.includes(p.id)) return false;
      if (filter !== 'all' && filter !== 'fav' && !p.cats.includes(filter)) return false;
      return !q || p.name.toLowerCase().includes(q) || p.ips.some((ip) => ip.includes(q));
    }).sort((a, b) => favs.includes(b.id) - favs.includes(a.id));
  }
  function renderProviders() {
    const box = $('providers');
    box.innerHTML = '';
    const list = visibleProviders();
    if (!list.length) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = t('noMatch');
      box.appendChild(e);
      return;
    }
    list.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'prov' + (selectedProv === p.id ? ' sel' : '');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.innerHTML = '<b></b><code></code><small></small><div class="meter"><div class="bar"><i></i></div><span class="ms"></span></div>';
      const star = document.createElement('button');
      const fav = favs.includes(p.id);
      star.className = 'star' + (fav ? ' on' : '');
      star.textContent = fav ? '★' : '☆';
      star.setAttribute('aria-pressed', fav);
      star.addEventListener('click', (e) => { e.stopPropagation(); toggleFav(p.id); });
      card.prepend(star);
      const ms = latencies[p.id];
      card.querySelector('b').textContent = p.name;
      card.querySelector('code').textContent = p.ips.join(' · ');
      card.querySelector('small').textContent = t(p.tag);
      card.querySelector('i').style.width = (ms == null ? 0 : Math.max(8, Math.min(100, 110 - ms * 0.5))) + '%';
      card.querySelector('.ms').textContent = ms === undefined ? '' : ms === null ? t('timeout') : ms + ' ms';
      card.addEventListener('click', () => selectProvider(p.id));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectProvider(p.id); } });
      box.appendChild(card);
    });
  }
  function toggleFav(id) {
    favs = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    store.set('jx.favs', favs);
    renderProviders();
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
        $('dns1').value = p.dns1; $('dns2').value = p.dns2 || ''; $('dohUrl').value = p.doh || '';
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
    const name = $('profileName').value.trim().slice(0, 40);
    const dns1 = $('dns1').value.trim();
    if (!isIp(dns1)) return log(t('needPrimary'), 'err');
    if (!name) return $('profileName').focus();
    profiles = profiles.filter((p) => p.name !== name);
    profiles.push({ name, dns1, dns2: $('dns2').value.trim(), doh: $('dohUrl').value.trim(), useDoh: $('useDoh').checked });
    store.set('jx.profiles', profiles);
    $('profileName').value = '';
    renderProfiles();
    log(`${t('saved')}: ${name}`, 'ok');
  }
  function exportProfiles() {
    const blob = new Blob([JSON.stringify({ app: 'JX', profiles }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'jx-profiles.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function importProfiles(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const list = (Array.isArray(data) ? data : data.profiles || [])
          .filter((p) => p && typeof p.name === 'string' && typeof p.dns1 === 'string' && isIp(p.dns1.trim()))
          .map((p) => ({
            name: p.name.slice(0, 40),
            dns1: p.dns1.trim(),
            dns2: typeof p.dns2 === 'string' && isIp(p.dns2.trim()) ? p.dns2.trim() : '',
            doh: typeof p.doh === 'string' && /^https:\/\//.test(p.doh) ? p.doh : '',
            useDoh: !!p.useDoh
          }));
        if (!list.length) throw new Error('empty');
        const names = new Set(list.map((p) => p.name));
        profiles = profiles.filter((p) => !names.has(p.name)).concat(list);
        store.set('jx.profiles', profiles);
        renderProfiles();
        log(`${t('imported')}: ${list.length}`, 'ok');
      } catch {
        log(t('importFail'), 'err');
      }
    };
    reader.readAsText(file);
  }
  function syncDoh() { $('dohWrap').classList.toggle('off', !$('useDoh').checked); }

  /* ---------- adapters / current DNS ---------- */
  const idx = () => { const v = parseInt($('adapter').value, 10); return Number.isFinite(v) ? v : null; };

  async function loadAdapters() {
    const adapters = await jx.adapters();
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
  async function rememberPrevious(i) {
    store.set('jx.prev.' + i, await jx.getDns(i));
  }
  async function apply() {
    const i = idx();
    if (i === null) return log(t('selectAdapter'), 'err');
    const d1 = $('dns1').value.trim(), d2 = $('dns2').value.trim();
    if (!isIp(d1) || (d2 && !isIp(d2))) return log(t('needPrimary'), 'err');
    let doh = '';
    if ($('useDoh').checked) {
      doh = $('dohUrl').value.trim();
      if (!doh) log(t('noDoh'));
    }
    await rememberPrevious(i);
    const r = await jx.setDns({ index: i, servers: [d1, d2], doh, flush: settings.flush });
    if (r.ok) log(`${t('applied')} ${[d1, d2].filter(Boolean).join(', ')}${doh ? ' (DoH)' : ''}`, 'ok');
    else log(`${t('failed')}: ${r.out}`, 'err');
    refreshCurrent();
  }
  async function reset() {
    const i = idx();
    if (i === null) return log(t('selectAdapter'), 'err');
    await rememberPrevious(i);
    const r = await jx.resetDns(i);
    log(r.ok ? t('resetDone') : `${t('failed')}: ${r.out}`, r.ok ? 'ok' : 'err');
    refreshCurrent();
  }
  async function undo() {
    const i = idx();
    if (i === null) return log(t('selectAdapter'), 'err');
    const prev = store.get('jx.prev.' + i, null);
    if (prev === null) return log(t('noUndo'));
    const now = await jx.getDns(i);
    const r = prev.length
      ? await jx.setDns({ index: i, servers: prev.slice(0, 4), doh: '', flush: settings.flush })
      : await jx.resetDns(i);
    if (r.ok) { store.set('jx.prev.' + i, now); log(t('undoDone'), 'ok'); }
    else log(`${t('failed')}: ${r.out}`, 'err');
    refreshCurrent();
  }
  async function flush() {
    const r = await jx.flushDns();
    log(r.ok ? t('flushed') : `${t('failed')}: ${r.out}`, r.ok ? 'ok' : 'err');
  }
  const rank = () => PROVIDERS.filter((p) => p.auto && latencies[p.id] != null).sort((a, b) => latencies[a.id] - latencies[b.id]);

  async function testSpeed() {
    $('btnTest').disabled = true; $('btnFastest').disabled = true; $('btnAuto').disabled = true;
    log(t('testing'));
    await Promise.all(PROVIDERS.map(async (p) => { latencies[p.id] = await jx.ping(p.ips[0]); }));
    renderProviders();
    const all = PROVIDERS.filter((p) => latencies[p.id] != null).sort((a, b) => latencies[a.id] - latencies[b.id]);
    all.slice(0, 8).forEach((p) => log(`${p.name.padEnd(24)} ${latencies[p.id]} ms`));
    const best = rank();
    $('btnTest').disabled = false; $('btnAuto').disabled = false;
    $('btnFastest').disabled = !best.length;
    if (best.length) log(`${t('fastest')}: ${best[0].name}`, 'ok');
    return best;
  }
  function useFastest() { const b = rank(); if (b.length) selectProvider(b[0].id); }
  async function autoBest() {
    const best = await testSpeed();
    if (!best.length) return;
    selectProvider(best[0].id);
    await apply();
  }

  async function doLookup() {
    const domain = $('domain').value.trim().toLowerCase();
    if (!DOMAIN.test(domain)) return log(t('invalidDomain'), 'err');
    const useSel = $('lookupVia').value === 'selected';
    const server = useSel ? $('dns1').value.trim() : '';
    if (useSel && !isIp(server)) return log(t('needPrimary'), 'err');
    $('lookupOut').textContent = t('resolving');
    $('btnLookup').disabled = true;
    const r = await jx.lookup({ domain, server });
    $('btnLookup').disabled = false;
    if (r.ok) {
      const txt = r.ips.length ? r.ips.join(', ') : t('noResult');
      $('lookupOut').textContent = `${txt} · ${r.ms} ms`;
      log(`${domain} → ${txt} (${r.ms} ms)${server ? ' @' + server : ''}`, 'ok');
    } else {
      $('lookupOut').textContent = '';
      log(`${t('failed')}: ${domain} - ${r.out}`, 'err');
    }
  }

  /* ---------- init ---------- */
  $('lang').addEventListener('change', (e) => { lang = e.target.value; store.set('jx.lang', lang); applyLang(); });
  document.querySelectorAll('[data-theme-set]').forEach((b) =>
    b.addEventListener('click', () => { theme = b.dataset.themeSet; store.set('jx.theme', theme); applyTheme(); })
  );
  $('adapter').addEventListener('change', refreshCurrent);
  $('btnApply').addEventListener('click', apply);
  $('btnReset').addEventListener('click', reset);
  $('btnUndo').addEventListener('click', undo);
  $('btnFlush').addEventListener('click', flush);
  $('btnAuto').addEventListener('click', autoBest);
  $('btnTest').addEventListener('click', testSpeed);
  $('btnFastest').addEventListener('click', useFastest);
  $('btnSave').addEventListener('click', saveProfile);
  $('btnExport').addEventListener('click', exportProfiles);
  $('btnImport').addEventListener('click', () => $('fileImport').click());
  $('fileImport').addEventListener('change', (e) => { if (e.target.files[0]) importProfiles(e.target.files[0]); e.target.value = ''; });
  $('btnLookup').addEventListener('click', doLookup);
  $('domain').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLookup(); });
  $('btnClearLog').addEventListener('click', () => ($('log').innerHTML = ''));
  $('search').addEventListener('input', renderProviders);
  $('useDoh').addEventListener('change', syncDoh);
  ['dns1', 'dns2'].forEach((id) => $(id).addEventListener('input', () => { selectedProv = null; renderProviders(); }));
  $('setFlush').checked = !!settings.flush;
  $('setTray').checked = !!settings.tray;
  const saveSettings = () => {
    settings = { flush: $('setFlush').checked, tray: $('setTray').checked };
    store.set('jx.settings', settings);
    jx.settings(settings);
  };
  $('setFlush').addEventListener('change', saveSettings);
  $('setTray').addEventListener('change', saveSettings);
  $('btnMin').addEventListener('click', () => jx.win('min'));
  $('btnMax').addEventListener('click', () => jx.win('max'));
  $('btnClose').addEventListener('click', () => jx.win('close'));

  applyTheme();
  syncDoh();
  applyLang();
  selectProvider('cloudflare');
  jx.settings(settings);
  loadAdapters();
  jx.isAdmin().then((ok) => { $('adminBanner').hidden = ok; });
})();
