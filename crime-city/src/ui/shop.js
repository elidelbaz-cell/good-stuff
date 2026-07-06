// Generic station menu used by every base station (weapons wall, planning
// table, recruitment corner). Pauses the sim while open.
import { fmtMoney } from '../core/utils.js';

const $ = (id) => document.getElementById(id);

export class Shop {
  constructor(G) {
    this.G = G;
    this.el = $('shop');
    this.title = $('shop-title');
    this.cash = $('shop-cash');
    this.items = $('shop-items');
    this.provider = null;
    $('shop-close').onclick = () => this.close();
    addEventListener('keydown', (e) => {
      if (this.open && (e.code === 'KeyE' || e.code === 'Escape')) {
        e.stopPropagation();
        this.close();
      }
    });
  }

  get open() { return !this.el.classList.contains('hidden'); }

  show(title, provider) {
    this.provider = provider;
    this.title.textContent = title;
    this.el.classList.remove('hidden');
    this.G.paused = true;
    this.G.shopOpen = true;
    this.G.input.unlock();
    this.rebuild();
  }

  close() {
    if (!this.open) return;
    this.el.classList.add('hidden');
    this.G.shopOpen = false;
    this.G.paused = false;
    this.G.input.lock();
  }

  rebuild() {
    const st = this.G.state;
    this.cash.textContent = fmtMoney(st.cash);
    this.items.innerHTML = '';
    for (const it of this.provider()) {
      const row = document.createElement('div');
      row.className = 'shop-item' + (it.owned ? ' owned' : '') + (it.locked ? ' locked' : '');
      const info = document.createElement('div');
      info.className = 'info';
      info.innerHTML = `<div class="nm"></div><div class="ds"></div>`;
      info.querySelector('.nm').textContent = it.name;
      info.querySelector('.ds').textContent = it.desc || '';
      const btn = document.createElement('button');
      if (it.owned) { btn.textContent = it.ownedLabel || 'OWNED'; btn.disabled = true; }
      else if (it.locked) { btn.textContent = it.lockedLabel || 'LOCKED'; btn.disabled = true; }
      else {
        btn.textContent = fmtMoney(it.cost);
        btn.disabled = st.cash < it.cost;
        btn.onclick = () => {
          if (st.cash < it.cost) return;
          st.cash -= it.cost;
          it.onBuy();
          this.G.audio.cashTick();
          this.rebuild();
        };
      }
      row.append(info, btn);
      this.items.appendChild(row);
    }
  }
}
