/* Starfinder — a pocket telescope game.
 * Pan the sky, find made-up planets at the right hour and bearing, earn credits,
 * upgrade the instrument, complete the Planetary Index.
 */
(function () {
  'use strict';

  // ---------- Tunables ----------
  const NIGHT_START = 18;             // 18:00
  const NIGHT_END = 30;               // 06:00 next morning
  const REAL_SECONDS_PER_HOUR = 30;   // one game hour of night lasts this long at 1x
  const FOLLOW_RATE = [0, 1.5, 3, 5, 12]; // how strongly the mount follows a locked planet, by tracking level
  const ZOOMS = [1, 2, 4, 8, 16, 32];
  const BASE_FOV = 60;                // degrees across the eyepiece at 1x
  const OBS_SECONDS = 3;              // hold the planet centred this long
  const DAWN_GRANT = 60;
  const SAVE_KEY = 'starfinder-save-v1';

  const UPGRADES = {
    aperture: { name: 'Mirror', unit: 'aperture', max: 5, costs: [0, 150, 400, 900, 2000],
      desc: 'A wider mirror gathers more light and shows fainter worlds.',
      effect: l => `Sees objects of faintness ${l} and below` },
    mag: { name: 'Eyepieces', unit: 'magnification', max: 6, costs: [0, 100, 250, 600, 1200, 2500],
      desc: 'Stronger eyepieces resolve small planets into discs.',
      effect: l => `Zoom up to ×${ZOOMS[l - 1]}` },
    tracking: { name: 'Mount', unit: 'tracking', max: 4, costs: [0, 120, 350, 800],
      desc: 'A motorised mount steadies the view and cancels drift.',
      effect: l => l >= 4 ? 'Rock steady, locks on and follows' : ['', 'Shaky, follows a locked planet slowly', 'Half the shake, follows better', 'Little shake, follows well'][l] },
    camera: { name: 'Camera', unit: 'imaging', max: 4, costs: [0, 200, 500, 1200],
      desc: 'Better sensors make each observation worth more to the archive.',
      effect: l => `×${[1, 1, 1.6, 2.4, 3.5][l]} credits per observation` },
    filter: { name: 'Nebula filter', unit: 'filter', max: 2, costs: [0, 700],
      desc: 'Cuts through dust clouds that hide some planets entirely.',
      effect: l => l >= 2 ? 'Dust clouds are transparent' : 'Not fitted' },
    chart: { name: 'Star chart', unit: 'chart', max: 2, costs: [0, 500],
      desc: 'An all-sky chart in the eyepiece marking planets you know the bearing of.',
      effect: l => l >= 2 ? 'Chart available in the telescope view' : 'Not owned' }
  };
  const CAMERA_MULT = [1, 1, 1.6, 2.4, 3.5];
  const HINT_KEYS = ['time', 'direction', 'gear'];

  // ---------- State ----------
  const defaultState = () => ({
    credits: 0, night: 1, hour: NIGHT_START, speed: 1,
    viewAz: 195, viewAlt: 18, zoomIdx: 0,
    up: { aperture: 1, mag: 1, tracking: 1, camera: 1, filter: 1, chart: 1 },
    discovered: {}, observedNight: {}, obsCount: {}, hints: {},
    nightLog: [], seenComplete: false, showChart: false
  });
  let S = load();

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) { /* fresh start */ }
    return defaultState();
  }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }

  // ---------- Helpers ----------
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap180 = d => ((d + 540) % 360) - 180;
  const rad = d => d * Math.PI / 180;
  const fmtHour = h => { const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };
  const fmtCredits = n => Math.round(n).toLocaleString();
  const zoom = () => ZOOMS[S.zoomIdx];
  const fov = () => BASE_FOV / zoom();
  const bearingName = az => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((az % 360) + 360) % 360 / 45) % 8];
  const bearingLong = az => ({ N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west' })[bearingName(az)];

  function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ---------- Sky model ----------
  const STARS = (() => {
    const r = mulberry(20260907), out = [];
    for (let i = 0; i < 2600; i++) {
      out.push({ az: r() * 360, alt: Math.asin(r()) * 180 / Math.PI, m: r(), tw: r() * Math.PI * 2, warm: r() });
    }
    return out;
  })();
  const DUST = [
    { az: 205, alt: 50, r: 34, name: 'Weaver Cloud' },
    { az: 320, alt: 38, r: 44, name: 'Rust Veil' },
    { az: 80, alt: 14, r: 30, name: 'Ember Bank' }
  ];

  function planetActiveTonight(p, night) { return (night + p.offset) % p.period === 0; }
  function planetPos(p, hour, night) {
    if (!planetActiveTonight(p, night)) return null;
    const dt = hour - p.transit;
    if (Math.abs(dt) > p.halfSpan) return null;
    const f = dt / p.halfSpan;
    const alt = p.maxAlt * Math.cos(f * Math.PI / 2);
    if (alt < 3) return null;
    return { az: ((p.azCenter + f * p.azSpread / 2) % 360 + 360) % 360, alt };
  }
  function planetWindow(p) {
    const rise = Math.max(NIGHT_START, p.transit - p.halfSpan), set = Math.min(NIGHT_END, p.transit + p.halfSpan);
    return { rise, set };
  }
  function nextAppearance(p) {
    // returns {night, hour} of the next time the planet is up, relative to now
    for (let n = S.night; n < S.night + 6; n++) {
      if (!planetActiveTonight(p, n)) continue;
      const w = planetWindow(p);
      if (n === S.night) { if (S.hour < w.set) return { night: n, hour: Math.max(w.rise, S.hour), rise: w.rise, set: w.set }; }
      else return { night: n, hour: w.rise, rise: w.rise, set: w.set };
    }
    return null;
  }
  function zoomNeededFor(p) {
    // smallest zoom at which the planet resolves into a disc (>= 18px) on a 340px eyepiece
    for (let i = 0; i < ZOOMS.length; i++) { const px = p.size * (340 / (BASE_FOV / ZOOMS[i])); if (px >= 18) return ZOOMS[i]; }
    return ZOOMS[ZOOMS.length - 1];
  }
  function hintCost(p, key) { return Math.round(p.value * { time: 0.5, direction: 0.7, gear: 0.4 }[key]); }

  // Each inline copy of a model gets unique gradient/clip ids, otherwise a copy
  // inside a hidden screen would win the id lookup and the visible one goes blank.
  let svgSeq = 0;
  function svgOf(p) {
    const t = '-i' + (svgSeq++);
    return p.svg.replace(/id="([^"]+)"/g, (m, id) => `id="${id}${t}"`).replace(/url\(#([^)]+)\)/g, (m, id) => `url(#${id}${t})`);
  }

  // ---------- Planet images ----------
  const IMG = {};
  PLANETS.forEach(p => { const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(p.svg); IMG[p.id] = im; });

  // ---------- Canvas / telescope ----------
  const canvas = $('sky'), ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1, R = 150, CX = 0, CY = 0;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    R = Math.min(W, H) * 0.42; CX = W / 2; CY = H / 2 - 10;
  }
  window.addEventListener('resize', resize);

  const pxPerDeg = () => (2 * R) / fov();
  const azScale = () => Math.max(0.15, Math.cos(rad(S.viewAlt)));
  let shake = { x: 0, y: 0 };
  function project(az, alt) {
    const s = pxPerDeg();
    return { x: CX + wrap180(az - S.viewAz) * azScale() * s + shake.x, y: CY - (alt - S.viewAlt) * s + shake.y };
  }

  // observation state
  let obs = { id: null, t: 0 };
  let msg = { text: '', until: 0 };
  function setMessage(text, ms) { msg.text = text; msg.until = performance.now() + (ms || 1800); }

  // per-frame status of each planet (used for hints + observation)
  function planetStatus(p, pos) {
    const d = p.size * pxPerDeg();
    const resolved = d >= 18;
    const apertureOk = p.mag <= S.up.aperture;
    const filterOk = !p.needsFilter || S.up.filter >= 2;
    return { d, resolved, apertureOk, filterOk, glimmer: !apertureOk && p.mag === S.up.aperture + 1, pos };
  }

  function drawSky(now, dt) {
    ctx.clearRect(0, 0, W, H);
    // eyepiece mask
    ctx.save();
    ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.clip();
    const g = ctx.createRadialGradient(CX, CY, R * 0.2, CX, CY, R);
    g.addColorStop(0, '#0a1020'); g.addColorStop(1, '#03060d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const s = pxPerDeg(), half = fov() / 2 + 2, z = zoom();
    // horizon glow if looking low
    const horizonY = CY + S.viewAlt * s;
    if (horizonY < CY + R + 40) {
      const hg = ctx.createLinearGradient(0, horizonY - 80, 0, horizonY);
      hg.addColorStop(0, 'rgba(60,40,30,0)'); hg.addColorStop(1, 'rgba(90,60,40,0.55)');
      ctx.fillStyle = hg; ctx.fillRect(0, horizonY - 80, W, 80);
      ctx.fillStyle = '#05070c'; ctx.fillRect(0, horizonY, W, H);
    }
    // dust clouds
    DUST.forEach(dc => {
      if (Math.abs(wrap180(dc.az - S.viewAz)) > dc.r + half || Math.abs(dc.alt - S.viewAlt) > dc.r + half) return;
      const c = project(dc.az, dc.alt), rr = dc.r * s;
      const dg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, rr);
      const a = S.up.filter >= 2 ? 0.12 : 0.55;
      dg.addColorStop(0, `rgba(120,90,70,${a})`); dg.addColorStop(0.6, `rgba(90,70,60,${a * 0.6})`); dg.addColorStop(1, 'rgba(60,50,45,0)');
      ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(c.x, c.y, rr, 0, Math.PI * 2); ctx.fill();
    });
    // stars
    const faintCut = z >= 8 ? 0 : z >= 4 ? 0.25 : z >= 2 ? 0.45 : 0.6;
    for (const st of STARS) {
      if (st.m < faintCut) continue;
      if (Math.abs(wrap180(st.az - S.viewAz)) > half / azScale() || Math.abs(st.alt - S.viewAlt) > half) continue;
      const pt = project(st.az, st.alt);
      const tw = 0.75 + 0.25 * Math.sin(now / 600 + st.tw);
      const size = (0.6 + st.m * 1.6) * tw;
      ctx.fillStyle = st.warm > 0.8 ? `rgba(255,220,180,${0.5 + st.m * 0.5})` : st.warm < 0.15 ? `rgba(190,210,255,${0.5 + st.m * 0.5})` : `rgba(240,240,255,${0.45 + st.m * 0.55})`;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2); ctx.fill();
    }
    // planets
    let lockCandidate = null, lockDist = Infinity, feedback = null;
    for (const p of PLANETS) {
      const pos = planetPos(p, S.hour, S.night);
      if (!pos) continue;
      if (Math.abs(wrap180(pos.az - S.viewAz)) > half / azScale() + 3 || Math.abs(pos.alt - S.viewAlt) > half + 3) continue;
      const st = planetStatus(p, pos), pt = project(pos.az, pos.alt);
      const dist = Math.hypot(pt.x - CX, pt.y - CY);
      const inLock = dist <= Math.max(st.d / 2, 14) + 8;
      if (!st.apertureOk) {
        if (st.glimmer) {
          ctx.fillStyle = 'rgba(200,200,220,0.13)'; ctx.beginPath(); ctx.arc(pt.x, pt.y, Math.max(2, st.d / 3), 0, Math.PI * 2); ctx.fill();
          if (inLock) feedback = 'Something faint is here. A wider mirror would show it.';
        }
        continue;
      }
      if (!st.filterOk) {
        ctx.fillStyle = 'rgba(160,130,110,0.25)'; ctx.beginPath(); ctx.arc(pt.x, pt.y, Math.max(6, st.d * 0.8), 0, Math.PI * 2); ctx.fill();
        if (inLock) feedback = 'A smudge behind the dust. A nebula filter would cut through.';
        continue;
      }
      if (!st.resolved) {
        // star-like point, but slightly larger and steadier than stars
        const gl = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 7);
        gl.addColorStop(0, 'rgba(255,250,230,0.95)'); gl.addColorStop(0.4, 'rgba(255,240,200,0.5)'); gl.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2); ctx.fill();
        if (inLock) feedback = 'A steady point that does not twinkle. Zoom in to resolve it.';
        continue;
      }
      const im = IMG[p.id];
      if (im.complete) {
        ctx.save();
        ctx.shadowColor = 'rgba(255,240,220,0.35)'; ctx.shadowBlur = st.d * 0.25;
        ctx.drawImage(im, pt.x - st.d / 2, pt.y - st.d / 2, st.d, st.d);
        ctx.restore();
      }
      if (inLock && dist < lockDist) { lockDist = dist; lockCandidate = p; }
    }
    ctx.restore();

    // observation logic
    if (lockCandidate) {
      if (obs.id !== lockCandidate.id) { obs.id = lockCandidate.id; obs.t = 0; }
      // the mount follows whatever is centred, better with a better mount
      if (!pointers.size && dt > 0) {
        const pos = planetPos(lockCandidate, S.hour, S.night), k = Math.min(1, dt * FOLLOW_RATE[S.up.tracking]);
        S.viewAz = ((S.viewAz + wrap180(pos.az - S.viewAz) * k) % 360 + 360) % 360;
        S.viewAlt = clamp(S.viewAlt + (pos.alt - S.viewAlt) * k, 0, 88);
      }
      const alreadyTonight = S.observedNight[lockCandidate.id] === S.night;
      if (alreadyTonight) {
        feedback = `${lockCandidate.name} — already logged tonight.`;
      } else {
        obs.t += dt / OBS_SECONDS;
        feedback = S.discovered[lockCandidate.id] ? `Holding on ${lockCandidate.name}…` : 'Hold steady… something new.';
        if (obs.t >= 1) completeObservation(lockCandidate);
      }
    } else {
      obs.t = Math.max(0, obs.t - dt / 1.2);
      if (obs.t === 0) obs.id = null;
    }
    if (feedback) setMessage(feedback, 400);

    // reticle + progress ring
    ctx.strokeStyle = 'rgba(201,161,90,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(CX - 26, CY); ctx.lineTo(CX - 10, CY); ctx.moveTo(CX + 10, CY); ctx.lineTo(CX + 26, CY);
    ctx.moveTo(CX, CY - 26); ctx.lineTo(CX, CY - 10); ctx.moveTo(CX, CY + 10); ctx.lineTo(CX, CY + 26); ctx.stroke();
    ctx.beginPath(); ctx.arc(CX, CY, 30, 0, Math.PI * 2); ctx.stroke();
    if (obs.t > 0) {
      ctx.strokeStyle = '#e7c987'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(CX, CY, 34, -Math.PI / 2, -Math.PI / 2 + obs.t * Math.PI * 2); ctx.stroke();
    }
    // eyepiece rim
    ctx.strokeStyle = '#2a3552'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(CX, CY, R + 3, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#c9a15a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(CX, CY, R + 7, 0, Math.PI * 2); ctx.stroke();
    // vignette
    const v = ctx.createRadialGradient(CX, CY, R * 0.7, CX, CY, R);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = v; ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.fill();
  }

  function completeObservation(p) {
    obs.t = 0; obs.id = null;
    const first = !S.discovered[p.id];
    const mult = CAMERA_MULT[S.up.camera];
    const earned = Math.round(p.value * mult * (first ? 4 : 1));
    S.credits += earned;
    S.discovered[p.id] = true;
    S.observedNight[p.id] = S.night;
    S.obsCount[p.id] = (S.obsCount[p.id] || 0) + 1;
    S.nightLog.push({ name: p.name, earned, first });
    save();
    toast(first ? `Discovered ${p.name}! +${earned}` : `${p.name} logged. +${earned}`);
    if (first) { $('indexDot').classList.remove('hidden'); flashDiscovery(p); }
    renderTop(); renderIndex();
    const total = PLANETS.filter(q => S.discovered[q.id]).length;
    if (total === PLANETS.length && !S.seenComplete) { S.seenComplete = true; save(); setTimeout(showComplete, 1600); }
  }
  function flashDiscovery(p) {
    const body = $('overlayBody');
    body.innerHTML = `<div class="detail-hero"><div class="big">${svgOf(p)}</div><h2>${p.name}</h2><div class="kind">${p.kind}</div></div>
      <p class="lore">${p.lore}</p><button class="pill buy" data-close="overlay">Add to the Index</button>`;
    $('overlay').classList.remove('hidden');
  }
  function showComplete() {
    const body = $('overlayBody');
    body.innerHTML = `<div class="overlay-title">Index complete</div><div class="overlay-sub">Every world in the catalogue has been seen through your glass. Keep observing — the archive still pays.</div>
      <div class="medals">${PLANETS.map(p => svgOf(p)).join('')}</div><button class="pill buy" data-close="overlay">Continue</button>`;
    $('overlay').classList.remove('hidden');
  }

  // ---------- Time ----------
  let last = performance.now(), paused = false;
  function tick(now) {
    const dtReal = Math.min(0.1, (now - last) / 1000); last = now;
    if (!paused && $('overlay').classList.contains('hidden')) {
      S.hour += dtReal * S.speed / REAL_SECONDS_PER_HOUR;
      if (S.hour >= NIGHT_END) { dawn(); }
      // drift + shake
      const tr = S.up.tracking;
      if (tr < 4 && screen === 'telescope') S.viewAz = (S.viewAz + dtReal * 0.05 / tr) % 360;
      const amp = (tr >= 4 ? 0.004 : 0.06 / tr) * pxPerDeg();
      shake.x = Math.sin(now / 130) * amp * 0.6 + Math.sin(now / 47) * amp * 0.4;
      shake.y = Math.cos(now / 170) * amp * 0.6 + Math.sin(now / 61) * amp * 0.4;
    }
    if (screen === 'telescope') {
      drawSky(now, paused ? 0 : dtReal);
      renderReadout();
      if (S.up.chart >= 2 && S.showChart) drawChart();
    }
    if (now - lastTop > 250) { renderTop(); lastTop = now; }
    if (msg.until < now && $('message').textContent) $('message').textContent = '';
    else if ($('message').textContent !== msg.text && msg.until >= now) $('message').textContent = msg.text;
    requestAnimationFrame(tick);
  }
  let lastTop = 0;

  function dawn() {
    const log = S.nightLog.slice();
    const grant = DAWN_GRANT;
    S.credits += grant;
    S.night += 1; S.hour = NIGHT_START; S.nightLog = []; S.speed = 1;
    save();
    const body = $('overlayBody');
    body.innerHTML = `<div class="overlay-title">Dawn</div><div class="overlay-sub">Night ${S.night - 1} is over. The observatory grant arrives with the sun.</div>
      <div class="overlay-list">${log.map(l => `<div><span>${l.first ? '★ ' : ''}${l.name}</span><span>+${l.earned}</span></div>`).join('')}<div><span>Observatory grant</span><span>+${grant}</span></div></div>
      <button class="pill buy" data-close="overlay">Wait for dusk</button>`;
    $('overlay').classList.remove('hidden');
    renderTop(); renderAlmanac(); renderShop();
  }

  // ---------- UI: top bar / readouts ----------
  function renderTop() {
    $('credits').textContent = fmtCredits(S.credits);
    $('night').textContent = `Night ${S.night}`;
    $('hour').textContent = fmtHour(S.hour);
    $('speedBtn').textContent = S.speed === 1 ? '1×' : `${S.speed}×`;
  }
  function renderReadout() {
    $('readout').textContent = `Az ${Math.round(S.viewAz)}° ${bearingName(S.viewAz)} · Alt ${Math.round(S.viewAlt)}° · FOV ${fov() < 10 ? fov().toFixed(1) : Math.round(fov())}°`;
    $('zoomLabel').textContent = `×${zoom()}`;
    // compass track: 20px per 5 degrees, centered on viewAz
    const track = $('compassTrack'), pxPer = 8;
    if (!track.childElementCount) {
      for (let d = -360; d <= 720; d += 15) {
        const sp = document.createElement('span'); const dd = ((d % 360) + 360) % 360;
        const major = dd % 45 === 0; sp.className = major ? 'major' : ''; sp.textContent = major ? bearingName(dd) : dd + '°';
        sp.style.left = (d + 360) * pxPer + 'px'; track.appendChild(sp);
      }
    }
    const width = $('compass').clientWidth;
    track.style.left = (width / 2 - (S.viewAz + 360) * pxPer) + 'px';
  }

  // ---------- Star chart ----------
  const chartCanvas = $('chartCanvas');
  function drawChart() {
    const cc = chartCanvas, c2 = cc.getContext('2d');
    const cw = cc.clientWidth, ch = cc.clientHeight;
    if (cc.width !== cw * DPR) { cc.width = cw * DPR; cc.height = ch * DPR; }
    c2.setTransform(DPR, 0, 0, DPR, 0, 0); c2.clearRect(0, 0, cw, ch);
    c2.fillStyle = '#0a1020'; c2.fillRect(0, 0, cw, ch);
    const X = az => (az / 360) * cw, Y = alt => ch - (alt / 90) * ch;
    c2.strokeStyle = '#22304d'; c2.lineWidth = 1;
    [90, 180, 270].forEach(a => { c2.beginPath(); c2.moveTo(X(a), 0); c2.lineTo(X(a), ch); c2.stroke(); });
    c2.fillStyle = '#8b95ad'; c2.font = '9px system-ui';
    ['N', 'E', 'S', 'W'].forEach((n, i) => c2.fillText(n, X(i * 90) + 2, 10));
    // current view box
    const fw = fov() / azScale(), fh = fov();
    c2.strokeStyle = '#c9a15a'; c2.strokeRect(X(S.viewAz - fw / 2), Y(S.viewAlt + fh / 2), Math.max(3, fw / 360 * cw), Math.max(3, fh / 90 * ch));
    // planets whose bearing is known
    PLANETS.forEach(p => {
      if (!(S.discovered[p.id] || (S.hints[p.id] && S.hints[p.id].direction))) return;
      const pos = planetPos(p, S.hour, S.night); if (!pos) return;
      c2.fillStyle = S.discovered[p.id] ? '#4fd39b' : '#e7c987';
      c2.beginPath(); c2.arc(X(pos.az), Y(pos.alt), 3, 0, Math.PI * 2); c2.fill();
    });
  }

  // ---------- Index ----------
  function renderIndex() {
    const found = PLANETS.filter(p => S.discovered[p.id]).length;
    $('indexBar').style.width = (found / PLANETS.length * 100) + '%';
    $('indexCount').textContent = `${found} of ${PLANETS.length} catalogued`;
    const cards = $('cards'); cards.innerHTML = '';
    PLANETS.forEach((p, i) => {
      const known = !!S.discovered[p.id];
      const hints = S.hints[p.id] || {};
      const hintCount = HINT_KEYS.filter(k => hints[k]).length;
      const el = document.createElement('button');
      el.className = 'card' + (known ? '' : ' unknown');
      el.innerHTML = known
        ? `<div class="model">${svgOf(p)}</div><div class="name">${p.name}</div><div class="kind">${p.kind}</div><div class="flag">${S.obsCount[p.id] || 0} observation${S.obsCount[p.id] === 1 ? '' : 's'}</div>`
        : `<div class="model">?</div><div class="name">Entry ${String(i + 1).padStart(2, '0')}</div><div class="kind">Uncatalogued</div><div class="flag hint">${hintCount ? hintCount + ' of 3 hints' : 'No hints yet'}</div>`;
      el.addEventListener('click', () => openDetail(p));
      cards.appendChild(el);
    });
    renderAlmanac();
  }

  function describeTime(p) {
    const w = planetWindow(p);
    const cadence = p.period === 1 ? 'every night' : p.period === 2 ? 'every other night' : `every ${p.period}rd night`;
    return `Up ${fmtHour(w.rise)}–${fmtHour(w.set)}, highest around ${fmtHour(p.transit)}, ${cadence}.`;
  }
  function describeDirection(p) {
    return `Look ${bearingLong(p.azCenter)} (bearing ~${Math.round(p.azCenter)}°), climbing to about ${Math.round(p.maxAlt)}° above the horizon.`;
  }
  function describeGear(p) {
    const parts = [`mirror ${p.mag}`, `zoom ×${zoomNeededFor(p)}`];
    if (p.needsFilter) parts.push('nebula filter');
    return `Needs ${parts.join(', ')}.`;
  }

  function openDetail(p) {
    const known = !!S.discovered[p.id];
    const hints = S.hints[p.id] || (S.hints[p.id] = {});
    const idx = PLANETS.indexOf(p) + 1;
    const fact = (key, label, text) => {
      const unlocked = known || hints[key];
      const cost = hintCost(p, key);
      return `<div class="fact"><div class="k">${label}</div><div class="v ${unlocked ? '' : 'locked'}">${unlocked ? text : 'Unknown'}</div>${unlocked ? '' : `<button class="pill buy" data-hint="${key}" ${S.credits < cost ? 'disabled' : ''}>Buy hint · ${cost}</button>`}</div>`;
    };
    const next = nextAppearance(p);
    const nextText = next ? (next.night === S.night ? (S.hour >= next.rise ? 'Up right now' : `Rises tonight at ${fmtHour(next.rise)}`) : `Next: night ${next.night} at ${fmtHour(next.rise)}`) : 'Not expected soon';
    const body = $('detailBody');
    body.innerHTML = `<div class="detail-hero">
        <div class="big ${known ? '' : 'unknown'}">${known ? svgOf(p) : '?'}</div>
        <h2>${known ? p.name : `Entry ${String(idx).padStart(2, '0')}`}</h2>
        <div class="kind">${known ? p.kind : 'Uncatalogued object'}</div></div>
      ${known ? `<p class="lore">${p.lore}</p>` : ''}
      <div class="facts">
        ${fact('time', 'When', describeTime(p))}
        ${fact('direction', 'Where', describeDirection(p))}
        ${fact('gear', 'Gear', describeGear(p))}
        ${(known || hints.time) ? `<div class="fact"><div class="k">Next</div><div class="v">${nextText}</div></div>` : ''}
      </div>
      ${known ? `<div class="stats"><div><b>${S.obsCount[p.id] || 0}</b>observations</div><div><b>${p.value}</b>credits each</div></div>` : ''}`;
    body.querySelectorAll('[data-hint]').forEach(b => b.addEventListener('click', () => {
      const key = b.dataset.hint, cost = hintCost(p, key);
      if (S.credits < cost) return;
      S.credits -= cost; hints[key] = true; save(); renderTop(); renderIndex(); openDetail(p);
      toast('Hint added to the index');
    }));
    $('detail').classList.remove('hidden');
  }

  function renderAlmanac() {
    const list = $('almanac'); list.innerHTML = '';
    const rows = PLANETS.filter(p => S.discovered[p.id] || (S.hints[p.id] && S.hints[p.id].time))
      .map(p => ({ p, next: nextAppearance(p) }))
      .sort((a, b) => (a.next ? a.next.night * 100 + a.next.hour : 1e9) - (b.next ? b.next.night * 100 + b.next.hour : 1e9));
    if (!rows.length) { list.innerHTML = '<div class="sub" style="padding:8px 4px">Discover a planet or buy a “When” hint to fill tonight’s almanac.</div>'; return; }
    rows.forEach(({ p, next }) => {
      const known = !!S.discovered[p.id];
      const up = next && next.night === S.night && S.hour >= next.rise;
      const soon = next && next.night === S.night && !up;
      const el = document.createElement('div'); el.className = 'row' + (up ? ' up' : '');
      const dirKnown = known || (S.hints[p.id] && S.hints[p.id].direction);
      el.innerHTML = `<div class="mini">${known ? svgOf(p) : '<div class="card unknown" style="width:44px;height:44px;padding:0;border-radius:50%;font-family:var(--display);font-size:22px;color:var(--line)">?</div>'}</div>
        <div class="grow"><div class="title">${known ? p.name : 'Entry ' + String(PLANETS.indexOf(p) + 1).padStart(2, '0')}<small>${dirKnown ? bearingName(p.azCenter) + ' · ' + Math.round(p.maxAlt) + '°' : ''}</small></div>
        <div class="when">${next ? (next.night === S.night ? `${fmtHour(next.rise)} – ${fmtHour(next.set)} tonight` : `Night ${next.night}, ${fmtHour(next.rise)} – ${fmtHour(next.set)}`) : 'No pass soon'}</div></div>
        <div class="status ${up ? 'up' : soon ? 'soon' : ''}">${up ? (S.observedNight[p.id] === S.night ? 'Logged' : 'Up now') : soon ? 'Later' : 'Waiting'}</div>`;
      el.addEventListener('click', () => openDetail(p));
      list.appendChild(el);
    });
  }

  // ---------- Shop ----------
  function renderShop() {
    const shop = $('shop'); shop.innerHTML = '';
    Object.entries(UPGRADES).forEach(([key, u]) => {
      const lvl = S.up[key], maxed = lvl >= u.max, cost = maxed ? 0 : u.costs[lvl];
      const binary = u.max === 2;
      const el = document.createElement('div'); el.className = 'row';
      el.innerHTML = `<div class="grow"><div class="title">${u.name}${binary ? '' : `<small>level ${lvl} / ${u.max}</small>`}</div>
        <div class="desc">${u.desc}</div><div class="effect">${u.effect(lvl)}${!maxed && !binary ? ` → ${u.effect(lvl + 1)}` : ''}</div>
        ${binary ? '' : `<div class="dots">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>`}</div>
        <button class="pill ${maxed ? 'owned' : 'buy'}" ${maxed || S.credits < cost ? 'disabled' : ''}>${maxed ? (binary ? 'Fitted' : 'Max') : cost}</button>`;
      el.querySelector('button').addEventListener('click', () => {
        if (maxed || S.credits < cost) return;
        S.credits -= cost; S.up[key] += 1; save();
        if (key === 'chart') { $('chartBtn').classList.remove('hidden'); }
        toast(`${u.name} upgraded`); renderTop(); renderShop(); renderIndex();
      });
      shop.appendChild(el);
    });
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(text) { const t = $('toast'); t.textContent = text; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200); }

  // ---------- Navigation ----------
  let screen = 'telescope';
  document.querySelectorAll('.navbtn').forEach(b => b.addEventListener('click', () => {
    screen = b.dataset.screen;
    document.querySelectorAll('.navbtn').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + screen));
    if (screen === 'index') { $('indexDot').classList.add('hidden'); renderIndex(); }
    if (screen === 'shop') renderShop();
    if (screen === 'telescope') resize();
  }));
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    $('cards').classList.toggle('hidden', t.dataset.tab !== 'cards');
    $('almanac').classList.toggle('hidden', t.dataset.tab !== 'almanac');
    if (t.dataset.tab === 'almanac') renderAlmanac();
  }));
  document.body.addEventListener('click', e => {
    const c = e.target.closest('[data-close]'); if (c) $(c.dataset.close).classList.add('hidden');
  });
  $('speedBtn').addEventListener('click', () => { S.speed = S.speed === 1 ? 6 : S.speed === 6 ? 20 : 1; renderTop(); save(); });
  $('endNight').addEventListener('click', () => { S.hour = NIGHT_END; });
  let resetArmed = 0;
  $('resetBtn').addEventListener('click', () => {
    if (Date.now() - resetArmed < 4000) { S = defaultState(); save(); location.reload(); return; }
    resetArmed = Date.now(); $('resetBtn').textContent = 'Tap again to erase';
    setTimeout(() => { $('resetBtn').textContent = 'Reset progress'; }, 4000);
  });
  $('chartBtn').addEventListener('click', () => { S.showChart = !S.showChart; $('chart').classList.toggle('hidden', !S.showChart); save(); });
  if (S.up.chart >= 2) { $('chartBtn').classList.remove('hidden'); $('chart').classList.toggle('hidden', !S.showChart); }

  // zoom
  function setZoom(i) { S.zoomIdx = clamp(i, 0, S.up.mag - 1); save(); }
  $('zoomIn').addEventListener('click', () => { if (S.zoomIdx + 1 >= S.up.mag) { setMessage('Stronger eyepieces are sold in the Workshop.', 1500); } setZoom(S.zoomIdx + 1); });
  $('zoomOut').addEventListener('click', () => setZoom(S.zoomIdx - 1));

  // pan / pinch
  const pointers = new Map(); let pinchStart = null;
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), idx: S.zoomIdx }; } });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId); const cur = { x: e.clientX, y: e.clientY };
    if (pointers.size === 1) {
      const s = pxPerDeg();
      S.viewAz = ((S.viewAz - (cur.x - prev.x) / (s * azScale())) % 360 + 360) % 360;
      S.viewAlt = clamp(S.viewAlt + (cur.y - prev.y) / s, 0, 88);
    }
    pointers.set(e.pointerId, cur);
    if (pointers.size === 2 && pinchStart) {
      const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      const steps = Math.round(Math.log2(d / pinchStart.d) * 1.3);
      setZoom(pinchStart.idx + steps);
    }
  });
  const endPointer = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinchStart = null; save(); };
  canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', e => { e.preventDefault(); setZoom(S.zoomIdx + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });
  window.addEventListener('keydown', e => {
    const step = fov() / 12;
    if (e.key === 'ArrowLeft') S.viewAz = (S.viewAz - step + 360) % 360;
    if (e.key === 'ArrowRight') S.viewAz = (S.viewAz + step) % 360;
    if (e.key === 'ArrowUp') S.viewAlt = clamp(S.viewAlt + step, 0, 88);
    if (e.key === 'ArrowDown') S.viewAlt = clamp(S.viewAlt - step, 0, 88);
    if (e.key === '+' || e.key === '=') setZoom(S.zoomIdx + 1);
    if (e.key === '-') setZoom(S.zoomIdx - 1);
  });
  document.addEventListener('visibilitychange', () => { paused = document.hidden; last = performance.now(); save(); });

  // ---------- Boot ----------
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) { navigator.serviceWorker.register('sw.js').catch(() => {}); }
  S.zoomIdx = clamp(S.zoomIdx, 0, S.up.mag - 1);
  resize(); renderTop(); renderIndex(); renderShop();
  if (!Object.keys(S.discovered).length && S.night === 1 && S.hour < 18.05) {
    setMessage('Drag to sweep the sky. Two bright worlds are up in the south tonight.', 5000);
  }
  requestAnimationFrame(tick);
})();
