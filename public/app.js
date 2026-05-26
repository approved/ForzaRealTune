const socket = io();

const CAR_CLASSES = ['D', 'C', 'B', 'A', 'S1', 'S2', 'R', 'X'];
const DRIVETRAINS = ['FWD', 'RWD', 'AWD'];

const $ = (id) => document.getElementById(id);

let isRecording = false;
let toastTimer = null;

function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2500);
}

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
  } else {
    btn.classList.remove('recording');
    label.textContent = 'Record';
    icon.style.color = '';
    bar.classList.remove('active');
  }
}

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

socket.on('connect', () => updateStatus(true));
socket.on('disconnect', () => updateStatus(false));

socket.on('serverInfo', (info) => {
  $('packetCount').textContent = info.packetCount ?? 0;
  $('sampleCount').textContent = info.sampleCount ?? 0;

  $('samplesDuringRun').textContent = info.sampleCount ?? 0;

  if (info.recording !== undefined) {
    updateRecordingUI(info.recording);
  }

  if (info.hotkey) {
    const badge = $('hotkeyBadge');
    badge.style.display = 'flex';
    $('hotkeyLabel').textContent = info.hotkey.toUpperCase();
    $('hotkeyHint').textContent = info.hotkey.toUpperCase();
  }

  updateStatus(info.connected);
});

socket.on('recordingState', (state) => {
  updateRecordingUI(state.recording);

  if (state.recording) {
    showToast('RECORDING — capturing telemetry data');
  } else {
    const n = $('sampleCount').textContent;
    $('sessionInfo').textContent = `Based on ${n} captured samples`;
    showToast(`Recording stopped — ${n} samples analyzed`);
  }
});

socket.on('telemetry', (d) => {
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

// Recording toggle
$('recordBtn').addEventListener('click', () => {
  if (isRecording) {
    socket.emit('stopRecording');
  } else {
    socket.emit('startRecording');
  }
});

// New Run (reset)
$('resetBtn').addEventListener('click', () => {
  socket.emit('reset');
  $('recsList').innerHTML = '<div class="recs-placeholder">Press Record, do a run, then press Stop to analyze</div>';
  $('sessionInfo').textContent = '';
  $('samplesDuringRun').textContent = '0';
});
