// The HUD: health, money, wanted stars, objective text, speed, a live
// minimap canvas, message feed, floating numbers, and the title, briefing,
// pause, wasted and busted screens. All DOM — the 3D canvas stays clean.

import { CONTROLS, STORY } from './config.js';

export function createHud() {
  const root = document.getElementById('hud');
  const els = {};
  for (const id of ['health-fill', 'health-text', 'money', 'stars', 'objective', 'objective-dist', 'speed', 'speed-unit', 'feed', 'crosshair', 'vignette', 'banner', 'banner-title', 'banner-sub', 'floaters', 'minimap', 'title-screen', 'title-story', 'pause-screen', 'end-screen', 'end-title', 'end-lines', 'briefing', 'briefing-name', 'briefing-text', 'mission-name', 'mission-stage', 'mission-fill', 'mission-progress', 'dialogue-speaker', 'dialogue-text', 'portrait', 'police-list', 'response-panel', 'car-name']) {
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
  let lastMissionKey = '';
  let lastPoliceKey = '';
  let lastVehicleInfo = null;

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

  function setMission(mission, phase, completed = 0) {
    if (!mission) {
      els['mission-name'].textContent = STORY.title;
      els['mission-stage'].textContent = 'FREE ROAM';
      els['mission-progress'].textContent = `${completed}/3 JOBS`;
      els['mission-fill'].style.width = `${Math.max(0, Math.min(100, (completed / 3) * 100))}%`;
      els['dialogue-speaker'].textContent = STORY.title;
      els.portrait.textContent = 'SB';
      els['dialogue-text'].textContent = STORY.tagline;
      return;
    }
    const stage = phase === 'deliver' || phase === 'done' ? 2 : 1;
    const overall = Math.max(0, Math.min(1, ((mission.id - 1) + (stage - 1) * 0.5 + (stage === 2 ? 0.5 : 0)) / 3));
    const key = `${mission.id}|${mission.name}|${phase}|${completed}|${overall}`;
    if (key === lastMissionKey) return;
    lastMissionKey = key;
    els['mission-name'].textContent = mission.name.toUpperCase();
    els['mission-stage'].textContent = `STAGE ${mission.id}/3  •  LEG ${stage}/2`;
    els['mission-progress'].textContent = `${completed}/3 JOBS`;
    els['mission-fill'].style.width = `${Math.max(10, overall * 100)}%`;
    const text = phase === 'deliver' ? mission.returnObjective : mission.objective;
    els['dialogue-speaker'].textContent = mission.client || STORY.title;
    els.portrait.textContent = (mission.client || 'SB').split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
    els['dialogue-text'].textContent = text || mission.briefing;
  }

  function setPoliceResponse(cars, player, wanted) {
    const rows = cars.slice(0, 4).map((car, index) => {
      const dx = car.x - player.x;
      const dz = car.z - player.z;
      const distance = Math.round(Math.hypot(dx, dz));
      const side = Math.abs(dx * Math.cos(player.heading || 0) - dz * Math.sin(player.heading || 0));
      const ahead = dx * Math.sin(player.heading || 0) + dz * Math.cos(player.heading || 0);
      const status = distance < 4 ? 'RAMMING' : side > 5 ? 'FLANKING' : wanted > 0 && ahead > 0 && distance < 22 ? 'ROADBLOCK' : wanted > 0 ? 'PURSUIT' : 'CLEAR';
      return { name: `POLICE ${String(index + 1).padStart(2, '0')}`, status, distance };
    });
    const key = rows.map((row) => `${row.name}:${row.status}:${row.distance}`).join('|');
    if (key === lastPoliceKey) return;
    lastPoliceKey = key;
    els['police-list'].replaceChildren();
    for (const row of rows) {
      const line = document.createElement('div');
      line.className = 'response-row';
      const label = document.createElement('span');
      label.textContent = row.name;
      const status = document.createElement('b');
      status.textContent = row.status;
      const distance = document.createElement('i');
      distance.textContent = `${row.distance}m`;
      line.append(label, status, distance);
      els['police-list'].appendChild(line);
    }
    els['response-panel'].style.display = rows.length ? 'block' : 'none';
  }

  function setVehicleInfo(driving, modelName) {
    const value = driving ? (modelName || 'SPORT GT') : 'ON FOOT';
    if (value === lastVehicleInfo) return;
    lastVehicleInfo = value;
    els['car-name'].textContent = value;
  }

  function message(text, ms = 4200, pinned = false) {
    const div = document.createElement('div');
    div.className = 'feed-line';
    div.textContent = text;
    if (pinned) div.dataset.pinned = 'true';
    els.feed.appendChild(div);
    while (els.feed.children.length > 4) {
      const oldest = Array.from(els.feed.children).find((line) => !line.dataset.pinned);
      if (!oldest) break;
      oldest.remove();
    }
    // Staged screenshot callouts must survive slow rendering and later
    // messages. Ordinary gameplay messages retain their existing lifetime.
    if (pinned) return;
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
    setMission, setPoliceResponse, setVehicleInfo,
    message, banner, floater, damageFlash, drawMinimap,
    showTitle, hideScreens, showPause, hidePause, showEnd, showBriefing, setCrosshair,
  };
}

// Build the static HUD DOM once. Kept in JS so index.html stays small.
export function buildHudDom() {
  const controls = CONTROLS.map(([k, v]) => `<div class="control-row"><span class="key">${k}</span><span>${v}</span></div>`).join('');
  document.body.innerHTML += `
  <div id="hud">
    <div id="mission-panel" class="hud-panel">
      <div class="eyebrow">SOLMAR BAY  /  MISSION CONTROL</div>
      <strong id="mission-name">${STORY.title}</strong>
      <div class="mission-meta"><span id="mission-stage">FREE ROAM</span><span id="mission-progress">0/3 JOBS</span></div>
      <div class="progress-track"><div id="mission-fill"></div></div>
    </div>
    <div id="top-left">
      <div id="health-bar"><div id="health-fill"></div><span id="health-text">100</span></div>
      <div id="armor-bar"><i></i><span>ARMOR</span></div>
      <div id="money">$250</div>
    </div>
    <div id="top-right"><div id="stars"></div></div>
    <div id="response-panel" class="hud-panel"><div class="eyebrow">POLICE RESPONSE</div><div id="police-list"></div></div>
    <div id="objective-box"><div id="objective"></div><div id="objective-dist"></div></div>
    <div id="speed-box"><div><span id="speed"></span><span id="speed-unit"></span></div><div id="car-name">ON FOOT</div><div id="radio-line">RADIO  •  SOLMAR FM</div></div>
    <canvas id="minimap" width="200" height="200"></canvas>
    <div id="weapon-row" aria-label="Weapon slots">
      <div class="weapon-slot active"><small>1</small><b>✊</b><span>FIST</span><i>—</i></div>
      <div class="weapon-slot"><small>2</small><b>▣</b><span>9MM</span><i>—</i></div>
      <div class="weapon-slot empty"><small>3</small><b>—</b><span>EMPTY</span><i>—</i></div>
      <div class="weapon-slot empty"><small>4</small><b>—</b><span>EMPTY</span><i>—</i></div>
    </div>
    <div id="dialogue-bar"><div id="portrait">SB</div><div><small id="dialogue-speaker">SOLMAR BAY</small><span id="dialogue-text">${STORY.tagline}</span></div></div>
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
  const style = document.createElement('style');
  style.textContent = `
    #hud.title-mode #mission-panel, #hud.title-mode #response-panel, #hud.title-mode #weapon-row, #hud.title-mode #dialogue-bar { display:none; }
    .hud-panel { position:absolute; box-sizing:border-box; padding:10px 12px; background:linear-gradient(135deg,rgba(12,20,29,.88),rgba(20,30,39,.68)); border:1px solid rgba(220,237,244,.24); border-left:3px solid #f3b26e; box-shadow:0 5px 18px rgba(0,0,0,.38); backdrop-filter:blur(3px); text-shadow:0 1px 3px #000; }
    #mission-panel { left:14px; top:14px; width:278px; min-height:92px; }
    .eyebrow { color:#f5c893; font:700 10px/1.2 system-ui,sans-serif; letter-spacing:1.5px; }
    #mission-name { display:block; margin:5px 0 8px; font-size:18px; line-height:1.05; letter-spacing:.6px; }
    .mission-meta { display:flex; justify-content:space-between; color:#d5e0e7; font:700 10px/1.2 system-ui,sans-serif; letter-spacing:.5px; }
    .progress-track { height:5px; margin-top:6px; overflow:hidden; background:rgba(255,255,255,.17); }
    #mission-fill { height:100%; width:0; background:linear-gradient(90deg,#ff9d54,#ffe09c); transition:width .3s ease; }
    #top-left { top:166px; left:14px; }
    #health-bar { width:250px; height:18px; border-radius:2px; }
    #armor-bar { position:relative; width:250px; height:9px; margin-top:4px; background:rgba(10,14,20,.64); border:1px solid rgba(255,255,255,.24); box-sizing:border-box; }
    #armor-bar i { display:block; width:0; height:100%; background:#76cce0; }
    #armor-bar span { position:absolute; right:4px; top:-1px; color:#d4e5e9; font-size:8px; letter-spacing:1px; }
    #money { position:fixed; top:8px; right:16px; margin:0; color:#9ff5ad; font-size:40px; line-height:1.05; }
    #top-right { top:52px; right:16px; }
    #stars { font-size:29px; }
    #objective-box { top:14px; left:50%; transform:translateX(-50%); text-align:center; max-width:440px; }
    #response-panel { display:none; left:14px; top:242px; width:278px; padding:9px 11px; border-left-color:#84bdd2; }
    #police-list { margin-top:5px; }
    .response-row { display:grid; grid-template-columns:1fr auto 34px; gap:7px; align-items:center; min-height:20px; color:#eff5f6; font:700 10px/1.2 system-ui,sans-serif; letter-spacing:.35px; }
    .response-row b { color:#ffb06e; font-size:9px; }
    .response-row i { color:#cbd7dd; font-style:normal; text-align:right; }
    #minimap { width:180px; height:180px; }
    #weapon-row { position:absolute; left:50%; bottom:82px; transform:translateX(-50%); display:flex; gap:5px; }
    .weapon-slot { position:relative; display:grid; grid-template-columns:23px 44px 31px; align-items:center; width:108px; height:43px; box-sizing:border-box; padding:5px 7px; background:rgba(10,16,23,.84); border:1px solid rgba(230,240,244,.34); box-shadow:0 3px 10px rgba(0,0,0,.32); }
    .weapon-slot.active { border-color:#ffc66e; background:rgba(52,40,27,.9); }
    .weapon-slot small { position:absolute; left:4px; top:2px; color:#cbd7dd; font:700 8px system-ui,sans-serif; }
    .weapon-slot b { grid-column:1; grid-row:1; margin-top:7px; color:#f1d7a8; font-size:17px; text-align:center; }
    .weapon-slot span { grid-column:2; grid-row:1; margin-top:7px; color:#f4f6f7; font:800 10px system-ui,sans-serif; letter-spacing:.5px; }
    .weapon-slot i { grid-column:3; grid-row:1; margin-top:7px; color:#d4e0e5; font:700 10px system-ui,sans-serif; font-style:normal; text-align:right; }
    .weapon-slot.empty { opacity:.68; }
    #dialogue-bar { position:absolute; left:50%; transform:translateX(-50%); bottom:14px; display:flex; align-items:center; gap:10px; width:min(540px,calc(100vw - 500px)); min-height:50px; box-sizing:border-box; padding:6px 11px 6px 7px; background:linear-gradient(90deg,rgba(12,18,25,.9),rgba(12,18,25,.68)); border-left:3px solid #ffd06f; box-shadow:0 4px 14px rgba(0,0,0,.35); }
    #portrait { flex:0 0 38px; width:38px; height:38px; display:grid; place-items:center; background:linear-gradient(145deg,#b96b4f,#e6bd8d); border:1px solid rgba(255,255,255,.45); color:#fff; font:900 12px system-ui,sans-serif; text-shadow:0 1px 3px #000; }
    #dialogue-bar small { display:block; margin-bottom:2px; color:#f4c68d; font:800 9px system-ui,sans-serif; letter-spacing:1.2px; }
    #dialogue-text { display:block; overflow:hidden; color:#f2f4f5; font:600 12px/1.25 system-ui,sans-serif; text-overflow:ellipsis; white-space:nowrap; }
    #speed-box { right:18px; bottom:14px; min-width:190px; padding:6px 10px; background:linear-gradient(135deg,rgba(12,18,25,.12),rgba(12,18,25,.72)); }
    #speed { font-size:48px; line-height:1; }
    #car-name { margin-top:2px; color:#f4f3e9; font:900 13px system-ui,sans-serif; letter-spacing:1.2px; }
    #radio-line { margin-top:2px; color:#bed0d6; font:700 9px system-ui,sans-serif; letter-spacing:1px; }
    #feed { top:114px; bottom:auto; }
    @media (max-width:800px) { #mission-panel,#response-panel { width:220px; } #mission-panel { min-height:88px; } #objective-box { max-width:220px; } #top-left { top:160px; } #response-panel { top:236px; } #health-bar,#armor-bar { width:205px; } #dialogue-bar { width:calc(100vw - 500px); } .weapon-slot { width:84px; grid-template-columns:18px 35px 24px; } }
  `;
  document.head.appendChild(style);
}
