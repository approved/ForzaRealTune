const socket = io();

const CAR_CLASSES = ['D', 'C', 'B', 'A', 'S1', 'S2', 'R', 'X'];
const DRIVETRAINS = ['FWD', 'RWD', 'AWD'];

const $ = (id) => document.getElementById(id);

let isRecording = false;
let toastTimer = null;
let sampleHistory = [];
let selectedSampleIndex = -1;
let isLiveView = true;

// Trim state
let trimStart = 0;
let trimEnd = 0;
let isDraggingTrimStart = false;
let isDraggingTrimEnd = false;

// ---------- Toast ----------
function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2500);
}

// ---------- Status ----------
function updateStatus(connected) {
  const el = $('statusIndicator');
  const text = $('statusText');
  if (connected) {
    el.classList.add('connected');
    text.textContent = 'Connected';
  } else {
    el.classList.remove('connected');
    text.textContent = 'Disconnected';
  }
}

function updateRecordingUI(recording) {
  isRecording = recording;
  const btn = $('recordBtn');
  const label = $('recordLabel');
  const bar = $('recordingBar');
  const icon = btn.querySelector('.record-icon');
  if (recording) {
    btn.classList.add('recording');
    label.textContent = 'Stop';
    icon.style.color = 'var(--accent-red)';
    bar.classList.add('active');
    isLiveView = true;
  } else {
    btn.classList.remove('recording');
    label.textContent = 'Record';
    icon.style.color = '';
    bar.classList.remove('active');
  }
}

// ---------- Telemetry display ----------
function fillTelemetry(d, isPlayback) {
  const kmh = (d.speed * 3.6).toFixed(0);
  const mph = (d.speed * 2.237).toFixed(0);
  const hp = (d.power * 0.00134102).toFixed(0);
  const rpmPct = d.engineMaxRpm > 0 ? (d.currentEngineRpm / d.engineMaxRpm * 100) : 0;

  $('speedValue').textContent = kmh;
  $('speedMph').textContent = `${mph} mph`;
  $('rpmValue').textContent = d.currentEngineRpm.toFixed(0);
  $('rpmBar').style.width = `${rpmPct}%`;
  $('rpmBar').style.background = rpmPct > 90 ? 'var(--accent-red)' :
                                 rpmPct > 75 ? 'var(--accent-yellow)' : 'var(--accent-green)';
  $('gearValue').textContent = d.gear === 0 ? 'R' : d.gear;
  $('powerValue').textContent = hp;
  $('torqueValue').textContent = d.torque.toFixed(0);
  $('boostValue').textContent = d.boost.toFixed(1);
  $('fuelValue').textContent = (d.fuel * 100).toFixed(0);
  $('fuelBar').style.width = `${d.fuel * 100}%`;

  $('carClass').textContent = CAR_CLASSES[d.carClass] ?? d.carClass;
  $('carPi').textContent = d.carPerformanceIndex;
  $('carDrive').textContent = DRIVETRAINS[d.drivetrainType] ?? '?';
  $('carEngine').textContent = `${d.numCylinders}-cyl`;
  $('lapNumber').textContent = d.lapNumber || '--';
  $('racePosition').textContent = d.racePosition || '--';

  $('bestLap').textContent = formatTime(d.bestLap);
  $('lastLap').textContent = formatTime(d.lastLap);
  $('raceTime').textContent = d.currentRaceTime > 0 ? formatTime(d.currentRaceTime) : '--';

  $('accelValue').textContent = d.accel;
  $('accelBar').style.width = `${(d.accel / 255) * 100}%`;
  $('brakeValue').textContent = d.brake;
  $('brakeBar').style.width = `${(d.brake / 255) * 100}%`;
  $('clutchValue').textContent = d.clutch;
  $('clutchBar').style.width = `${(d.clutch / 255) * 100}%`;

  const steerPct = ((d.steer + 127) / 254) * 100;
  $('steerValue').textContent = d.steer;
  $('steerBar').style.width = `${Math.abs(steerPct - 50) * 2}%`;
  $('steerBar').style.marginLeft = d.steer < 0 ? `${steerPct}%` : '50%';

  const corners = [
    { id: 'Fl', temp: d.tireTemp.frontLeft, sr: d.tireSlipRatio.frontLeft, sa: d.tireSlipAngle.frontLeft, cs: d.tireCombinedSlip.frontLeft },
    { id: 'Fr', temp: d.tireTemp.frontRight, sr: d.tireSlipRatio.frontRight, sa: d.tireSlipAngle.frontRight, cs: d.tireCombinedSlip.frontRight },
    { id: 'Rl', temp: d.tireTemp.rearLeft, sr: d.tireSlipRatio.rearLeft, sa: d.tireSlipAngle.rearLeft, cs: d.tireCombinedSlip.rearLeft },
    { id: 'Rr', temp: d.tireTemp.rearRight, sr: d.tireSlipRatio.rearRight, sa: d.tireSlipAngle.rearRight, cs: d.tireCombinedSlip.rearRight }
  ];

  for (const c of corners) {
    const fill = $(`temp${c.id}`);
    const val = $(`temp${c.id}Value`);
    fill.style.height = `${tempPct(c.temp)}%`;
    fill.className = `tire-temp-fill ${tempColor(c.temp)}`;
    val.textContent = `${c.temp.toFixed(0)}°`;
    val.style.color = slipColor((c.temp - 160) / 40);
    $(`slipRatio${c.id}`).textContent = c.sr.toFixed(2);
    $(`slipRatio${c.id}`).style.color = slipColor(c.sr);
    $(`slipAngle${c.id}`).textContent = c.sa.toFixed(2);
    $(`slipAngle${c.id}`).style.color = slipColor(c.sa);
    $(`combinedSlip${c.id}`).textContent = c.cs.toFixed(2);
    $(`combinedSlip${c.id}`).style.color = slipColor(c.cs);
  }

  // Playback indicator
  const header = $('telemetryCardHeader') || createPlaybackIndicator();
  if (isPlayback) {
    header.style.display = '';
    header.textContent = `Playback — Sample ${selectedSampleIndex + 1} of ${sampleHistory.length}`;
  } else {
    header.style.display = 'none';
  }
}

