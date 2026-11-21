import { CONTROLS, STORY } from './config.js';

const HUD_IDS = [
  'health-fill', 'health-text', 'money', 'packages', 'stars', 'objective', 'objective-dist',
  'speed', 'speed-unit', 'feed', 'crosshair', 'vignette', 'banner', 'banner-title',
  'banner-sub', 'floaters', 'minimap', 'title-screen', 'title-story', 'pause-screen',
  'end-screen', 'end-title', 'end-lines', 'briefing', 'briefing-name', 'briefing-text',
  'mission-name', 'mission-stage', 'mission-fill', 'mission-progress', 'dialogue-speaker',
  'dialogue-text', 'portrait', 'police-list', 'response-panel', 'car-name',
];

export function createHud() {
  const root = document.getElementById('hud');
  const elements = Object.fromEntries(HUD_IDS.map((id) => [id, document.getElementById(id)]));
  const map = elements.minimap.getContext('2d');
  const rendered = { health: null, money: null, objective: null, distance: null, speed: null, crosshair: null, mission: '', police: '', vehicle: null, packages: null };
  let bannerTimeout = 0;
  let floatId = 0;

  function setHealth(value, maximum) {
    const percent = Math.max(0, Math.min(100, (value / maximum) * 100));
    const stamp = String(Math.ceil(percent));
    if (stamp === rendered.health) return;
    rendered.health = stamp;
    elements['health-fill'].style.width = `${percent}%`;
    elements['health-fill'].style.background = percent > 50 ? '#58c96b' : percent > 25 ? '#e8a832' : '#d8382e';
    elements['health-text'].textContent = String(Math.ceil(value));
  }

  function setMoney(amount) {
    if (amount === rendered.money) return;
    rendered.money = amount;
    elements.money.textContent = `$${amount.toLocaleString('en-US')}`;
  }

  function setPackages(count, total) {
    const stamp = `${count}/${total}`;
    if (stamp === rendered.packages) return;
    rendered.packages = stamp;
    elements.packages.textContent = `PACKAGES  ${stamp}`;
  }

  function setStars(level) {
    const stars = Array.from({ length: 5 }, (_, i) => `<span class="${i < level ? 'star on' : 'star'}">★</span>`);
    elements.stars.innerHTML = stars.join('');
    elements.stars.classList.toggle('hot', level >= 3);
  }

  function setObjective(text, distance) {
    const label = text || '';
    const meters = distance == null ? '' : `${Math.round(distance)}m`;
    if (label === rendered.objective && meters === rendered.distance) return;
    rendered.objective = label;
    rendered.distance = meters;
    elements.objective.textContent = label;
    elements['objective-dist'].textContent = meters;
    elements.objective.parentElement.style.display = label ? 'block' : 'none';
  }

  function setSpeed(kmh, driving) {
    const value = driving ? String(Math.round(kmh)) : '';
    if (value === rendered.speed) return;
    rendered.speed = value;
    elements.speed.textContent = value;
    elements['speed-unit'].textContent = driving ? 'km/h' : '';
  }

  function setMission(mission, phase, completed = 0) {
    if (!mission) {
      elements['mission-name'].textContent = STORY.title;
      elements['mission-stage'].textContent = 'FREE ROAM';
      elements['mission-progress'].textContent = `${completed}/3 JOBS`;
      elements['mission-fill'].style.width = `${Math.max(0, Math.min(100, completed / 3 * 100))}%`;
      elements['dialogue-speaker'].textContent = STORY.title;
      elements.portrait.textContent = 'SB';
      elements['dialogue-text'].textContent = STORY.tagline;
      return;
    }
    const leg = phase === 'deliver' || phase === 'done' ? 2 : 1;
    const progress = Math.max(0, Math.min(1, (mission.id - 1 + (leg === 2 ? 1 : 0)) / 3));
    const key = [mission.id, mission.name, phase, completed, progress].join('|');
    if (key === rendered.mission) return;
    rendered.mission = key;
    elements['mission-name'].textContent = mission.name.toUpperCase();
    elements['mission-stage'].textContent = `STAGE ${mission.id}/3  •  LEG ${leg}/2`;
    elements['mission-progress'].textContent = `${completed}/3 JOBS`;
    elements['mission-fill'].style.width = `${Math.max(10, progress * 100)}%`;
    elements['dialogue-speaker'].textContent = mission.client || STORY.title;
    elements.portrait.textContent = (mission.client || 'SB').split(/\s+/).map((word) => word[0]).slice(0, 2).join('').toUpperCase();
    elements['dialogue-text'].textContent = (phase === 'deliver' ? mission.returnObjective : mission.objective) || mission.briefing;
  }

  function setPoliceResponse(cars, player, wanted) {
    const rows = cars.slice(0, 4).map((car, index) => {
      const dx = car.x - player.x;
      const dz = car.z - player.z;
      const distance = Math.round(Math.hypot(dx, dz));
      const heading = player.heading || 0;
      const lateral = Math.abs(dx * Math.cos(heading) - dz * Math.sin(heading));
      const forward = dx * Math.sin(heading) + dz * Math.cos(heading);
      let status = 'CLEAR';
      if (distance < 4) status = 'RAMMING';
      else if (lateral > 5) status = 'FLANKING';
      else if (wanted > 0 && forward > 0 && distance < 22) status = 'ROADBLOCK';
      else if (wanted > 0) status = 'PURSUIT';
      return { label: `POLICE ${String(index + 1).padStart(2, '0')}`, status, distance };
    });
    const key = rows.map(({ label, status, distance }) => `${label}:${status}:${distance}`).join('|');
    if (key === rendered.police) return;
    rendered.police = key;
    const fragment = document.createDocumentFragment();
    for (const row of rows) {
      const line = document.createElement('div');
      const label = document.createElement('span');
      const status = document.createElement('b');
      const distance = document.createElement('i');
      line.className = 'response-row';
      label.textContent = row.label;
      status.textContent = row.status;
      distance.textContent = `${row.distance}m`;
      line.append(label, status, distance);
      fragment.appendChild(line);
    }
    elements['police-list'].replaceChildren(fragment);
    elements['response-panel'].style.display = rows.length ? 'block' : 'none';
  }

  function setVehicleInfo(driving, modelName) {
    const label = driving ? modelName || 'SPORT GT' : 'ON FOOT';
    if (label === rendered.vehicle) return;
    rendered.vehicle = label;
    elements['car-name'].textContent = label;
  }

  function message(text, ms = 4200, pinned = false) {
    const line = document.createElement('div');
    line.className = 'feed-line';
    line.textContent = text;
    if (pinned) line.dataset.pinned = 'true';
    elements.feed.appendChild(line);
    while (elements.feed.children.length > 4) {
      const expendable = [...elements.feed.children].find((child) => !child.dataset.pinned);
      if (!expendable) break;
      expendable.remove();
    }
    if (!pinned) {
      setTimeout(() => {
        line.classList.add('fade');
        setTimeout(() => line.remove(), 600);
      }, ms);
    }
  }

  function banner(title, subtitle, ms = 2600) {
    elements['banner-title'].textContent = title;
    elements['banner-sub'].textContent = subtitle || '';
    elements.banner.classList.add('show');
    clearTimeout(bannerTimeout);
    bannerTimeout = setTimeout(() => elements.banner.classList.remove('show'), ms);
  }

  function floater(position, text, kind, project) {
    const screenPoint = project(position);
    if (!screenPoint || screenPoint.behind) return;
    const node = document.createElement('div');
    node.className = `floater ${kind || ''}`;
    node.textContent = text;
    node.style.left = `${screenPoint.x}px`;
    node.style.top = `${screenPoint.y}px`;
    node.id = `floater-${++floatId}`;
    elements.floaters.appendChild(node);
    requestAnimationFrame(() => node.classList.add('rise'));
    setTimeout(() => node.remove(), 1100);
  }

  function damageFlash() {
    const veil = elements.vignette;
    veil.classList.remove('hit');
    void veil.offsetWidth;
    veil.classList.add('hit');
  }

  function drawMinimap(view) {
    const size = 200;
    const width = view.worldSize;
    const project = (x, z) => [((x + width / 2) / width) * size, ((z + width / 2) / width) * size];
    map.clearRect(0, 0, size, size);
    map.fillStyle = 'rgba(16, 20, 26, 0.92)';
    map.fillRect(0, 0, size, size);
    const beach = ((196 + width / 2) / width) * size;
    const sea = ((232 + width / 2) / width) * size;
    map.fillStyle = '#e8d5a2';
    map.fillRect(0, beach, size, size - beach);
    map.fillStyle = '#2e7f9e';
    map.fillRect(0, sea, size, size - sea);
    map.strokeStyle = '#5a6068';
    map.lineWidth = 5;
    for (const road of view.streets) {
      const [x, z] = project(road, road);
      map.beginPath(); map.moveTo(x, 0); map.lineTo(x, size); map.stroke();
      map.beginPath(); map.moveTo(0, z); map.lineTo(size, z); map.stroke();
    }
    if (view.marker) {
      const [x, z] = project(view.marker.x, view.marker.z);
      const radius = 6 + Math.sin(performance.now() / 220) * 2;
      map.fillStyle = '#ffd75e';
      map.beginPath(); map.moveTo(x, z - radius); map.lineTo(x + radius, z); map.lineTo(x, z + radius); map.lineTo(x - radius, z); map.closePath(); map.fill();
      map.strokeStyle = '#fff2c0'; map.lineWidth = 1.5; map.stroke();
    }
    const dots = (values, fill, half, square = true) => {
      map.fillStyle = fill;
      for (const item of values || []) {
        const [x, z] = project(item.x, item.z);
        if (square) map.fillRect(x - half, z - half, half * 2, half * 2);
        else { map.beginPath(); map.arc(x, z, half, 0, Math.PI * 2); map.fill(); }
      }
    };
    dots(view.traffic, '#e8c832', 1.5);
    dots(view.peds, '#9aa4ac', 1, false);
    const flashing = Math.floor(performance.now() / 300) % 2 === 0;
    dots(view.police, flashing ? '#ff4040' : '#4070ff', 2.5);
    const [playerX, playerZ] = project(view.player.x, view.player.z);
    map.save();
    map.translate(playerX, playerZ);
    map.rotate(view.player.heading);
    map.fillStyle = '#ffffff';
    map.beginPath(); map.moveTo(0, -7); map.lineTo(5, 5); map.lineTo(-5, 5); map.closePath(); map.fill();
    map.restore();
  }

  function showTitle(save) {
    elements['title-story'].innerHTML = STORY.intro.map((line) => `<p>${line}</p>`).join('');
    document.getElementById('title-continue').style.display = save ? 'inline-block' : 'none';
    elements['title-screen'].classList.add('show');
    elements['pause-screen'].classList.remove('show');
    elements['end-screen'].classList.remove('show');
    root.classList.add('title-mode');
  }

  function hideScreens() {
    for (const id of ['title-screen', 'pause-screen', 'end-screen']) elements[id].classList.remove('show');
    root.classList.remove('title-mode');
  }

  function showEnd(kind, lines) {
    const heading = kind === 'wasted' ? 'WASTED' : kind === 'busted' ? 'BUSTED' : 'SOLMAR BAY';
    elements['end-title'].textContent = heading;
    elements['end-lines'].innerHTML = lines.map((line) => `<p>${line}</p>`).join('');
    elements['end-screen'].classList.add('show');
  }

  function showBriefing(mission) {
    elements['briefing-name'].textContent = `JOB ${mission.id}: ${mission.name} — ${mission.client}`;
    elements['briefing-text'].textContent = mission.briefing;
    elements.briefing.classList.add('show');
    setTimeout(() => elements.briefing.classList.remove('show'), 7000);
  }

  function setCrosshair(visible) {
    if (visible === rendered.crosshair) return;
    rendered.crosshair = visible;
    elements.crosshair.style.display = visible ? 'block' : 'none';
  }

  return {
    els: elements, setHealth, setMoney, setPackages, setStars, setObjective, setSpeed,
    setMission, setPoliceResponse, setVehicleInfo, message, banner, floater, damageFlash,
    drawMinimap, showTitle, hideScreens, showPause: () => elements['pause-screen'].classList.add('show'),
    hidePause: () => elements['pause-screen'].classList.remove('show'), showEnd, showBriefing, setCrosshair,
  };
}

