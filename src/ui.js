import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { getCarClassName, getDrivetrainName } from './parser.js';

export function createUI(onExit) {
  const screen = blessed.screen({
    smartCSR: true,
    title: 'Forza RealTune'
  });

  screen.key(['escape', 'q', 'C-c'], () => {
    if (onExit) onExit();
    process.exit(0);
  });

  const grid = new contrib.grid({ rows: 12, cols: 12, screen });

  const telemetryBox = grid.set(0, 0, 3, 4, blessed.box, {
    label: 'Live Telemetry',
    tags: true,
    border: { type: 'line' },
    style: { fg: 'cyan', border: { fg: 'cyan' } },
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: true
  });

  const carInfoBox = grid.set(0, 4, 3, 3, blessed.box, {
    label: 'Car Info',
    tags: true,
    border: { type: 'line' },
    style: { fg: 'green', border: { fg: 'green' } }
  });

  const inputsBox = grid.set(0, 7, 3, 3, blessed.box, {
    label: 'Controls',
    tags: true,
    border: { type: 'line' },
    style: { fg: 'yellow', border: { fg: 'yellow' } }
  });

  const statusBox = grid.set(0, 10, 3, 2, blessed.box, {
    label: 'Status',
    tags: true,
    border: { type: 'line' },
    style: { fg: 'white', border: { fg: 'white' } }
  });

  const tireGauge = grid.set(3, 0, 4, 4, blessed.box, {
    label: 'Tire Analysis',
    tags: true,
    border: { type: 'line' },
    style: { fg: 'magenta', border: { fg: 'magenta' } }
  });

  const recsBox = grid.set(3, 4, 7, 8, blessed.box, {
    label: 'Tuning Recommendations',
    tags: true,
    border: { type: 'line' },
    style: { fg: 'white', border: { fg: 'white' } },
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: true
  });

  const graphsBox = grid.set(7, 0, 5, 4, blessed.box, {
    label: 'Graphs',
    tags: true,
    border: { type: 'line' },
    style: { fg: 'white', border: { fg: 'white' } }
  });

  screen.render();

  let lastTelemetry = '';
  let lastRecommendations = 'No data yet — start driving in Forza Horizon 6';

  function colorize(val, low, high, unit = '', invert = false) {
    let color;
    if (invert) {
      if (val < low) color = 'green';
      else if (val < high) color = 'yellow';
      else color = 'red';
    } else {
      if (val > high) color = 'red';
      else if (val > low) color = 'yellow';
      else color = 'green';
    }
    return `{${color}-fg}${val.toFixed(1)}${unit}{/${color}-fg}`;
  }

  function bar(val, max, width = 10) {
    const filled = Math.round((val / max) * width);
    const barStr = '█'.repeat(Math.min(filled, width)) +
                   '░'.repeat(Math.max(width - filled, 0));
    return barStr;
  }

  function updateTelemetry(data) {
    if (!data) return;

    const kmh = data.speed * 3.6;
    const mph = data.speed * 2.237;
    const rpmPercent = data.currentEngineRpm > 0
      ? (data.currentEngineRpm / data.engineMaxRpm * 100) : 0;
    const rpmBar = bar(rpmPercent, 100, 15);

    let txt = '';
    txt += `Speed:   ${colorize(kmh, 100, 200, ' km/h')} (${mph.toFixed(0)} mph)\n`;
    txt += `RPM:     {bold}${data.currentEngineRpm.toFixed(0)}{/bold} / ${data.engineMaxRpm.toFixed(0)}\n`;
    txt += `         ${rpmBar}\n`;
    txt += `Gear:    {bold}${data.gear === 0 ? 'R' : data.gear}{/bold}\n`;
    txt += `Power:   ${(data.power / 1000).toFixed(1)} kW (${(data.power * 0.00134102).toFixed(0)} hp)\n`;
    txt += `Torque:  ${data.torque.toFixed(0)} Nm\n`;
    txt += `Boost:   ${data.boost.toFixed(1)} PSI\n`;
    txt += `Fuel:    ${(data.fuel * 100).toFixed(0)}%\n`;
    txt += `Lap:     ${data.lapNumber} | Pos: ${data.racePosition}\n`;

    if (data.currentRaceTime > 0) {
      const mins = Math.floor(data.currentRaceTime / 60);
      const secs = data.currentRaceTime % 60;
      txt += `Race:    ${mins}:${secs.toFixed(1).padStart(4, '0')}\n`;
    }

    telemetryBox.setContent(txt);

    const dt = data.drivetrainType;
    carInfoBox.setContent(
      `Class:   {bold}${getCarClassName(data.carClass)}{/bold} (PI: ${data.carPerformanceIndex})\n` +
      `Drive:   {bold}${getDrivetrainName(dt)}{/bold}\n` +
      `Engine:  {bold}${data.numCylinders}-cyl{/bold}\n` +
      `CarID:   ${data.carOrdinal}\n` +
      `Group:   ${data.carGroup}\n`
    );

    inputsBox.setContent(
      `Accel:   ${bar(data.accel, 255)} {bold}${data.accel}{/bold}\n` +
      `Brake:   ${bar(data.brake, 255)} {bold}${data.brake}{/bold}\n` +
      `Clutch:  ${bar(data.clutch, 255)} {bold}${data.clutch}{/bold}\n` +
      `Handbrake: ${data.handBrake > 0 ? '{red-fg}ON{/red-fg}' : 'OFF'} (${data.handBrake})\n` +
      `Steer:   ${data.steer < 0 ? '{cyan-fg}' : '{yellow-fg}'}${data.steer}{/}\n`
    );

    statusBox.setContent(
      `Race:    ${data.isRaceOn ? '{green-fg}ON{/green-fg}' : '{red-fg}OFF{/red-fg}'}\n` +
      `Rumble:  ${data.wheelOnRumbleStrip.frontLeft || data.wheelOnRumbleStrip.frontRight || data.wheelOnRumbleStrip.rearLeft || data.wheelOnRumbleStrip.rearRight ? '{yellow-fg}YES{/yellow-fg}' : 'no'}\n` +
      `Puddle:  ${data.wheelInPuddle.frontLeft || data.wheelInPuddle.frontRight || data.wheelInPuddle.rearLeft || data.wheelInPuddle.rearRight ? '{cyan-fg}YES{/cyan-fg}' : 'no'}\n` +
      `Best Lap: ${data.bestLap > 0 ? data.bestLap.toFixed(2) + 's' : '--'}\n` +
      `Last Lap: ${data.lastLap > 0 ? data.lastLap.toFixed(2) + 's' : '--'}\n`
    );

    const tt = data.tireTemp;
    const avgTemp = (tt.frontLeft + tt.frontRight + tt.rearLeft + tt.rearRight) / 4;
    const sr = data.tireSlipRatio;
    const sa = data.tireSlipAngle;

    const tempBarW = 8;
    tireGauge.setContent(
      `Tire Temps (avg: {bold}${avgTemp.toFixed(0)}°F{/bold}):\n` +
      `  FL: ${bar(tt.frontLeft, 250, tempBarW)} {bold}${tt.frontLeft.toFixed(0)}°F{/bold}\n` +
      `  FR: ${bar(tt.frontRight, 250, tempBarW)} {bold}${tt.frontRight.toFixed(0)}°F{/bold}\n` +
      `  RL: ${bar(tt.rearLeft, 250, tempBarW)} {bold}${tt.rearLeft.toFixed(0)}°F{/bold}\n` +
      `  RR: ${bar(tt.rearRight, 250, tempBarW)} {bold}${tt.rearRight.toFixed(0)}°F{/bold}\n` +
      `\nSlip Ratios (grip loss > 1.0):\n` +
      `  FL: {bold}${sr.frontLeft.toFixed(2)}{/bold}  FR: {bold}${sr.frontRight.toFixed(2)}{/bold}\n` +
      `  RL: {bold}${sr.rearLeft.toFixed(2)}{/bold}  RR: {bold}${sr.rearRight.toFixed(2)}{/bold}\n` +
      `\nSlip Angles (grip loss > 1.0):\n` +
      `  FL: {bold}${sa.frontLeft.toFixed(2)}{/bold}  FR: {bold}${sa.frontRight.toFixed(2)}{/bold}\n` +
      `  RL: {bold}${sa.rearLeft.toFixed(2)}{/bold}  RR: {bold}${sa.rearRight.toFixed(2)}{/bold}\n`
    );

    screen.render();
  }

  function updateRecommendations(recs) {
    if (!recs || recs.length === 0) {
      recsBox.setContent('{yellow-fg}Gathering data... Drive more laps for analysis{/yellow-fg}');
      screen.render();
      return;
    }

    let txt = '';
    let count = 0;
    for (const r of recs) {
      count++;
      const sevColor = r.severity === 'high' ? '{red-fg}' :
                       r.severity === 'medium' ? '{yellow-fg}' : '{green-fg}';
      txt += `${sevColor}[${r.severity.toUpperCase()}]{/} {bold}${r.area}{/bold}\n`;
      txt += `  └ ${r.symptom}\n`;
      txt += `  └ {cyan-fg}→ ${r.advice}{/cyan-fg}\n`;
      if (count < recs.length) txt += '\n';
    }

    if (recs.length === 0) {
      txt = '{green-fg}✓ No issues detected — tune looks solid!{/green-fg}';
    }

    recsBox.setContent(txt);
    recsBox.setScrollPerc(0);
    screen.render();
  }

  return {
    screen,
    updateTelemetry,
    updateRecommendations
  };
}
