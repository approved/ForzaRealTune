#!/usr/bin/env node

import { program } from 'commander';
import { createUdpListener } from './udp-listener.js';
import { parsePacket } from './parser.js';
import { TuningAnalyzer } from './analyzer.js';

program
  .name('forza-real-tune')
  .description('Forza Horizon 6 telemetry-based tuning analyzer')
  .option('-i, --ip <address>', 'UDP listen address', '127.0.0.1')
  .option('-p, --port <number>', 'UDP listen port', '5300')
  .option('-w, --web <port>', 'Web dashboard port (enables web mode)', '3000')
  .option('-k, --hotkey <keys>', 'Global hotkey to toggle recording (e.g. "ctrl+shift+r" or "f6")')
  .option('-d, --dump', 'Dump raw telemetry to stdout')
  .parse(process.argv);

const opts = program.opts();
const listenIp = opts.ip;
const listenPort = parseInt(opts.port, 10);
const dumpMode = opts.dump;
const webPort = opts.web ? parseInt(opts.web, 10) : null;
const hotkey = opts.hotkey;
const isWebMode = !!webPort && !dumpMode;

const listener = createUdpListener(listenIp, listenPort);
const analyzer = new TuningAnalyzer();
let packetCount = 0;
let carInfo = { drivetrain: 0 };

if (isWebMode) {
  const { createWebServer } = await import('./web-server.js');
  const server = createWebServer(webPort, listenIp, listenPort, hotkey);
  server.start(analyzer, listener);
} else if (dumpMode) {
  console.log(`\n  Forza RealTune v1.0.0`);
  console.log(`  Listening on udp://${listenIp}:${listenPort}\n`);

  listener.onMessage((msg) => {
    try {
      const data = parsePacket(msg);
      packetCount++;
      analyzer.push(data);
      const kmh = data.speed * 3.6;
      const hp = data.power * 0.00134102;
      process.stdout.write(
        `\r[${packetCount}] ${kmh.toFixed(0)} km/h | ` +
        `RPM: ${data.currentEngineRpm.toFixed(0)} | ` +
        `Gear: ${data.gear} | ` +
        `${hp.toFixed(0)} hp | ` +
        `Tires: ${data.tireTemp.frontLeft.toFixed(0)}/${data.tireTemp.frontRight.toFixed(0)} ` +
        `${data.tireTemp.rearLeft.toFixed(0)}/${data.tireTemp.rearRight.toFixed(0)}°F`
      );
    } catch (err) { /* ignore */ }
  });

  listener.start().catch((err) => {
    console.error(`Failed to start: ${err.message}`);
    process.exit(1);
  });
} else {
  const { createUI } = await import('./ui.js');
  if (hotkey) {
    console.log(` (Hotkey ignored in terminal mode, use -w for web dashboard)`);
  }
  const ui = createUI(() => listener.stop());
  ui.updateRecommendations([]);

  console.log(`\n  Forza RealTune v1.0.0`);
  console.log(`  Listening on udp://${listenIp}:${listenPort}`);
  console.log(`  Press Q or Esc to quit\n`);

  let lastRecsUpdate = 0;
  let recsUpdateInterval = 1000;

  listener.onMessage((msg) => {
    try {
      const data = parsePacket(msg);
      packetCount++;
      analyzer.push(data);
      if (data.drivetrainType !== undefined) carInfo.drivetrain = data.drivetrainType;
      ui.updateTelemetry(data);

      const now = Date.now();
      if (now - lastRecsUpdate > recsUpdateInterval && analyzer.history.length > 30) {
        lastRecsUpdate = now;
        ui.updateRecommendations(analyzer.getRecommendations(carInfo));
        if (analyzer.history.length > 60) recsUpdateInterval = 2000;
      }
    } catch (err) { /* ignore */ }
  });

  listener.start().catch((err) => {
    console.error(`Failed to start: ${err.message}`);
    process.exit(1);
  });
}
