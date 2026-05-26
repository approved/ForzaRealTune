const socket = io();

const CAR_CLASSES = ['D', 'C', 'B', 'A', 'S1', 'S2', 'R', 'X'];
const DRIVETRAINS = ['FWD', 'RWD', 'AWD'];

const $ = (id) => document.getElementById(id);

let isRecording = false;
let toastTimer = null;
let sampleHistory = [];
let selectedSampleIndex = -1;
let isLiveView = true;

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

  const rect = canvas.parentElement.getBoundingClientRect();
  const W = canvas.width = rect.width - 4;
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
}

let isDragging = false;

function getSampleIndexFromClientX(clientX) {
  const canvas = $('timelineCanvas');
  if (!canvas || sampleHistory.length < 2) return -1;
  const rect = canvas.getBoundingClientRect();
  const mx = clientX - rect.left - 48;
  const plotW = canvas.width - 48 - 16;
  const idx = Math.round((mx / plotW) * (sampleHistory.length - 1));
  if (idx >= 0 && idx < sampleHistory.length) return idx;
  return -1;
}

function handleTimelineMouseDown(e) {
  if (sampleHistory.length < 2) return;
  isDragging = true;
  const idx = getSampleIndexFromClientX(e.clientX);
  if (idx >= 0) selectSample(idx);
}

function handleTimelineMouseMove(e) {
  if (sampleHistory.length < 2) return;
  const idx = getSampleIndexFromClientX(e.clientX);
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
}

function handleTimelineMouseLeave() {
  isDragging = false;
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
    tireTemp: { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 },
    tireSlipRatio: { frontLeft: s.srF || 0, frontRight: 0, rearLeft: s.srR || 0, rearRight: 0 },
    tireSlipAngle: { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 },
    tireCombinedSlip: { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 },
    // Fill remaining with zeros to avoid errors
    carClass: 0, carPerformanceIndex: 0, drivetrainType: 0, numCylinders: 0,
    lapNumber: 0, racePosition: 0, bestLap: 0, lastLap: 0, currentRaceTime: 0,
    fuel: 0, clutch: 0, handBrake: 0, steer: 0, velocity: { x: 0, y: 0, z: 0 },
    engineMaxRpm: s.rpmMax || 8000, engineIdleRpm: 800,
    acceleration: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0, roll: 0,
    normalizedSuspensionTravel: { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 },
    wheelRotationSpeed: { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 },
    wheelOnRumbleStrip: { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 },
    wheelInPuddle: { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 },
    surfaceRumble: { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 },
    suspensionTravelMeters: { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 },
    carOrdinal: 0, carGroup: 0, smashableVelDiff: 0, smashableMass: 0,
    position: { x: 0, y: 0, z: 0 }, distanceTraveled: 0,
    normalizedDrivingLine: 0, normalizedAIBrakeDifference: 0, timestampMs: 0, isRaceOn: 1
  };
  fillTelemetry(fakeData, true);
  $('sampleInfo').textContent = `#${idx + 1}/${sampleHistory.length} — ${(s.s * 3.6).toFixed(0)} km/h · ${s.r.toFixed(0)} RPM`;
  $('liveBtn').textContent = '\u25B6 Live';
  drawTimeline();
}

function goLive() {
  isLiveView = true;
  selectedSampleIndex = -1;
  const header = $('telemetryCardHeader');
  if (header) header.style.display = 'none';
  $('liveBtn').textContent = '\u25CF Live';
  $('sampleInfo').textContent = 'Click the chart to inspect';
}

// ---------- Socket events ----------
socket.on('connect', () => updateStatus(true));
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
    goLive();
  } else {
    const n = $('sampleCount').textContent;
    $('sessionInfo').textContent = `Based on ${n} captured samples`;
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
    drawTimeline();
  } else {
    $('timelineCard').style.display = 'none';
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
  goLive();
});

$('liveBtn').addEventListener('click', goLive);

// Redraw timeline on resize
window.addEventListener('resize', () => {
  if (sampleHistory.length >= 2) drawTimeline();
});