function createPlaybackIndicator() {
  const header = document.createElement('div');
  header.id = 'telemetryCardHeader';
  header.style.cssText = 'display:none;padding:3px 12px;font-size:11px;background:rgba(255,215,64,0.12);color:var(--accent-yellow);border-bottom:1px solid rgba(255,215,64,0.2)';
  const telCard = document.querySelector('.telemetry-card');
  telCard.insertBefore(header, telCard.querySelector('.telemetry-grid'));
  return header;
}

// ---------- Helpers ----------
function tempColor(temp) {
  if (temp < 140) return 'cold';
  if (temp < 185) return 'warm';
  if (temp < 220) return 'hot';
  return 'overheat';
}

function tempPct(temp) {
  return Math.min(100, Math.max(0, ((temp - 80) / 170) * 100));
}

function slipColor(val) {
  if (Math.abs(val) < 0.1) return 'var(--accent-green)';
  if (Math.abs(val) < 0.3) return 'var(--accent-yellow)';
  return 'var(--accent-red)';
}

function formatTime(secs) {
  if (!secs || secs <= 0) return '--';
  const m = Math.floor(secs / 60);
  const s = (secs % 60).toFixed(2);
  return m > 0 ? `${m}:${s.padStart(5, '0')}` : `${s}s`;
}

