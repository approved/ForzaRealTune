import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parsePacket } from './parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicPath = path.join(__dirname, '..', 'public');

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
    const samples = analyzerRef.history.map(d => ({
      s: d.speed,
      r: d.currentEngineRpm,
      g: d.gear,
      a: d.accel,
      b: d.brake,
      srF: d.tireSlipRatio.frontLeft,
      srR: d.tireSlipRatio.rearLeft,
      srFR: d.tireSlipRatio.frontRight,
      srRR: d.tireSlipRatio.rearRight,
      saF: d.tireSlipAngle.frontLeft,
      saR: d.tireSlipAngle.rearLeft,
      saFR: d.tireSlipAngle.frontRight,
      saRR: d.tireSlipAngle.rearRight,
      csF: d.tireCombinedSlip.frontLeft,
      csR: d.tireCombinedSlip.rearLeft,
      csFR: d.tireCombinedSlip.frontRight,
      csRR: d.tireCombinedSlip.rearRight,
      tF: d.tireTemp.frontLeft,
      tFR: d.tireTemp.frontRight,
      tR: d.tireTemp.rearLeft,
      tRR: d.tireTemp.rearRight,
      stF: d.normalizedSuspensionTravel.frontLeft,
      stR: d.normalizedSuspensionTravel.rearLeft,
      stFR: d.normalizedSuspensionTravel.frontRight,
      stRR: d.normalizedSuspensionTravel.rearRight,
      rpmMax: d.engineMaxRpm,
      p: d.power,
      tq: d.torque,
      boost: d.boost
    }));
    io.emit('sampleHistory', samples);
  }

  function toggleRecording() {
    recording = !recording;
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
        io.emit('recordingState', { recording: false });
        io.emit('serverInfo', {
          listenIp, listenPort,
          packetCount: 0, sampleCount: 0,
          connected: true, recording: false,
          hotkey: hotkeyLabel
        });
        io.emit('recommendations', []);
        io.emit('sampleHistory', []);
        console.log('Analysis data reset');
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