export function buildHudDom() {
  const controls = CONTROLS.map(([key, label]) => `<div class="control-row"><span class="key">${key}</span><span>${label}</span></div>`).join('');
  const markup = `
    <div id="hud">
      <section id="mission-panel" class="hud-panel"><div class="eyebrow">SOLMAR BAY / MISSION CONTROL</div><strong id="mission-name">${STORY.title}</strong><div class="mission-meta"><span id="mission-stage">FREE ROAM</span><span id="mission-progress">0/3 JOBS</span></div><div class="progress-track"><div id="mission-fill"></div></div></section>
      <div id="top-left"><div id="health-bar"><div id="health-fill"></div><span id="health-text">100</span></div><div id="armor-bar"><i></i><span>ARMOR</span></div><div id="money">$250</div><div id="packages">PACKAGES  0/12</div></div>
      <div id="top-right"><div id="stars"></div></div>
      <section id="response-panel" class="hud-panel"><div class="eyebrow">POLICE RESPONSE</div><div id="police-list"></div></section>
      <div id="objective-box"><div id="objective"></div><div id="objective-dist"></div></div>
      <div id="speed-box"><div><span id="speed"></span><span id="speed-unit"></span></div><div id="car-name">ON FOOT</div><div id="radio-line">RADIO • SOLMAR FM</div></div>
      <canvas id="minimap" width="200" height="200"></canvas>
      <div id="weapon-row" aria-label="Weapon slots"><div class="weapon-slot active"><small>1</small><b>✊</b><span>FIST</span><i>—</i></div><div class="weapon-slot"><small>2</small><b>▣</b><span>9MM</span><i>—</i></div><div class="weapon-slot empty"><small>3</small><b>—</b><span>EMPTY</span><i>—</i></div><div class="weapon-slot empty"><small>4</small><b>—</b><span>EMPTY</span><i>—</i></div></div>
      <div id="dialogue-bar"><div id="portrait">SB</div><div><small id="dialogue-speaker">SOLMAR BAY</small><span id="dialogue-text">${STORY.tagline}</span></div></div>
      <div id="feed"></div><div id="crosshair">+</div><div id="vignette"></div><div id="banner"><div id="banner-title"></div><div id="banner-sub"></div></div><div id="floaters"></div>
      <div id="title-screen" class="screen"><div class="panel"><h1>${STORY.title}</h1><p class="tagline">${STORY.tagline}</p><div id="title-story"></div><div class="buttons"><button id="title-start">Start</button><button id="title-continue">Continue</button></div><div class="controls">${controls}</div></div></div>
      <div id="pause-screen" class="screen"><div class="panel"><h1>Paused</h1><div class="buttons"><button id="pause-resume">Resume</button><button id="pause-restart">Restart mission</button><button id="pause-quit">Save &amp; quit to title</button></div><div class="controls">${controls}</div></div></div>
      <div id="end-screen" class="screen"><div class="panel"><h1 id="end-title">WASTED</h1><div id="end-lines"></div><div class="buttons"><button id="end-retry">Try again</button><button id="end-title-btn">Title screen</button></div></div></div>
      <div id="briefing"><div id="briefing-name"></div><div id="briefing-text"></div></div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', markup);

  const css = `
    #hud.title-mode #mission-panel,#hud.title-mode #response-panel,#hud.title-mode #weapon-row,#hud.title-mode #dialogue-bar{display:none}
    .hud-panel{position:absolute;box-sizing:border-box;padding:10px 12px;background:linear-gradient(135deg,rgba(12,20,29,.88),rgba(20,30,39,.68));border:1px solid rgba(220,237,244,.24);border-left:3px solid #f3b26e;box-shadow:0 5px 18px rgba(0,0,0,.38);backdrop-filter:blur(3px);text-shadow:0 1px 3px #000}
    #mission-panel{left:14px;top:14px;width:278px;min-height:92px}.eyebrow{color:#f5c893;font:700 10px/1.2 system-ui,sans-serif;letter-spacing:1.5px}
    #mission-name{display:block;margin:5px 0 8px;font-size:18px;line-height:1.05;letter-spacing:.6px}.mission-meta{display:flex;justify-content:space-between;color:#d5e0e7;font:700 10px/1.2 system-ui,sans-serif;letter-spacing:.5px}
    .progress-track{height:5px;margin-top:6px;overflow:hidden;background:rgba(255,255,255,.17)}#mission-fill{height:100%;width:0;background:linear-gradient(90deg,#ff9d54,#ffe09c);transition:width .3s ease}
    #top-left{position:absolute;top:166px;left:14px}#health-bar{position:relative;width:250px;height:18px;border-radius:2px}#armor-bar{position:relative;box-sizing:border-box;width:250px;height:9px;margin-top:4px;background:rgba(10,14,20,.64);border:1px solid rgba(255,255,255,.24)}#armor-bar i{display:block;width:0;height:100%;background:#76cce0}#armor-bar span{position:absolute;top:-1px;right:4px;color:#d4e5e9;font-size:8px;letter-spacing:1px}
    #money{position:fixed;top:8px;right:16px;margin:0;color:#9ff5ad;font-size:40px;line-height:1.05}#packages{margin-top:5px;color:#ffe09c;font:800 10px/1.2 system-ui,sans-serif;letter-spacing:1px;text-shadow:0 1px 3px #000}
    #top-right{position:absolute;top:52px;right:16px}#stars{font-size:29px}#objective-box{position:absolute;top:14px;left:50%;max-width:440px;transform:translateX(-50%);text-align:center}
    #response-panel{display:none;top:242px;left:14px;width:278px;padding:9px 11px;border-left-color:#84bdd2}#police-list{margin-top:5px}.response-row{display:grid;grid-template-columns:1fr auto 34px;gap:7px;align-items:center;min-height:20px;color:#eff5f6;font:700 10px/1.2 system-ui,sans-serif;letter-spacing:.35px}.response-row b{color:#ffb06e;font-size:9px}.response-row i{color:#cbd7dd;font-style:normal;text-align:right}
    #minimap{width:180px;height:180px}#weapon-row{position:absolute;bottom:82px;left:50%;display:flex;gap:5px;transform:translateX(-50%)}
    .weapon-slot{position:relative;display:grid;grid-template-columns:23px 44px 31px;align-items:center;box-sizing:border-box;width:108px;height:43px;padding:5px 7px;background:rgba(10,16,23,.84);border:1px solid rgba(230,240,244,.34);box-shadow:0 3px 10px rgba(0,0,0,.32)}.weapon-slot.active{border-color:#ffc66e;background:rgba(52,40,27,.9)}.weapon-slot small{position:absolute;top:2px;left:4px;color:#cbd7dd;font:700 8px system-ui,sans-serif}.weapon-slot b{grid-column:1;grid-row:1;margin-top:7px;color:#f1d7a8;font-size:17px;text-align:center}.weapon-slot span{grid-column:2;grid-row:1;margin-top:7px;color:#f4f6f7;font:800 10px system-ui,sans-serif;letter-spacing:.5px}.weapon-slot i{grid-column:3;grid-row:1;margin-top:7px;color:#d4e0e5;font:700 10px system-ui,sans-serif;font-style:normal;text-align:right}.weapon-slot.empty{opacity:.68}
    #dialogue-bar{position:absolute;bottom:14px;left:50%;display:flex;align-items:center;gap:10px;box-sizing:border-box;width:min(540px,calc(100vw - 500px));min-height:50px;padding:6px 11px 6px 7px;transform:translateX(-50%);background:linear-gradient(90deg,rgba(12,18,25,.9),rgba(12,18,25,.68));border-left:3px solid #ffd06f;box-shadow:0 4px 14px rgba(0,0,0,.35)}
    #portrait{display:grid;flex:0 0 38px;width:38px;height:38px;place-items:center;background:linear-gradient(145deg,#b96b4f,#e6bd8d);border:1px solid rgba(255,255,255,.45);color:#fff;font:900 12px system-ui,sans-serif;text-shadow:0 1px 3px #000}#dialogue-bar small{display:block;margin-bottom:2px;color:#f4c68d;font:800 9px system-ui,sans-serif;letter-spacing:1.2px}#dialogue-text{display:block;overflow:hidden;color:#f2f4f5;font:600 12px/1.25 system-ui,sans-serif;text-overflow:ellipsis;white-space:nowrap}
    #speed-box{right:18px;bottom:14px;min-width:190px;padding:6px 10px;background:linear-gradient(135deg,rgba(12,18,25,.12),rgba(12,18,25,.72))}#speed{font-size:48px;line-height:1}#car-name{margin-top:2px;color:#f4f3e9;font:900 13px system-ui,sans-serif;letter-spacing:1.2px}#radio-line{margin-top:2px;color:#bed0d6;font:700 9px system-ui,sans-serif;letter-spacing:1px}#feed{top:114px;bottom:auto}
    @media(max-width:800px){#mission-panel,#response-panel{width:220px}#mission-panel{min-height:88px}#objective-box{max-width:220px}#top-left{top:160px}#response-panel{top:236px}#health-bar,#armor-bar{width:205px}#dialogue-bar{width:calc(100vw - 500px)}.weapon-slot{width:84px;grid-template-columns:18px 35px 24px}}
  `;
  const stylesheet = document.createElement('style');
  stylesheet.textContent = css;
  document.head.appendChild(stylesheet);
}
