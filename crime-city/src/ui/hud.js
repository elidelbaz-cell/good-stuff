// DOM HUD: bounty centerpiece, stars, health, ammo, squad, banners, toasts.
import { bus } from '../core/bus.js';
import { fmtMoney, clamp } from '../core/utils.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(G) {
    this.G = G;
    this.el = {
      hud: $('hud'), bounty: $('bounty'), pops: $('bounty-pops'), stars: $('stars'),
      mob: $('hud-mob'), cash: $('cash'), objective: $('objective'),
      wave: $('wave'), clock: $('clock-mode'), headline: $('headline'), headlineText: $('headline-text'),
      banner: $('banner'), bannerMain: $('banner-main'), bannerSub: $('banner-sub'),
      interact: $('interact'), hitmarker: $('hitmarker'),
      squadHead: $('squad-head'), squadMode: $('squad-mode'), squadList: $('squad-list'),
      healthFill: $('health-fill'), healthNum: $('health-num'),
      ammoWrap: $('ammo-wrap'), ammoMag: $('ammo-mag'), ammoRes: $('ammo-res'), ammoHint: $('ammo-hint'),
      subtitle: $('subtitle'), vignette: $('vignette'), toasts: $('toasts'),
      chase: $('chase-timer'), slots: [...document.querySelectorAll('#hotbar .slot')],
    };
    this.bountyShown = 0;
    this.bannerT = 0;
    this.bannerQueue = [];
    this.headlineT = 0;
    this.subtitleT = 0;
    this.hitT = 0;
    this.vign = 0;

    bus.on('playerHurt', () => { this.vign = 1; });
    bus.on('hitmarker', (kill) => {
      this.hitT = 0.12;
      this.el.hitmarker.classList.toggle('kill', !!kill);
    });
  }

  show(on) { this.el.hud.classList.toggle('hidden', !on); }

  setMob(name, color) {
    this.el.mob.textContent = name;
    document.documentElement.style.setProperty('--mob', color);
  }

  banner(main, sub = '', cls = 'gold', time = 3) {
    this.bannerQueue.push({ main, sub, cls, time });
  }
  headline(text) {
    this.el.headlineText.textContent = text;
    this.el.headline.classList.remove('hidden');
    this.headlineT = 6;
  }
  toast(text, cls = '') {
    const d = document.createElement('div');
    d.className = 'toast ' + cls;
    d.textContent = text;
    this.el.toasts.appendChild(d);
    setTimeout(() => d.remove(), 3800);
  }
  subtitle(name, text) {
    this.el.subtitle.innerHTML = `<b>${name}:</b> ${text}`;
    this.el.subtitle.classList.remove('hidden');
    this.subtitleT = 2.6;
  }
  bountyPop(amount) {
    const d = document.createElement('div');
    d.className = 'bpop';
    d.textContent = '+' + fmtMoney(amount);
    this.el.pops.appendChild(d);
    setTimeout(() => d.remove(), 1400);
    this.el.bounty.classList.remove('pulse');
    void this.el.bounty.offsetWidth; // restart animation
    this.el.bounty.classList.add('pulse');
  }
  setObjective(text) {
    this.el.objective.innerHTML = text || '';
  }

  update(dt) {
    const G = this.G;
    const st = G.state;
    if (!st) return;

    // bounty tick-up
    const target = st.bounty;
    if (Math.abs(target - this.bountyShown) > 1) {
      this.bountyShown += (target - this.bountyShown) * Math.min(1, dt * 5);
      if (Math.abs(target - this.bountyShown) < 2) this.bountyShown = target;
      this.el.bounty.textContent = fmtMoney(this.bountyShown);
    }
    this.el.cash.textContent = fmtMoney(st.cash);

    // health
    const p = G.player;
    if (p) {
      const frac = clamp(p.hp / p.maxHp, 0, 1);
      this.el.healthFill.style.width = (frac * 100) + '%';
      this.el.healthFill.classList.toggle('low', frac < 0.35);
      this.el.healthNum.textContent = Math.ceil(p.hp);
    }

    // wanted stars
    const stars = G.police ? G.police.stars : 0;
    const starEls = this.el.stars.children;
    for (let i = 0; i < 5; i++) starEls[i].classList.toggle('on', i < stars);
    this.el.stars.classList.toggle('evading', !!G.police?.evading && stars > 0);

    // weapons
    if (G.weapons) {
      const w = G.weapons;
      this.el.slots.forEach((s, i) => {
        s.classList.toggle('active', i === w.slot);
        s.classList.toggle('locked', !w.slotUnlocked(i));
      });
      const cur = w.current();
      if (cur.melee) {
        this.el.ammoMag.textContent = '—';
        this.el.ammoRes.textContent = '';
        this.el.ammoHint.textContent = 'left click — punch';
        this.el.ammoWrap.classList.remove('empty');
      } else {
        this.el.ammoMag.textContent = w.reloading ? '···' : w.mag[w.key()];
        this.el.ammoRes.textContent = '/ ' + st.ammo[w.key()];
        this.el.ammoWrap.classList.toggle('empty', w.mag[w.key()] === 0 && st.ammo[w.key()] === 0);
        this.el.ammoHint.textContent = w.reloading ? 'reloading…' : (w.mag[w.key()] === 0 ? 'press R' : '');
      }
    }

    // squad panel
    if (G.squad) {
      this.el.squadHead.childNodes[0].textContent = `SQUAD ${G.squad.units.length}/${G.squad.maxSquad()} `;
      this.el.squadMode.textContent = G.squad.mode.toUpperCase();
      if (G.squad.dirtyUI) {
        G.squad.dirtyUI = false;
        this.el.squadList.innerHTML = '';
        for (const u of G.squad.units) {
          const row = document.createElement('div');
          row.className = 'sq-row';
          row.innerHTML = `<span class="nm"></span><span class="tp"></span><div class="hp"><i></i></div>`;
          row.querySelector('.nm').textContent = u.name;
          row.querySelector('.tp').textContent = u.def.name;
          u.uiRow = row;
          this.el.squadList.appendChild(row);
        }
      }
      for (const u of G.squad.units) {
        if (!u.uiRow) continue;
        u.uiRow.classList.toggle('down', u.state === 'down');
        u.uiRow.querySelector('.hp i').style.width = (clamp(u.hp / u.def.hp, 0, 1) * 100) + '%';
      }
    }

    // banner queue
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.el.banner.classList.add('hidden');
    } else if (this.bannerQueue.length) {
      const b = this.bannerQueue.shift();
      this.el.bannerMain.textContent = b.main;
      this.el.bannerMain.className = b.cls;
      this.el.bannerSub.textContent = b.sub;
      this.el.banner.classList.remove('hidden');
      this.bannerT = b.time;
    }

    if (this.headlineT > 0) {
      this.headlineT -= dt;
      if (this.headlineT <= 0) this.el.headline.classList.add('hidden');
    }
    if (this.subtitleT > 0) {
      this.subtitleT -= dt;
      if (this.subtitleT <= 0) this.el.subtitle.classList.add('hidden');
    }
    if (this.hitT > 0) {
      this.hitT -= dt;
      this.el.hitmarker.classList.toggle('hidden', this.hitT <= 0);
    }

    // interact prompt (systems set G.interact each frame)
    if (G.interact) {
      this.el.interact.classList.remove('hidden');
      this.el.interact.innerHTML = `<b>${G.interact.keyLabel || 'E'}</b> — ${G.interact.text}` +
        (G.interact.frac !== undefined ? `<span class="bar"><i style="width:${(G.interact.frac * 100).toFixed(0)}%"></i></span>` : '');
    } else {
      this.el.interact.classList.add('hidden');
    }

    // chase timer
    if (G.activities?.chaseT > 0) {
      this.el.chase.classList.remove('hidden');
      this.el.chase.textContent = 'SURVIVE THE HEAT: ' + Math.ceil(G.activities.chaseT);
    } else {
      this.el.chase.classList.add('hidden');
    }

    // wave counter
    if (G.finale?.active) {
      this.el.wave.classList.remove('hidden');
      this.el.wave.textContent = G.finale.waveLabel;
    } else {
      this.el.wave.classList.add('hidden');
    }

    this.el.clock.textContent = (G.sky.isNight ? 'NIGHT' : 'DAY') + ' — press N';

    // damage vignette
    this.vign = Math.max(0, this.vign - dt * 1.6);
    const lowHp = p && p.hp < 35 ? 0.45 + 0.2 * Math.sin(performance.now() / 200) : 0;
    this.el.vignette.style.opacity = Math.max(this.vign, lowHp);
  }
}
