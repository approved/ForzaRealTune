import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parsePacket } from './parser.js';
import { TuningAnalyzer } from './analyzer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicPath = path.join(__dirname, '..', 'public');
const RUNS_DIR = path.join(__dirname, '..', 'data', 'runs');

const MOD_NAMES = { alt: 1, ctrl: 2, shift: 4, win: 8 };
const KEY_MAP = {
  f1: 0x70, f2: 0x71, f3: 0x72, f4: 0x73, f5: 0x74,
  f6: 0x75, f7: 0x76, f8: 0x77, f9: 0x78, f10: 0x79, f11: 0x7a, f12: 0x7b,
  r: 0x52, t: 0x54, y: 0x59, u: 0x55, i: 0x49, o: 0x4f, p: 0x50,
  home: 0x24, end: 0x23, insert: 0x2d, 'delete': 0x2e,
  '`': 0xc0, '-': 0xbd, '=': 0xbb
};

export function createWebServer(webPort, listenIp, listenPort, hotkeyStr) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  app.use(express.static(publicPath));

  let recording = false;
  let totalPackets = 0;
  let carInfo = { drivetrain: 0 };
  let analyzerRef = null;
  let hotkeyProc = null;
  let hotkeyLabel = null;

  function parseHotkey(str) {
    if (!str) return null;
    const parts = str.toLowerCase().split('+').map(s => s.trim());
    let mods = 0;
    let key = 0;
    for (const p of parts) {
      const mod = MOD_NAMES[p];
      if (mod) { mods |= mod; }
      else {
        const mapped = KEY_MAP[p];
        key = mapped || p.charCodeAt(0);
      }
    }
    if (!key) key = 0x52;
    return { mods, key };
  }

  function startHotkeyProcess(hks) {
    if (hotkeyProc) {
      try { hotkeyProc.kill(); } catch {}
    }
    const scriptPath = path.join(__dirname, 'hotkey.ps1');
    hotkeyProc = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-Mod1', String(hks.mods & 1),
      '-Mod2', String(hks.mods & 6),
      '-Key', String(hks.key)
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    hotkeyProc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        if (line.trim() === 'TOGGLE') toggleRecording();
      }
    });

    hotkeyProc.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.error(`[hotkey] ${msg}`);
    });

    hotkeyProc.on('error', (err) => {
      console.error(`[hotkey] Failed to start: ${err.message}`);
    });
  }

  function stopHotkeyProcess() {
    if (hotkeyProc) {
      try { hotkeyProc.kill(); } catch {}
      hotkeyProc = null;
    }
  }

  function emitSampleHistory() {
    if (!analyzerRef || analyzerRef.history.length < 2) return;
    io.emit('sampleHistory', compactSamples(analyzerRef.history));
  }

  // ── Run Persistence ──
  let savedRuns = [];

  function ensureRunsDir() {
    if (!fs.existsSync(RUNS_DIR)) fs.mkdirSync(RUNS_DIR, { recursive: true });
  }

  function compactSamples(raw) {
    return raw.map(d => ({
      s: d.speed, r: d.currentEngineRpm, g: d.gear, a: d.accel, b: d.brake,
      srF: d.tireSlipRatio.frontLeft, srR: d.tireSlipRatio.rearLeft,
      srFR: d.tireSlipRatio.frontRight, srRR: d.tireSlipRatio.rearRight,
      saF: d.tireSlipAngle.frontLeft, saR: d.tireSlipAngle.rearLeft,
      saFR: d.tireSlipAngle.frontRight, saRR: d.tireSlipAngle.rearRight,
      csF: d.tireCombinedSlip.frontLeft, csR: d.tireCombinedSlip.rearLeft,
      csFR: d.tireCombinedSlip.frontRight, csRR: d.tireCombinedSlip.rearRight,
      tF: d.tireTemp.frontLeft, tFR: d.tireTemp.frontRight,
      tR: d.tireTemp.rearLeft, tRR: d.tireTemp.rearRight,
      smF: d.suspensionTravelMeters.frontLeft, smR: d.suspensionTravelMeters.rearLeft,
      smFR: d.suspensionTravelMeters.frontRight, smRR: d.suspensionTravelMeters.rearRight,
      rpmMax: d.engineMaxRpm, p: d.power, tq: d.torque, boost: d.boost,
      px: d.position.x, py: d.position.y, pz: d.position.z, ya: d.yaw,
      ax: d.acceleration.x, ay: d.acceleration.y, az: d.acceleration.z,
      avY: d.angularVelocity.y
    }));
  }

  function fullFromCompact(c) {
    return {
      speed: c.s, currentEngineRpm: c.r, engineMaxRpm: c.rpmMax || 8000,
      gear: c.g, accel: c.a, brake: c.b,
      power: c.p || 0, torque: c.tq || 0, boost: c.boost || 0,
      tireSlipRatio: { frontLeft: c.srF || 0, frontRight: c.srFR || 0, rearLeft: c.srR || 0, rearRight: c.srRR || 0 },
      tireSlipAngle: { frontLeft: c.saF || 0, frontRight: c.saFR || 0, rearLeft: c.saR || 0, rearRight: c.saRR || 0 },
      tireCombinedSlip: { frontLeft: c.csF || 0, frontRight: c.csFR || 0, rearLeft: c.csR || 0, rearRight: c.csRR || 0 },
      tireTemp: { frontLeft: c.tF || 0, frontRight: c.tFR || 0, rearLeft: c.tR || 0, rearRight: c.tRR || 0 },
      suspensionTravelMeters: { frontLeft: c.smF || 0, frontRight: c.smFR || 0, rearLeft: c.smR || 0, rearRight: c.smRR || 0 },
      acceleration: { x: c.ax || 0, y: c.ay || 0, z: c.az || 0 },
      angularVelocity: { x: 0, y: c.avY || 0, z: 0 },
      position: { x: c.px || 0, y: c.py || 0, z: c.pz || 0 },
      yaw: c.ya || 0, pitch: 0, roll: 0,
      velocity: { x: 0, y: 0, z: 0 }, fuel: 0, clutch: 0, handBrake: 0, steer: 0,
      carClass: 0, carPerformanceIndex: 0, drivetrainType: 0, numCylinders: 0,
      lapNumber: 0, racePosition: 0, bestLap: 0, lastLap: 0, currentRaceTime: 0,
      engineIdleRpm: 800, distanceTraveled: 0,
      normalizedSuspensionTravel: { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 },
      wheelRotationSpeed: { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 },
      wheelOnRumbleStrip: { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 },
      wheelInPuddle: { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 },
      surfaceRumble: { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 },
      carOrdinal: 0, carGroup: 0, smashableVelDiff: 0, smashableMass: 0,
      normalizedDrivingLine: 0, normalizedAIBrakeDifference: 0, timestampMs: 0, isRaceOn: 1
    };
  }

  function loadRunsFromDisk() {
    ensureRunsDir();
    const files = fs.readdirSync(RUNS_DIR).filter(f => /^run_\d+\.json$/.test(f));
    const runs = [];
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, f), 'utf8'));
        if (data && data.id && data.label && data.samples) {
          runs.push({ ...data, data: null, persistent: true });
        }
      } catch { /* skip corrupt file */ }
    }
    runs.sort((a, b) => a.id.localeCompare(b.id));
    return runs;
  }

  function persistRunToDisk(run) {
    ensureRunsDir();
    const filePath = path.join(RUNS_DIR, `run_${run.id}.json`);
    const toStore = {
      id: run.id,
      label: run.label,
      timestamp: run.timestamp,
      samples: run.samples,
      maxSpeed: run.maxSpeed,
      compact: run.compact
    };
    fs.writeFileSync(filePath, JSON.stringify(toStore));
  }

  function deleteRunFromDisk(runId) {
    const filePath = path.join(RUNS_DIR, `run_${runId}.json`);
    try { fs.unlinkSync(filePath); } catch {}
  }

  function buildRunList() {
    return savedRuns.map(r => ({
      id: r.id,
      label: r.label,
      samples: r.samples,
      maxSpeed: (r.maxSpeed * 3.6).toFixed(0),
      persistent: !!r.persistent
    }));
  }

  // Load existing runs on startup
  savedRuns = loadRunsFromDisk();

  function nextRunId() {
    const maxId = savedRuns.reduce((m, r) => {
      const n = parseInt(r.id);
      return n > m ? n : m;
    }, 0);
    return String(maxId + 1);
  }

  function saveCurrentRun() {
    if (!analyzerRef || analyzerRef.history.length < 2) return;
    const id = nextRunId();
    const now = new Date();
    const label = `Run ${id} — ${now.toLocaleTimeString()}`;
    const maxSpeed = analyzerRef.history.reduce((m, d) => Math.max(m, d.speed), 0);
    const compact = compactSamples(analyzerRef.history);
    const run = { id, label, timestamp: now.toISOString(), samples: compact.length, maxSpeed, compact, persistent: true };
    savedRuns.push(run);
    persistRunToDisk(run);
    io.emit('runList', buildRunList());
    return run;
  }

  function toggleRecording() {
    recording = !recording;
    if (recording && analyzerRef) {
      analyzerRef.reset();
      totalPackets = 0;
      io.emit('sampleHistory', []);
    }
    io.emit('recordingState', { recording });
    const sampleCount = analyzerRef ? analyzerRef.history.length : 0;
    io.emit('serverInfo', {
      listenIp, listenPort,
      packetCount: totalPackets,
      sampleCount,
      connected: true,
      recording,
      hotkey: hotkeyLabel
    });
    if (!recording) {
      if (sampleCount >= 10) {
        io.emit('recommendations', analyzerRef.getRecommendations(carInfo));
      }
      saveCurrentRun();
      emitSampleHistory();
    }
    console.log(`Recording: ${recording ? 'ON' : 'OFF'}`);
  }

  const cleanup = () => stopHotkeyProcess();
  process.on('exit', cleanup);
  process.on('SIGINT', () => { stopHotkeyProcess(); process.exit(0); });
  process.on('SIGTERM', () => { stopHotkeyProcess(); process.exit(0); });

  function start(analyzer, listener) {
    analyzerRef = analyzer;
    recording = false;
    totalPackets = 0;
    carInfo = { drivetrain: 0 };

    if (hotkeyStr) {
      const hk = parseHotkey(hotkeyStr);
      if (hk) {
        hotkeyLabel = hotkeyStr;
        startHotkeyProcess(hk);
      }
    }

    io.on('connection', (socket) => {
      console.log(`Web client connected: ${socket.id}`);

      socket.emit('serverInfo', {
        listenIp, listenPort,
        packetCount: totalPackets,
        sampleCount: analyzer.history.length,
        connected: true,
        recording,
        hotkey: hotkeyLabel
      });

      if (analyzer.history.length > 0) {
        socket.emit('telemetry', analyzer.history[analyzer.history.length - 1]);
      }
      if (analyzer.history.length >= 10) {
        socket.emit('recommendations', analyzer.getRecommendations(carInfo));
      }

      socket.on('startRecording', () => { if (!recording) toggleRecording(); });
      socket.on('stopRecording', () => { if (recording) toggleRecording(); });

      socket.on('reset', () => {
        analyzer.reset();
        totalPackets = 0;
        recording = false;
        // Clear in-memory runs but reload from disk to keep persistent ones
        savedRuns = loadRunsFromDisk();
        io.emit('recordingState', { recording: false });
        io.emit('serverInfo', {
          listenIp, listenPort,
          packetCount: 0, sampleCount: 0,
          connected: true, recording: false,
          hotkey: hotkeyLabel
        });
        io.emit('recommendations', []);
        io.emit('sampleHistory', []);
        io.emit('runList', buildRunList());
        console.log('Analysis data reset');
      });

      socket.on('saveRun', () => {
        const run = saveCurrentRun();
        if (run) console.log(`Manual save: ${run.label} (${run.samples} samples)`);
      });

      socket.on('deleteRun', ({ runId }) => {
        const idx = savedRuns.findIndex(r => r.id === runId);
        if (idx === -1) return;
        deleteRunFromDisk(runId);
        savedRuns.splice(idx, 1);
        io.emit('runList', buildRunList());
        console.log(`Deleted run ${runId}`);
      });

      socket.on('clearAllRuns', () => {
        ensureRunsDir();
        const files = fs.readdirSync(RUNS_DIR).filter(f => /^run_\d+\.json$/.test(f));
        for (const f of files) fs.unlinkSync(path.join(RUNS_DIR, f));
        savedRuns = [];
        io.emit('runList', []);
        console.log('All saved runs cleared');
      });

      socket.on('getRunList', () => {
        socket.emit('runList', buildRunList());
      });

      socket.on('getRunData', ({ runId }) => {
        const run = savedRuns.find(r => r.id === runId);
        if (!run) return;
        if (!run.compact && run.persistent) {
          try {
            const filePath = path.join(RUNS_DIR, `run_${run.id}.json`);
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            run.compact = data.compact;
          } catch { return; }
        }
        socket.emit('runData', { runId, samples: run.compact, label: run.label });
      });

      socket.on('loadRun', ({ runId }) => {
        const run = savedRuns.find(r => r.id === runId);
        if (!run) return;
        if (!run.compact && run.persistent) {
          try {
            const filePath = path.join(RUNS_DIR, `run_${run.id}.json`);
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            run.compact = data.compact;
          } catch { return; }
        }
        // Run through analyzer to get recommendations
        const temp = new TuningAnalyzer();
        for (const c of run.compact) temp.push(fullFromCompact(c));
        const recs = temp.getRecommendations(carInfo);
        socket.emit('runLoaded', { samples: run.compact, recommendations: recs, label: run.label });
      });

      socket.on('analyzeTrimmed', ({ startIdx, endIdx }) => {
        if (!analyzer || !analyzer.history || analyzer.history.length < 2) return;
        const temp = new TuningAnalyzer();
        const slice = analyzer.history.slice(startIdx, endIdx + 1);
        for (const d of slice) temp.push(d);
        const recs = temp.getRecommendations(carInfo);
        socket.emit('analyzeTrimmedResult', recs);
        console.log(`Trimmed analysis: samples ${startIdx}–${endIdx} (${slice.length} of ${analyzer.history.length})`);
      });

      socket.on('disconnect', () => {
        console.log(`Web client disconnected: ${socket.id}`);
      });
    });

    listener.onMessage((msg) => {
      try {
        const data = parsePacket(msg);
        totalPackets++;
        if (data.drivetrainType !== undefined) carInfo.drivetrain = data.drivetrainType;

        io.emit('telemetry', data);

        if (recording) analyzer.push(data);

        io.emit('serverInfo', {
          listenIp, listenPort,
          packetCount: totalPackets,
          sampleCount: analyzer.history.length,
          connected: true,
          recording,
          hotkey: hotkeyLabel
        });
      } catch (err) { /* ignore parse errors */ }
    });

    server.listen(webPort, () => {
      console.log(`\n  Forza RealTune v1.2.0 — Web Dashboard`);
      console.log(`  UDP listening on udp://${listenIp}:${listenPort}`);
      console.log(`  Dashboard: http://localhost:${webPort}`);
      if (hotkeyLabel) {
        console.log(`  Global hotkey: ${hotkeyLabel.toUpperCase()}`);
      }
      console.log(`  Press Ctrl+C to quit\n`);

      listener.start().catch((err) => {
        console.error(`Failed to start UDP listener: ${err.message}`);
        process.exit(1);
      });
    });
  }

  function stop() {
    stopHotkeyProcess();
    io.close();
    server.close();
  }

  return { start, stop };
}
