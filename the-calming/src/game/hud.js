// Minimal diegetic-adjacent HUD: fades, one-line messages, stagger vignette,
// the cutscene skip prompt. No health bar anywhere — the ghost is the health bar.
export class HUD {
  constructor() {
    this.fade = document.getElementById('fade');
    this.vignette = document.getElementById('vignette');
    this.dot = document.getElementById('dot');
    this.msg = document.getElementById('msg');
    this.skip = document.getElementById('skip');
    this.skipBar = this.skip.querySelector('.bar i');
    this.debug = document.getElementById('debug');
    this.title = document.getElementById('title');
    this._msgTimer = null;
  }

  hideTitle() { this.title.style.display = 'none'; }

  fadeIn(seconds = 1) {
    this.fade.classList.remove('instant');
    this.fade.style.transitionDuration = `${seconds}s`;
    this.fade.style.opacity = '0';
  }
  fadeToBlack(seconds = 1) {
    this.fade.classList.remove('instant');
    this.fade.style.transitionDuration = `${seconds}s`;
    this.fade.style.opacity = '1';
  }
  blackout() { // hard cut — no transition
    this.fade.classList.add('instant');
    this.fade.style.opacity = '1';
  }
  clearBlack() { // hard cut to picture
    this.fade.classList.add('instant');
    this.fade.style.opacity = '0';
  }

  showDot(on) { this.dot.style.opacity = on ? '1' : '0'; }

  showMessage(text, ms = 2500) {
    this.msg.textContent = text;
    this.msg.style.opacity = '1';
    clearTimeout(this._msgTimer);
    if (ms > 0) this._msgTimer = setTimeout(() => (this.msg.style.opacity = '0'), ms);
  }

  staggerFlash() {
    this.vignette.style.opacity = '1';
    setTimeout(() => (this.vignette.style.opacity = '0'), 350);
  }

  showSkip(on) { this.skip.style.opacity = on ? '1' : '0'; }
  setSkipProgress(f) { this.skipBar.style.width = `${Math.round(f * 100)}%`; }

  setDebug(text) {
    if (text === null) { this.debug.style.display = 'none'; return; }
    this.debug.style.display = 'block';
    this.debug.textContent = text;
  }
}