// ---------- Timeline chart ----------
function drawTimeline() {
  const canvas = $('timelineCanvas');
  if (!canvas || sampleHistory.length < 2) return;

  const cssRect = canvas.getBoundingClientRect();
  const W = canvas.width = cssRect.width;
  const H = canvas.height = 180;
  const ctx = canvas.getContext('2d');
  const PAD = { top: 16, bottom: 24, left: 48, right: 16 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  ctx.clearRect(0, 0, W, H);

  const n = sampleHistory.length;
  if (n < 2) return;

  // Find max values for scaling
  let maxSpeed = 0, maxRpm = 0;
  for (let i = 0; i < n; i++) {
    const s = sampleHistory[i];
    if (s.s > maxSpeed) maxSpeed = s.s;
    if (s.r > maxRpm) maxRpm = s.r;
  }
  maxSpeed = Math.max(maxSpeed, 1);
  maxRpm = Math.max(maxRpm, 1);

  // Background grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(W - PAD.right, y);
    ctx.stroke();
  }

  // Speed line
  ctx.strokeStyle = '#40c4ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = PAD.left + (i / (n - 1)) * plotW;
    const y = PAD.top + plotH - (sampleHistory[i].s / maxSpeed) * plotH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();

  // RPM line
  ctx.strokeStyle = '#e040fb';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = PAD.left + (i / (n - 1)) * plotW;
    const y = PAD.top + plotH - (sampleHistory[i].r / maxRpm) * plotH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Gear shift markers
  let lastGear = sampleHistory[0].g;
  for (let i = 1; i < n; i++) {
    if (sampleHistory[i].g !== lastGear) {
      const x = PAD.left + (i / (n - 1)) * plotW;
      ctx.strokeStyle = 'rgba(255,215,64,0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, PAD.top);
      ctx.lineTo(x, PAD.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      lastGear = sampleHistory[i].g;
    }
  }

  // Throttle fill
  ctx.fillStyle = 'rgba(0,230,118,0.08)';
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top + plotH);
  for (let i = 0; i < n; i++) {
    const x = PAD.left + (i / (n - 1)) * plotW;
    const y = PAD.top + plotH - (sampleHistory[i].a / 255) * plotH;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(PAD.left + plotW, PAD.top + plotH);
  ctx.closePath();
  ctx.fill();

  // Brake fill
  ctx.fillStyle = 'rgba(255,82,82,0.06)';
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top + plotH);
  for (let i = 0; i < n; i++) {
    const x = PAD.left + (i / (n - 1)) * plotW;
    const y = PAD.top + plotH - (sampleHistory[i].b / 255) * plotH;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(PAD.left + plotW, PAD.top + plotH);
  ctx.closePath();
  ctx.fill();

  // Selected sample cursor
  if (selectedSampleIndex >= 0 && selectedSampleIndex < n) {
    const cx = PAD.left + (selectedSampleIndex / (n - 1)) * plotW;
    ctx.strokeStyle = '#ffd740';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, PAD.top);
    ctx.lineTo(cx, PAD.top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Dot on speed line
    const sy = PAD.top + plotH - (sampleHistory[selectedSampleIndex].s / maxSpeed) * plotH;
    ctx.fillStyle = '#40c4ff';
    ctx.beginPath();
    ctx.arc(cx, sy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Y axis labels
  ctx.fillStyle = '#7a8a9e';
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText((maxSpeed * 3.6).toFixed(0) + ' km/h', PAD.left - 4, PAD.top + 2);
  ctx.fillText('0', PAD.left - 4, PAD.top + plotH);

  // X axis label
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('0s', PAD.left, PAD.top + plotH + 4);
  const duration = ((n / 60).toFixed(1));
  ctx.fillText(duration + 's', PAD.left + plotW, PAD.top + plotH + 4);
  ctx.fillText(n + ' samples', PAD.left + plotW / 2, PAD.top + plotH + 4);

  // ---------- Trim overlay ----------
  const sx = PAD.left + (trimStart / (n - 1)) * plotW;
  const ex = PAD.left + (trimEnd / (n - 1)) * plotW;

  // Dimmed region left of trim start
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(PAD.left, PAD.top, sx - PAD.left, plotH);

  // Dimmed region right of trim end
  ctx.fillRect(ex, PAD.top, PAD.left + plotW - ex, plotH);

  // Trim bracket lines
  ctx.strokeStyle = 'rgba(0,230,118,0.5)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);
  ctx.beginPath();
  ctx.moveTo(sx, PAD.top);
  ctx.lineTo(sx, PAD.top + plotH);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ex, PAD.top);
  ctx.lineTo(ex, PAD.top + plotH);
  ctx.stroke();
  ctx.setLineDash([]);

  // Trim handle triangles at top
  ctx.fillStyle = '#00e676';
  ctx.strokeStyle = '#004d40';
  ctx.lineWidth = 1;
  [-1, 1].forEach((sign, i) => {
    const hx = i === 0 ? sx : ex;
    ctx.beginPath();
    ctx.moveTo(hx, PAD.top - 2);
    ctx.lineTo(hx - 7, PAD.top - 2 + 11);
    ctx.lineTo(hx + 7, PAD.top - 2 + 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
}

let isDragging = false;

function xFromIndex(idx) {
  const canvas = $('timelineCanvas');
  const rect = canvas.getBoundingClientRect();
  const W = rect.width;
  const n = sampleHistory.length;
  return 48 + (idx / (n - 1)) * (W - 48 - 16);
}

function getSampleIndexFromClientX(clientX) {
  const canvas = $('timelineCanvas');
  if (!canvas || sampleHistory.length < 2) return -1;
  const rect = canvas.getBoundingClientRect();
  const mx = clientX - rect.left - 48;
  const plotW = rect.width - 48 - 16;
  const idx = Math.round((mx / plotW) * (sampleHistory.length - 1));
  if (idx >= 0 && idx < sampleHistory.length) return idx;
  return -1;
}

function getClientXY(e) {
  return e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };
}

function isNearHandle(clientX, clientY) {
  const canvas = $('timelineCanvas');
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const relY = clientY - rect.top;
  // Grab zone: top 14px of the plot area
  if (relY < 16 || relY > 16 + 14) return null;
  const cx = clientX - rect.left;
  const sx = xFromIndex(trimStart);
  const ex = xFromIndex(trimEnd);
  const threshold = 12;
  const nearStart = Math.abs(cx - sx) <= threshold;
  const nearEnd = Math.abs(cx - ex) <= threshold;
  if (nearStart && nearEnd) {
    // Prefer whichever handle is closer
    const dS = Math.abs(cx - sx);
    const dE = Math.abs(cx - ex);
    return dS <= dE ? 'start' : 'end';
  }
  if (nearStart) return 'start';
  if (nearEnd) return 'end';
  return null;
}

function handleTimelineMouseDown(e) {
  if (sampleHistory.length < 2) return;
  const pos = getClientXY(e);
  const handle = isNearHandle(pos.x, pos.y);
  if (handle === 'start') {
    isDraggingTrimStart = true;
    isDragging = false;
    return;
  }
  if (handle === 'end') {
    isDraggingTrimEnd = true;
    isDragging = false;
    return;
  }
  isDragging = true;
  const idx = getSampleIndexFromClientX(pos.x);
  if (idx >= 0) selectSample(idx);
}

function handleTimelineMouseMove(e) {
  if (sampleHistory.length < 2) return;
  const pos = getClientXY(e);
  if (isDraggingTrimStart || isDraggingTrimEnd) {
    const idx = getSampleIndexFromClientX(pos.x);
    if (idx < 0) return;
    if (isDraggingTrimStart) {
      trimStart = Math.min(idx, trimEnd);
    }
    if (isDraggingTrimEnd) {
      trimEnd = Math.max(idx, trimStart);
    }
    updateTrimInfo();
    drawTimeline();
    return;
  }
  const idx = getSampleIndexFromClientX(pos.x);
  if (idx < 0) return;
  if (isDragging) {
    selectSample(idx);
  } else {
    const s = sampleHistory[idx];
    $('sampleInfo').textContent =
      `#${idx + 1}: ${(s.s * 3.6).toFixed(0)} km/h · ${s.r.toFixed(0)} RPM · Gear ${s.g === 0 ? 'R' : s.g} · Throttle ${((s.a / 255) * 100).toFixed(0)}%`;
  }
}

function handleTimelineMouseUp() {
  isDragging = false;
  isDraggingTrimStart = false;
  isDraggingTrimEnd = false;
}

function handleTimelineMouseLeave() {
  isDragging = false;
  isDraggingTrimStart = false;
  isDraggingTrimEnd = false;
}

function updateTrimInfo() {
  const info = $('trimInfo');
  if (!info) return;
  const total = sampleHistory.length;
  const trimmed = trimEnd - trimStart + 1;
  const fromPct = ((trimStart / (total - 1)) * 100).toFixed(0);
  const toPct = ((trimEnd / (total - 1)) * 100).toFixed(0);
  info.textContent = `Trim: ${fromPct}%–${toPct}% · ${trimmed} of ${total} samples`;
}

function analyzeTrimmed() {
  socket.emit('analyzeTrimmed', { startIdx: trimStart, endIdx: trimEnd });
  showToast(`Analyzing trimmed range (samples ${trimStart + 1}–${trimEnd + 1})`);
}

function selectSample(idx) {
  if (idx < 0 || idx >= sampleHistory.length) return;
  selectedSampleIndex = idx;
  isLiveView = false;
  const s = sampleHistory[idx];
  // Build a telemetry-like object from the compact sample
  const fakeData = {
    speed: s.s,
    currentEngineRpm: s.r,
    engineMaxRpm: s.rpmMax || 8000,
    gear: s.g,
    accel: s.a,
    brake: s.b,
    power: s.p || 0,
    torque: s.tq || 0,
    boost: s.boost || 0,
    tireTemp: { frontLeft: s.tF || 0, frontRight: s.tFR || 0, rearLeft: s.tR || 0, rearRight: s.tRR || 0 },
    tireSlipRatio: { frontLeft: s.srF || 0, frontRight: s.srFR || 0, rearLeft: s.srR || 0, rearRight: s.srRR || 0 },
    tireSlipAngle: { frontLeft: s.saF || 0, frontRight: s.saFR || 0, rearLeft: s.saR || 0, rearRight: s.saRR || 0 },
    tireCombinedSlip: { frontLeft: s.csF || 0, frontRight: s.csFR || 0, rearLeft: s.csR || 0, rearRight: s.csRR || 0 },
    // Fill remaining with zeros to avoid errors
    carClass: 0, carPerformanceIndex: 0, drivetrainType: 0, numCylinders: 0,
    lapNumber: 0, racePosition: 0, bestLap: 0, lastLap: 0, currentRaceTime: 0,
    fuel: 0, clutch: 0, handBrake: 0, steer: 0, velocity: { x: 0, y: 0, z: 0 },
    engineMaxRpm: s.rpmMax || 8000, engineIdleRpm: 800,
    yaw: s.ya || 0, pitch: 0, roll: 0,
    position: { x: s.px || 0, y: s.py || 0, z: s.pz || 0 },
    suspensionTravelMeters: { frontLeft: s.smF || 0, frontRight: s.smFR || 0, rearLeft: s.smR || 0, rearRight: s.smRR || 0 },
    acceleration: { x: s.ax || 0, y: s.ay || 0, z: s.az || 0 },
    angularVelocity: { x: 0, y: s.avY || 0, z: 0 },
    carOrdinal: 0, carGroup: 0, smashableVelDiff: 0, smashableMass: 0,
    distanceTraveled: 0, normalizedDrivingLine: 0, normalizedAIBrakeDifference: 0, timestampMs: 0, isRaceOn: 1
  };
  fillTelemetry(fakeData, true);
  $('sampleInfo').textContent = `#${idx + 1}/${sampleHistory.length} — ${(s.s * 3.6).toFixed(0)} km/h · ${s.r.toFixed(0)} RPM`;
  $('liveBtn').textContent = '\u25B6 Live';
  drawTimeline();
  drawCompareTimeline();
  redrawMapWithCompare();
}

function goLive() {
  isLiveView = true;
  selectedSampleIndex = -1;
  const header = $('telemetryCardHeader');
  if (header) header.style.display = 'none';
  $('liveBtn').textContent = '\u25CF Live';
  $('sampleInfo').textContent = 'Click the chart to inspect';
  redrawMapWithCompare();
}

// ---------- Socket events ----------
socket.on('connect', () => { updateStatus(true); socket.emit('getRunList'); });
socket.on('disconnect', () => updateStatus(false));

socket.on('serverInfo', (info) => {
  $('packetCount').textContent = info.packetCount ?? 0;
  $('sampleCount').textContent = info.sampleCount ?? 0;
  $('samplesDuringRun').textContent = info.sampleCount ?? 0;
  if (info.recording !== undefined) updateRecordingUI(info.recording);
  if (info.hotkey) {
    $('hotkeyBadge').style.display = 'flex';
    $('hotkeyLabel').textContent = info.hotkey.toUpperCase();
    $('hotkeyHint').textContent = info.hotkey.toUpperCase();
  }
  updateStatus(info.connected);
});

socket.on('recordingState', (state) => {
  updateRecordingUI(state.recording);
  if (state.recording) {
    showToast('RECORDING — capturing telemetry data');
    $('timelineCard').style.display = 'none';
    $('saveBtn').style.display = 'none';
    goLive();
  } else {
    const n = $('sampleCount').textContent;
    $('sessionInfo').textContent = `Based on ${n} captured samples`;
    if (parseInt(n) >= 2) $('saveBtn').style.display = '';
    showToast(`Recording stopped — ${n} samples analyzed`);
  }
});

socket.on('sampleHistory', (samples) => {
  sampleHistory = samples || [];
  selectedSampleIndex = -1;
  isLiveView = true;
  if (sampleHistory.length >= 2) {
    $('timelineCard').style.display = '';
    $('sampleInfo').textContent = `${sampleHistory.length} samples — click to inspect`;
    // Setup drag-to-scrub canvas events
    const canvas = $('timelineCanvas');
    canvas.onmousedown = handleTimelineMouseDown;
    canvas.onmousemove = handleTimelineMouseMove;
    canvas.onmouseleave = handleTimelineMouseLeave;
    document.addEventListener('mouseup', handleTimelineMouseUp);
    // Reset zoom for new data
    mapView.zoom = 1;
    mapView.panX = 0;
    mapView.panY = 0;
    mapEventsSetup = false;
    // Initialize trim to full range
    trimStart = 0;
    trimEnd = sampleHistory.length - 1;
    updateTrimInfo();
    $('saveBtn').style.display = '';
    drawTimeline();
    drawCompareTimeline();
    drawMap();
  } else {
    $('timelineCard').style.display = 'none';
    $('mapCard').style.display = 'none';
    $('saveBtn').style.display = 'none';
  }
});

socket.on('telemetry', (d) => {
  if (!isLiveView) return;
  fillTelemetry(d, false);
});

socket.on('recommendations', (recs) => {
  const list = $('recsList');
  if (!recs || recs.length === 0) {
    list.innerHTML = '<div class="recs-placeholder">No issues detected — your tune looks solid!</div>';
    return;
  }
  list.innerHTML = recs.map((r, i) => `
    <div class="rec-item" style="animation-delay: ${i * 0.03}s">
      <div class="rec-header">
        <span class="rec-severity ${r.severity}">${r.severity}</span>
        <span class="rec-area">${r.area}</span>
      </div>
      <div class="rec-symptom">${r.symptom}</div>
      <div class="rec-advice">${r.advice}</div>
    </div>
  `).join('');
});

socket.on('analyzeTrimmedResult', (recs) => {
  const list = $('recsList');
  if (!recs || recs.length === 0) {
    list.innerHTML = '<div class="recs-placeholder">No issues detected in trimmed range — your tune looks solid!</div>';
    return;
  }
  list.innerHTML = recs.map((r, i) => `
    <div class="rec-item" style="animation-delay: ${i * 0.03}s">
      <div class="rec-header">
        <span class="rec-severity ${r.severity}">${r.severity}</span>
        <span class="rec-area">${r.area}</span>
      </div>
      <div class="rec-symptom">${r.symptom}</div>
      <div class="rec-advice">${r.advice}</div>
    </div>
  `).join('');
});

socket.on('runList', (runs) => {
  savedRuns = runs || [];
  populateRunSelectors();
});

function saveRun() {
  if (sampleHistory.length < 2) return;
  socket.emit('saveRun');
  showToast('Run saved to disk');
}

function clearAllRuns() {
  if (!confirm('Delete all saved runs from disk? This cannot be undone.')) return;
  socket.emit('clearAllRuns');
  clearCompare();
  savedRuns = [];
  $('compareCard').style.display = 'none';
  populateRunSelectors();
}

socket.on('runData', ({ runId, samples }) => {
  if (!samples || samples.length < 2) return;
  if (!compareRunA) {
    compareRunA = samples;
  } else if (!compareRunB) {
    compareRunB = samples;
  }
  drawCompareTimeline();
  drawCompareMap();
  updateCompareDelta();
});

function updateCompareDelta() {
  if (!compareRunA || !compareRunB) { $('compareDelta').textContent = ''; return; }
  const sA = compareRunA, sB = compareRunB;
  const maxSA = Math.max(...sA.map(s => s.s));
  const maxSB = Math.max(...sB.map(s => s.s));
  const speedDiff = (maxSA - maxSB) * 3.6;
  const sign = speedDiff >= 0 ? '+' : '';
  $('compareDelta').textContent =
    `Run A top speed: ${(maxSA * 3.6).toFixed(0)} km/h · Run B: ${(maxSB * 3.6).toFixed(0)} km/h (${sign}${speedDiff.toFixed(0)} km/h) · ` +
    `Samples: ${sA.length} vs ${sB.length}`;
}

function populateRunSelectors() {
  if (savedRuns.length === 0) {
    $('compareCard').style.display = 'none';
    return;
  }
  $('compareCard').style.display = '';
  $('compareControls').style.display = 'flex';
  const selA = $('runSelectA');
  const selB = $('runSelectB');
  const opts = savedRuns.map(r => {
    const icon = r.persistent ? '\uD83D\uDCBE ' : '';
    return `<option value="${r.id}">${icon}${r.label} (${r.maxSpeed} km/h, ${r.samples} samples)</option>`;
  }).join('');
  selA.innerHTML = '<option value="">Select run...</option>' + opts;
  selB.innerHTML = selA.innerHTML;
}

function loadRunCompare(slot) {
  const sel = slot === 'A' ? $('runSelectA') : $('runSelectB');
  const runId = sel.value;
  if (!runId) return;
  // Prevent same run in both slots
  const otherSlot = slot === 'A' ? $('runSelectB') : $('runSelectA');
  if (otherSlot.value === runId) { sel.value = ''; return; }
  if (slot === 'A') compareRunA = null;
  else compareRunB = null;
  socket.emit('getRunData', { runId });
}

function clearCompare() {
  compareRunA = null;
  compareRunB = null;
  if ($('runSelectA')) $('runSelectA').value = '';
  if ($('runSelectB')) $('runSelectB').value = '';
  $('compareDelta').textContent = '';
  drawTimeline();
  drawMap();
}

function loadRunPrimary() {
  const sel = $('runSelectA');
  const runId = sel.value;
  if (!runId) return;
  socket.emit('loadRun', { runId });
}

socket.on('runLoaded', ({ samples, recommendations, label }) => {
  if (!samples || samples.length < 2) return;
  sampleHistory = samples;
  clearCompare();
  $('recsList').innerHTML = recommendations && recommendations.length
    ? recommendations.map((r, i) => `
      <div class="rec-item" style="animation-delay: ${i * 0.03}s">
        <div class="rec-header"><span class="rec-severity ${r.severity}">${r.severity}</span><span class="rec-area">${r.area}</span></div>
        <div class="rec-symptom">${r.symptom}</div>
        <div class="rec-advice">${r.advice}</div>
      </div>`).join('')
    : '<div class="recs-placeholder">No issues detected — your tune looks solid!</div>';
  $('timelineCard').style.display = '';
  $('sampleInfo').textContent = `${samples.length} samples — ${label}`;
  $('saveBtn').style.display = '';
  mapView.zoom = 1;
  mapView.panX = 0;
  mapView.panY = 0;
  mapEventsSetup = false;
  selectedSampleIndex = -1;
  isLiveView = true;
  goLive();
  // Setup timeline canvas events
  const canvas = $('timelineCanvas');
  canvas.onmousedown = handleTimelineMouseDown;
  canvas.onmousemove = handleTimelineMouseMove;
  canvas.onmouseleave = handleTimelineMouseLeave;
  document.addEventListener('mouseup', handleTimelineMouseUp);
  trimStart = 0;
  trimEnd = sampleHistory.length - 1;
  updateTrimInfo();
  drawTimeline();
  drawCompareTimeline();
  drawMap();
  showToast(`Loaded: ${label}`);
});

function drawCompareTimeline() {
  const runs = [compareRunA, compareRunB].filter(Boolean);
  if (runs.length === 0) { drawTimeline(); return; }
  // Draw main timeline first
  drawTimeline();
  // Overlay additional run(s) as semi-transparent speed lines
  const canvas = $('timelineCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PAD = { top: 16, bottom: 24, left: 48, right: 16 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const nMain = sampleHistory.length;
  if (nMain < 2) return;

  // Find global max speed across main + compare runs
  let maxSpeed = 0;
  for (let i = 0; i < nMain; i++) maxSpeed = Math.max(maxSpeed, sampleHistory[i].s);
  for (const run of runs) {
    for (const s of run) maxSpeed = Math.max(maxSpeed, s.s);
  }
  maxSpeed = Math.max(maxSpeed, 1);

  const colors = ['#ff9100', '#40c4ff'];
  const labels = ['Run B', 'Run A'];
  let li = 0;
  for (const run of runs) {
    const isA = run === compareRunA;
    if (isA && runs.length > 1) continue; // Skip A if B is also shown (A is the base)
    const nRun = run.length;
    ctx.strokeStyle = colors[li];
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (let i = 0; i < nRun; i++) {
      const x = PAD.left + (i / (nRun - 1)) * plotW;
      const y = PAD.top + plotH - (run[i].s / maxSpeed) * plotH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    li++;
  }
}

// ---------- Map View ----------
let mapView = {
  zoom: 1, panX: 0, panY: 0,
  isPanning: false, pSX: 0, pSY: 0, pSX0: 0, pSY0: 0,
  scale: 1, ox: 0, oz: 0, W: 0, H: 0, PAD: 12
};

function mapFitBounds(minX, maxX, minZ, maxZ) {
  const { W, H, PAD } = mapView;
  const mapW = W - PAD * 2;
  const mapH = H - PAD * 2;
  const rangeX = maxX - minX || 1;
  const rangeZ = maxZ - minZ || 1;
  mapView.scale = Math.min(mapW / rangeX, mapH / rangeZ);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  mapView.ox = W / 2 - cx * mapView.scale;
  mapView.oz = H / 2 - cz * mapView.scale;
}

function mapToScreen(x, z) {
  const { scale, zoom, ox, oz, panX, panY } = mapView;
  return { sx: x * scale * zoom + ox + panX, sy: z * scale * zoom + oz + panY };
}

function drawMap() {
  const canvas = $('mapCanvas');
  if (!canvas || sampleHistory.length < 2) return;

  const hasPos = sampleHistory.some(s => s.px !== undefined && s.pz !== undefined && (s.px !== 0 || s.pz !== 0));
  if (!hasPos) { $('mapCard').style.display = 'none'; return; }
  $('mapCard').style.display = '';

  const cssRect = canvas.getBoundingClientRect();
  mapView.W = canvas.width = cssRect.width;
  mapView.H = canvas.height = cssRect.height = 220;
  const ctx = canvas.getContext('2d');
  const PAD = mapView.PAD;

  ctx.clearRect(0, 0, mapView.W, mapView.H);

  const n = sampleHistory.length;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const s = sampleHistory[i];
    if (s.px < minX) minX = s.px;
    if (s.px > maxX) maxX = s.px;
    if (s.pz < minZ) minZ = s.pz;
    if (s.pz > maxZ) maxZ = s.pz;
  }
  mapFitBounds(minX, maxX, minZ, maxZ);

  const maxS = Math.max(sampleHistory.reduce((m, s) => Math.max(m, s.s), 0), 1);

  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 1; i < n; i++) {
    const p0 = mapToScreen(sampleHistory[i - 1].px, sampleHistory[i - 1].pz);
    const p1 = mapToScreen(sampleHistory[i].px, sampleHistory[i].pz);
    const t = sampleHistory[i].s / maxS;
    const r = Math.round(40 + t * (200 - 40));
    const g = Math.round(230 - t * (230 - 80));
    const b = Math.round(255 - t * (255 - 40));
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.moveTo(p0.sx, p0.sy);
    ctx.lineTo(p1.sx, p1.sy);
    ctx.stroke();
  }

  // Start marker
  const start = mapToScreen(sampleHistory[0].px, sampleHistory[0].pz);
  ctx.fillStyle = '#00e676';
  ctx.beginPath(); ctx.arc(start.sx, start.sy, 5, 0, Math.PI * 2); ctx.fill();

  // End marker
  const end = mapToScreen(sampleHistory[n - 1].px, sampleHistory[n - 1].pz);
  ctx.fillStyle = '#ff5252';
  ctx.beginPath(); ctx.arc(end.sx, end.sy, 5, 0, Math.PI * 2); ctx.fill();

  // Scrub cursor
  if (selectedSampleIndex >= 0 && selectedSampleIndex < n) {
    const cur = mapToScreen(sampleHistory[selectedSampleIndex].px, sampleHistory[selectedSampleIndex].pz);
    ctx.strokeStyle = '#ffd740';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cur.sx, cur.sy, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,215,64,0.3)';
    ctx.beginPath(); ctx.arc(cur.sx, cur.sy, 7, 0, Math.PI * 2); ctx.fill();
  }

  $('mapInfo').textContent = mapView.zoom > 1 ? `${mapView.zoom.toFixed(1)}x` : '';
  setupMapCanvasEvents();
}

// ---------- Run Storage (Comparison) ----------
let savedRuns = [];
let compareRunA = null;
let compareRunB = null;

function redrawMapWithCompare() {
  if (compareRunA) {
    drawCompareMap();
  } else {
    drawMap();
  }
}

function drawCompareMap() {
  const canvas = $('mapCanvas');
  if (!canvas) return;
  if (!compareRunA && !compareRunB) { $('mapCard').style.display = 'none'; return; }
  $('mapCard').style.display = '';

  const cssRect = canvas.getBoundingClientRect();
  mapView.W = canvas.width = cssRect.width;
  mapView.H = canvas.height = cssRect.height = 220;
  const ctx = canvas.getContext('2d');
  const PAD = mapView.PAD;

  ctx.clearRect(0, 0, mapView.W, mapView.H);

  const runs = [compareRunA, compareRunB].filter(Boolean);
  const colors = ['#40c4ff', '#ff9100'];
  const labels = ['Run A', 'Run B'];

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const run of runs) {
    for (const s of run) {
      if (s.px < minX) minX = s.px;
      if (s.px > maxX) maxX = s.px;
      if (s.pz < minZ) minZ = s.pz;
      if (s.pz > maxZ) maxZ = s.pz;
    }
  }
  mapFitBounds(minX, maxX, minZ, maxZ);

  // Grid
  const mapW = mapView.W - PAD * 2;
  const mapH = mapView.H - PAD * 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const fy = PAD + (mapH / 4) * i;
    ctx.beginPath(); ctx.moveTo(PAD, fy); ctx.lineTo(mapView.W - PAD, fy); ctx.stroke();
  }

  for (let ri = 0; ri < runs.length; ri++) {
    const data = runs[ri];
    ctx.strokeStyle = colors[ri];
    ctx.lineWidth = ri === 0 ? 3 : 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const p = mapToScreen(data[i].px, data[i].pz);
      i === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy);
    }
    ctx.stroke();

    const st = mapToScreen(data[0].px, data[0].pz);
    ctx.fillStyle = colors[ri];
    ctx.beginPath(); ctx.arc(st.sx, st.sy, 4, 0, Math.PI * 2); ctx.fill();
  }

  // Legend
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let lx = PAD + 4, ly = PAD + 4;
  for (let ri = 0; ri < runs.length; ri++) {
    ctx.fillStyle = colors[ri];
    ctx.fillRect(lx, ly, 10, 10);
    ctx.fillStyle = 'var(--text-primary)';
    ctx.fillText(labels[ri], lx + 14, ly - 1);
    ly += 16;
  }

  $('mapInfo').textContent = mapView.zoom > 1 ? `${mapView.zoom.toFixed(1)}x` : '';
  setupMapCanvasEvents();
}

