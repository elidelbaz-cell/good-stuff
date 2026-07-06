// Menu screens + pause flow (pointer lock aware).
import { MOB_COLORS } from '../core/config.js';
import { hasSave } from '../core/state.js';

const $ = (id) => document.getElementById(id);

export class Menus {
  constructor(G, actions) {
    this.G = G;
    this.actions = actions;
    this.menu = $('menu');
    this.screens = ['main', 'name', 'controls', 'pause', 'wasted', 'win', 'lose']
      .reduce((m, k) => (m[k] = $('screen-' + k), m), {});
    this.controlsFrom = 'main';
    this.color = MOB_COLORS[0];

    // color swatches
    const row = $('color-row');
    MOB_COLORS.forEach((c, i) => {
      const s = document.createElement('div');
      s.className = 'swatch' + (i === 0 ? ' sel' : '');
      s.style.background = c;
      s.onclick = () => {
        this.color = c;
        row.querySelectorAll('.swatch').forEach((el) => el.classList.remove('sel'));
        s.classList.add('sel');
      };
      row.appendChild(s);
    });

    $('btn-new').onclick = () => { this.show('name'); $('mob-name').focus(); };
    $('btn-continue').onclick = () => actions.onContinue();
    $('btn-controls').onclick = () => { this.controlsFrom = 'main'; this.show('controls'); };
    $('btn-name-back').onclick = () => this.show('main');
    $('btn-start').onclick = () => this.startNew();
    $('mob-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.startNew(); e.stopPropagation(); });
    $('btn-controls-back').onclick = () => this.show(this.controlsFrom);
    $('btn-resume').onclick = () => this.resume();
    $('btn-pause-controls').onclick = () => { this.controlsFrom = 'pause'; this.show('controls'); };
    $('btn-quit').onclick = () => actions.onQuit();
    $('btn-respawn').onclick = () => actions.onRespawn();
    $('btn-win-continue').onclick = () => actions.onWinContinue();
    $('btn-retry').onclick = () => actions.onRetry();
    $('btn-lose-quit').onclick = () => actions.onQuit();

    // Esc exits pointer lock → treat as pause
    G.input.onLockChange = (locked) => {
      if (!locked && G.running && !G.paused) this.pause();
    };
  }

  startNew() {
    const name = $('mob-name').value.trim() || 'The Family';
    this.actions.onNewGame(name, this.color);
  }

  refreshMain() {
    $('btn-continue').disabled = !hasSave();
  }

  show(name) {
    this.menu.classList.remove('hidden');
    Object.values(this.screens).forEach((s) => s.classList.add('hidden'));
    this.screens[name].classList.remove('hidden');
    if (name === 'main') this.refreshMain();
  }
  hide() { this.menu.classList.add('hidden'); }
  get open() { return !this.menu.classList.contains('hidden'); }

  pause() {
    if (!this.G.running || this.G.paused) return;
    this.G.paused = true;
    this.G.input.unlock();
    this.show('pause');
  }
  resume() {
    this.G.paused = false;
    this.hide();
    this.G.input.lock();
  }

  wasted(lostCash) {
    this.G.paused = true;
    this.G.input.unlock();
    $('wasted-sub').textContent = lostCash > 0
      ? `the family drags you back to the warehouse… hospital bills: $${lostCash.toLocaleString()}`
      : 'the family drags you back to the warehouse…';
    this.show('wasted');
  }

  win(stats, mobName) {
    this.G.paused = true;
    this.G.input.unlock();
    $('win-mob').textContent = mobName;
    $('win-stats').innerHTML =
      `time played: <b>${stats.timeStr}</b><br>` +
      `bounty earned: <b>${stats.bounty}</b><br>` +
      `henchmen lost: <b>${stats.henchLost}</b><br>` +
      `cops sent packing: <b>${stats.cops}</b>`;
    this.show('win');
  }

  lose(waveLabel) {
    this.G.paused = true;
    this.G.input.unlock();
    $('lose-sub').textContent = `the NYPD took back the streets on ${waveLabel}. but ${this.G.state.mobName} won't be forgotten…`;
    this.show('lose');
  }
}
