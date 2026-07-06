/* =========================================================================
 * hud.js — DOM HUD: broadcast scoreboard, match clock, stamina & power
 * meters, radar, commentary ticker, and big centre announcements.
 * ========================================================================= */

class Hud {
  constructor() {
    this.$ = (id) => document.getElementById(id);
    this.scoreH = this.$('scoreHome');
    this.scoreA = this.$('scoreAway');
    this.clock = this.$('clock');
    this.stamina = this.$('staminaFill');
    this.powerWrap = this.$('power');
    this.powerFill = this.$('powerFill');
    this.commentary = this.$('commentary');
    this.announce = this.$('announce');
    this.radar = this.$('radar');
    this.rctx = this.radar.getContext('2d');

    this.$('nameHome').textContent = CFG.colors.homeName;
    this.$('nameAway').textContent = CFG.colors.awayName;
    this.$('nameHome').style.background = '#' + CFG.colors.home.toString(16).padStart(6, '0');
    this.$('nameAway').style.background = '#' + CFG.colors.away.toString(16).padStart(6, '0');

    this._annTimer = 0;
  }

  setScore(h, a) { this.scoreH.textContent = h; this.scoreA.textContent = a; }

  setClock(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    this.clock.textContent = `${m}'${s < 10 ? '0' + s : s}`;
  }

  setStamina(v) { this.stamina.style.width = (clamp(v, 0, 1) * 100) + '%'; }

  setPower(active, v) {
    this.powerWrap.style.opacity = active ? '1' : '0';
    this.powerFill.style.width = (clamp(v, 0, 1) * 100) + '%';
  }

  say(text) { this.commentary.textContent = text; }

  bigAnnounce(text, sub, ms = 2200) {
    this.announce.innerHTML = `<div class="ann-main">${text}</div>` +
      (sub ? `<div class="ann-sub">${sub}</div>` : '');
    this.announce.classList.add('show');
    this._annTimer = ms / 1000;
  }

  update(dt) {
    if (this._annTimer > 0) {
      this._annTimer -= dt;
      if (this._annTimer <= 0) this.announce.classList.remove('show');
    }
  }

  // Top-down radar of the pitch: ball + all players.
  drawRadar(game) {
    const ctx = this.rctx, W = this.radar.width, H = this.radar.height;
    const F = CFG.FIELD;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#123a1c'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
    ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.beginPath(); ctx.moveTo(4, H / 2); ctx.lineTo(W - 4, H / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 10, 0, TAU); ctx.stroke();

    const map = (x, z) => [
      (x / F.width + 0.5) * (W - 8) + 4,
      (0.5 - z / F.length) * (H - 8) + 4,
    ];
    for (const p of game.players) {
      const [sx, sy] = map(p.pos.x, p.pos.z);
      ctx.fillStyle = p.isHuman ? '#fff700'
        : '#' + (p.team === 'home' ? CFG.colors.home : CFG.colors.away).toString(16).padStart(6, '0');
      ctx.beginPath(); ctx.arc(sx, sy, p.isHuman ? 3.5 : 2.6, 0, TAU); ctx.fill();
    }
    const [bx, by] = map(game.ball.pos.x, game.ball.pos.z);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx, by, 2.4, 0, TAU); ctx.fill();
  }
}