// ---------- Map Zoom / Pan ----------
let mapEventsSetup = false;

function setupMapCanvasEvents() {
  const canvas = $('mapCanvas');
  if (!canvas || mapEventsSetup) return;
  mapEventsSetup = true;

  canvas.onwheel = (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { scale, ox, oz } = mapView;
    const dx = (mx - ox - mapView.panX) / (scale * mapView.zoom);
    const dz = (my - oz - mapView.panY) / (scale * mapView.zoom);
    const factor = e.deltaY > 0 ? 1 / 1.12 : 1.12;
    mapView.zoom = Math.max(1, Math.min(50, mapView.zoom * factor));
    mapView.panX = mx - dx * scale * mapView.zoom - ox;
    mapView.panY = my - dz * scale * mapView.zoom - oz;
    canvas.style.cursor = mapView.zoom > 1 ? 'grab' : 'default';
    redrawMapWithCompare();
  };

  canvas.onmousedown = (e) => {
    if (mapView.zoom <= 1) return;
    mapView.isPanning = true;
    mapView.pSX = e.clientX;
    mapView.pSY = e.clientY;
    mapView.pSX0 = mapView.panX;
    mapView.pSY0 = mapView.panY;
    canvas.style.cursor = 'grabbing';
  };

  canvas.onmousemove = (e) => {
    if (!mapView.isPanning) return;
    mapView.panX = mapView.pSX0 + (e.clientX - mapView.pSX);
    mapView.panY = mapView.pSY0 + (e.clientY - mapView.pSY);
    redrawMapWithCompare();
  };

  const stopPan = () => {
    mapView.isPanning = false;
    const c = $('mapCanvas');
    if (c) c.style.cursor = mapView.zoom > 1 ? 'grab' : 'default';
  };
  canvas.onmouseup = stopPan;
  canvas.onmouseleave = stopPan;

  canvas.ondblclick = () => {
    mapView.zoom = 1;
    mapView.panX = 0;
    mapView.panY = 0;
    const c = $('mapCanvas');
    if (c) c.style.cursor = 'default';
    redrawMapWithCompare();
  };
}

// ---------- UI Events ----------
$('recordBtn').addEventListener('click', () => {
  socket.emit(isRecording ? 'stopRecording' : 'startRecording');
});

$('resetBtn').addEventListener('click', () => {
  socket.emit('reset');
  $('recsList').innerHTML = '<div class="recs-placeholder">Press Record, do a run, then press Stop to analyze</div>';
  $('sessionInfo').textContent = '';
  $('samplesDuringRun').textContent = '0';
  sampleHistory = [];
  $('timelineCard').style.display = 'none';
  $('mapCard').style.display = 'none';
  clearCompare();
  goLive();
});

$('liveBtn').addEventListener('click', goLive);

// Redraw on resize
window.addEventListener('resize', () => {
  if (sampleHistory.length >= 2) {
    drawTimeline();
    drawCompareTimeline();
    redrawMapWithCompare();
  }
});
