// The HUD: health, money, wanted stars, objective text, speed, a live
// minimap canvas, message feed, floating numbers, and the title, briefing,
// pause, wasted and busted screens. All DOM — the 3D canvas stays clean.

import { CONTROLS, STORY } from './config.js';

export function createHud() {
  const root = document.getElementById('hud');
  const els = {};
  for (const id of ['health-fill', 'health-text', 'money', 'stars', 'objective', 'objective-dist', 'speed', 'speed-unit', 'feed', 'crosshair', 'vignette', 'banner', 'banner-title', 'banner-sub', 'floaters', 'minimap', 'title-screen', 'title-story', 'pause-screen', 'end-screen', 'end-title', 'end-lines', 'briefing', 'briefing-name', 'briefing-text']) {
    els[id] = document.getElementById(id);
  }
  const mapCtx = els.minimap.getContext('2d');
  let bannerTimer = null;
  let floaterSeq = 0;
  // DOM writes are cached: the HUD setters run every frame, but a write
  // only happens when the value actually changed.
  let lastHealth = null;
  let lastMoney = null;
  let lastObjective = null;
  let lastObjectiveDist = null;
  let lastSpeed = null;
  let lastCrosshair = null;

  function setHealth(hp, max) {
    const pct = Math.max(0, Math.min(100, (hp / max) * 100));
    const key = `${Math.ceil(pct)}`;
    if (key === lastHealth) return;
    lastHealth = key;
    els['health-fill'].style.width = `${pct}%`;
    els['health-fill'].style.background = pct > 50 ? '#58c96b' : pct > 25 ? '#e8a832' : '#d8382e';
    els['health-text'].textContent = `${Math.ceil(hp)}`;
  }

  function setMoney(amount) {
    if (amount === lastMoney) return;
    lastMoney = amount;
    els.money.textContent = `$${amount.toLocaleString('en-US')}`;
  }

  function setStars(n) {
    let html = '';
    for (let i = 0; i < 5; i += 1) {
      html += `<span class="${i < n ? 'star on' : 'star'}">★</span>`;
    }
    els.stars.innerHTML = html;
    els.stars.classList.toggle('hot', n >= 3);
  }

  function setObjective(text, dist) {
    const d = dist === null || dist === undefined ? '' : `${Math.round(dist)}m`;
    if (text === lastObjective && d === lastObjectiveDist) return;
    lastObjective = text;
    lastObjectiveDist = d;
    els.objective.textContent = text || '';
    els['objective-dist'].textContent = d;
    els.objective.parentElement.style.display = text ? 'block' : 'none';
  }

  function setSpeed(kmh, driving) {
    const key = driving ? String(Math.round(kmh)) : '';
    if (key === lastSpeed) return;
    lastSpeed = key;
    els.speed.textContent = key;
    els['speed-unit'].textContent = driving ? 'km/h' : '';
  }

  function message(text, ms = 4200) {
    const div = document.createElement('div');
    div.className = 'feed-line';
    div.textContent = text;
    els.feed.appendChild(div);
    while (els.feed.children.length > 4) els.feed.removeChild(els.feed.firstChild);
    setTimeout(() => {
      div.classList.add('fade');
      setTimeout(() => div.remove(), 600);
    }, ms);
  }

  function banner(title, sub, ms = 2600) {
    els['banner-title'].textContent = title;
    els['banner-sub'].textContent = sub || '';
    els.banner.classList.add('show');
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => els.banner.classList.remove('show'), ms);
  }

  function floater(worldPos, text, kind, project) {
    const p = project(worldPos);
    if (!p || p.behind) return;
    const div = document.createElement('div');
    div.className = `floater ${kind || ''}`;
    div.textContent = text;
    div.style.left = `${p.x}px`;
    div.style.top = `${p.y}px`;
    div.id = `floater-${floaterSeq += 1}`;
    els.floaters.appendChild(div);
    requestAnimationFrame(() => div.classList.add('rise'));
    setTimeout(() => div.remove(), 1100);
  }

  function damageFlash() {
    els.vignette.classList.remove('hit');
    void els.vignette.offsetWidth;
    els.vignette.classList.add('hit');
  }

  // Minimap: streets, blocks, player arrow, cars, police, pedestrians and
  // the mission marker, redrawn every frame from live positions.
  function drawMinimap(view) {
    const S = 200;
    const w = view.worldSize;
    const toMap = (x, z) => [((x + w / 2) / w) * S, ((z + w / 2) / w) * S];
    mapCtx.clearRect(0, 0, S, S);
    mapCtx.fillStyle = 'rgba(16, 20, 26, 0.92)';
    mapCtx.fillRect(0, 0, S, S);
    // Beach and sea.
    mapCtx.fillStyle = '#e8d5a2';
    mapCtx.fillRect(0, ((196 + w / 2) / w) * S, S, S - ((196 + w / 2) / w) * S);
    mapCtx.fillStyle = '#2e7f9e';
    mapCtx.fillRect(0, ((232 + w / 2) / w) * S, S, S - ((232 + w / 2) / w) * S);
    // Streets.
    mapCtx.strokeStyle = '#5a6068';
    mapCtx.lineWidth = 5;
    for (const s of view.streets) {
      const [px] = toMap(s, 0);
      mapCtx.beginPath();
      mapCtx.moveTo(px, 0);
      mapCtx.lineTo(px, S);
      mapCtx.stroke();
      const [, pz] = toMap(0, s);
      mapCtx.beginPath();
      mapCtx.moveTo(0, pz);
      mapCtx.lineTo(S, pz);
      mapCtx.stroke();
    }
    // Mission marker: pulsing gold diamond.
    if (view.marker) {
      const [mx, mz] = toMap(view.marker.x, view.marker.z);
      const pulse = 6 + Math.sin(performance.now() / 220) * 2;
      mapCtx.fillStyle = '#ffd75e';
      mapCtx.beginPath();
      mapCtx.moveTo(mx, mz - pulse);
      mapCtx.lineTo(mx + pulse, mz);
      mapCtx.lineTo(mx, mz + pulse);
      mapCtx.lineTo(mx - pulse, mz);
      mapCtx.closePath();
      mapCtx.fill();
      mapCtx.strokeStyle = '#fff2c0';
      mapCtx.lineWidth = 1.5;
      mapCtx.stroke();
    }
    // Traffic dots.
    mapCtx.fillStyle = '#e8c832';
    for (const c of view.traffic || []) {
      const [cx, cz] = toMap(c.x, c.z);
      mapCtx.fillRect(cx - 1.5, cz - 1.5, 3, 3);
    }
    // Pedestrian dots.
    mapCtx.fillStyle = '#9aa4ac';
    for (const p of view.peds || []) {
      const [px, pz] = toMap(p.x, p.z);
      mapCtx.fillRect(px - 1, pz - 1, 2, 2);
    }
    // Police: flashing blue-red squares.
    const policeOn = Math.floor(performance.now() / 300) % 2 === 0;
    mapCtx.fillStyle = policeOn ? '#ff4040' : '#4070ff';
    for (const p of view.police || []) {
      const [px, pz] = toMap(p.x, p.z);
      mapCtx.fillRect(px - 2.5, pz - 2.5, 5, 5);
    }
    // Player arrow.
    const [px, pz] = toMap(view.player.x, view.player.z);
    mapCtx.save();
    mapCtx.translate(px, pz);
    mapCtx.rotate(view.player.heading);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -7);
    mapCtx.lineTo(5, 5);
    mapCtx.lineTo(-5, 5);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
  }

  function showTitle(save) {
    els['title-story'].innerHTML = STORY.intro.map((line) => `<p>${line}</p>`).join('');
    document.getElementById('title-continue').style.display = save ? 'inline-block' : 'none';
    els['title-screen'].classList.add('show');
    els['pause-screen'].classList.remove('show');
    els['end-screen'].classList.remove('show');
    root.classList.add('title-mode');
  }

  function hideScreens() {
    els['title-screen'].classList.remove('show');
    els['pause-screen'].classList.remove('show');
    els['end-screen'].classList.remove('show');
    root.classList.remove('title-mode');
  }

  function showPause() {
    els['pause-screen'].classList.add('show');
  }

  function hidePause() {
    els['pause-screen'].classList.remove('show');
  }

  function showEnd(kind, lines) {
    els['end-title'].textContent = kind === 'wasted' ? 'WASTED' : kind === 'busted' ? 'BUSTED' : 'SOLMAR BAY';
    els['end-lines'].innerHTML = lines.map((line) => `<p>${line}</p>`).join('');
    els['end-screen'].classList.add('show');
  }

  function showBriefing(mission) {
    els['briefing-name'].textContent = `JOB ${mission.id}: ${mission.name} — ${mission.client}`;
    els['briefing-text'].textContent = mission.briefing;
    els.briefing.classList.add('show');
    setTimeout(() => els.briefing.classList.remove('show'), 7000);
  }

  function setCrosshair(visible) {
    if (visible === lastCrosshair) return;
    lastCrosshair = visible;
    els.crosshair.style.display = visible ? 'block' : 'none';
  }

  return {
    els,
    setHealth, setMoney, setStars, setObjective, setSpeed,
    message, banner, floater, damageFlash, drawMinimap,
    showTitle, hideScreens, showPause, hidePause, showEnd, showBriefing, setCrosshair,
  };
}

