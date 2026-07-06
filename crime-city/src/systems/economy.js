// Bounty + cash. Bounty is the progression system: crossing a tier threshold
// unlocks a bigger squad and a new recruit class with a banner + sound.
import { BOUNTY, CASH, TIERS } from '../core/config.js';
import { bus } from '../core/bus.js';
import { tierIndex } from '../core/state.js';
import { fmtMoney } from '../core/utils.js';

const HEADLINES = [
  (m) => `${m} tied to brazen daylight robbery downtown`,
  (m) => `police commissioner vows to bring down the ${m}`,
  (m) => `who are the ${m}? the city wants answers`,
  (m) => `mayor calls ${m} "a menace to New Amsterdam"`,
  (m) => `${m} bounty climbing — feds now involved`,
  (m) => `terrified witnesses describe ${m} rampage`,
];

export class Economy {
  constructor(G) {
    this.G = G;
    this.lastTier = 0;
    this.headlineTimer = 22;

    bus.on('bounty', ({ amount, reason, x, z }) => this.addBounty(amount, reason, false, x, z));
    bus.on('cash', ({ amount }) => this.addCash(amount));
  }

  syncFromState() {
    this.lastTier = tierIndex(this.G.state.bounty);
  }

  addCash(amount) {
    this.G.state.cash = Math.max(0, this.G.state.cash + amount);
  }

  addBounty(amount, reason = '', silent = false, x, z) {
    const st = this.G.state;
    st.bounty = Math.min(BOUNTY.GOAL, st.bounty + amount);
    st.stats.bountyEarned += amount;
    if (!silent) {
      this.G.hud.bountyPop(amount);
      this.G.audio.cashTick();
    }
    this.checkTier();
    this.checkGoal();
  }

  checkTier() {
    const idx = tierIndex(this.G.state.bounty);
    while (this.lastTier < idx) {
      this.lastTier++;
      const t = TIERS[this.lastTier];
      this.G.audio.fanfare();
      this.G.hud.banner('NEW RECRUITS AVAILABLE', `${t.label} — squad size ${t.squad}`, 'gold', 3.5);
      this.G.hud.toast(`unlocked: ${t.label} (squad ${t.squad})`, 'green');
      this.G.hud.headline(`${this.G.state.mobName} now feared enough to draw ${t.label.toLowerCase()}`);
      this.G.squad?.onTierUnlock();
    }
  }

  checkGoal() {
    if (this.G.state.bounty >= BOUNTY.GOAL && !this.G.finale?.triggered && !this.G.state.wonGame) {
      this.G.finale?.trigger();
    }
  }

  update(dt) {
    // occasional headline flavor while heat is up
    this.headlineTimer -= dt;
    if (this.headlineTimer <= 0) {
      this.headlineTimer = 26 + Math.random() * 20;
      if ((this.G.police?.stars || 0) >= 2 && !this.G.finale?.active) {
        const h = HEADLINES[Math.floor(Math.random() * HEADLINES.length)];
        this.G.hud.headline(h(this.G.state.mobName));
      }
    }
  }
}