// Build the static HUD DOM once. Kept in JS so index.html stays small.
export function buildHudDom() {
  const controls = CONTROLS.map(([k, v]) => `<div class="control-row"><span class="key">${k}</span><span>${v}</span></div>`).join('');
  document.body.innerHTML += `
  <div id="hud">
    <div id="top-left">
      <div id="health-bar"><div id="health-fill"></div><span id="health-text">100</span></div>
      <div id="money">$250</div>
    </div>
    <div id="top-right"><div id="stars"></div></div>
    <div id="objective-box"><div id="objective"></div><div id="objective-dist"></div></div>
    <div id="speed-box"><span id="speed"></span><span id="speed-unit"></span></div>
    <canvas id="minimap" width="200" height="200"></canvas>
    <div id="feed"></div>
    <div id="crosshair">+</div>
    <div id="vignette"></div>
    <div id="banner"><div id="banner-title"></div><div id="banner-sub"></div></div>
    <div id="floaters"></div>
    <div id="title-screen" class="screen">
      <div class="panel">
        <h1>${STORY.title}</h1>
        <p class="tagline">${STORY.tagline}</p>
        <div id="title-story"></div>
        <div class="buttons">
          <button id="title-start">Start</button>
          <button id="title-continue">Continue</button>
        </div>
        <div class="controls">${controls}</div>
      </div>
    </div>
    <div id="pause-screen" class="screen">
      <div class="panel">
        <h1>Paused</h1>
        <div class="buttons">
          <button id="pause-resume">Resume</button>
          <button id="pause-restart">Restart mission</button>
          <button id="pause-quit">Save &amp; quit to title</button>
        </div>
        <div class="controls">${controls}</div>
      </div>
    </div>
    <div id="end-screen" class="screen">
      <div class="panel">
        <h1 id="end-title">WASTED</h1>
        <div id="end-lines"></div>
        <div class="buttons">
          <button id="end-retry">Try again</button>
          <button id="end-title-btn">Title screen</button>
        </div>
      </div>
    </div>
    <div id="briefing"><div id="briefing-name"></div><div id="briefing-text"></div></div>
  </div>`;
}
