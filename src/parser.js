export function parsePacket(buffer) {
  if (buffer.length < 323) {
    throw new Error(`Invalid packet size: expected 324 bytes, got ${buffer.length}`);
  }

  const dv = new DataView(buffer.buffer, buffer.byteOffset, 324);
  let offset = 0;

  const readS32 = () => { const v = dv.getInt32(offset, true); offset += 4; return v; };
  const readU32 = () => { const v = dv.getUint32(offset, true); offset += 4; return v; };
  const readF32 = () => { const v = dv.getFloat32(offset, true); offset += 4; return v; };
  const readU16 = () => { const v = dv.getUint16(offset, true); offset += 2; return v; };
  const readU8 = () => { const v = dv.getUint8(offset); offset += 1; return v; };
  const readS8 = () => { const v = dv.getInt8(offset); offset += 1; return v; };

  return {
    isRaceOn: readS32(),
    timestampMs: readU32(),
    engineMaxRpm: readF32(),
    engineIdleRpm: readF32(),
    currentEngineRpm: readF32(),
    acceleration: { x: readF32(), y: readF32(), z: readF32() },
    velocity: { x: readF32(), y: readF32(), z: readF32() },
    angularVelocity: { x: readF32(), y: readF32(), z: readF32() },
    yaw: readF32(),
    pitch: readF32(),
    roll: readF32(),
    normalizedSuspensionTravel: {
      frontLeft: readF32(),
      frontRight: readF32(),
      rearLeft: readF32(),
      rearRight: readF32()
    },
    tireSlipRatio: {
      frontLeft: readF32(),
      frontRight: readF32(),
      rearLeft: readF32(),
      rearRight: readF32()
    },
    wheelRotationSpeed: {
      frontLeft: readF32(),
      frontRight: readF32(),
      rearLeft: readF32(),
      rearRight: readF32()
    },
    wheelOnRumbleStrip: {
      frontLeft: readS32(),
      frontRight: readS32(),
      rearLeft: readS32(),
      rearRight: readS32()
    },
    wheelInPuddle: {
      frontLeft: readS32(),
      frontRight: readS32(),
      rearLeft: readS32(),
      rearRight: readS32()
    },
    surfaceRumble: {
      frontLeft: readF32(),
      frontRight: readF32(),
      rearLeft: readF32(),
      rearRight: readF32()
    },
    tireSlipAngle: {
      frontLeft: readF32(),
      frontRight: readF32(),
      rearLeft: readF32(),
      rearRight: readF32()
    },
    tireCombinedSlip: {
      frontLeft: readF32(),
      frontRight: readF32(),
      rearLeft: readF32(),
      rearRight: readF32()
    },
    suspensionTravelMeters: {
      frontLeft: readF32(),
      frontRight: readF32(),
      rearLeft: readF32(),
      rearRight: readF32()
    },
    carOrdinal: readS32(),
    carClass: readS32(),
    carPerformanceIndex: readS32(),
    drivetrainType: readS32(),
    numCylinders: readS32(),
    carGroup: readU32(),
    smashableVelDiff: readF32(),
    smashableMass: readF32(),
    position: { x: readF32(), y: readF32(), z: readF32() },
    speed: readF32(),
    power: readF32(),
    torque: readF32(),
    tireTemp: {
      frontLeft: readF32(),
      frontRight: readF32(),
      rearLeft: readF32(),
      rearRight: readF32()
    },
    boost: readF32(),
    fuel: readF32(),
    distanceTraveled: readF32(),
    bestLap: readF32(),
    lastLap: readF32(),
    currentLap: readF32(),
    currentRaceTime: readF32(),
    lapNumber: readU16(),
    racePosition: readU8(),
    accel: readU8(),
    brake: readU8(),
    clutch: readU8(),
    handBrake: readU8(),
    gear: readU8(),
    steer: readS8(),
    normalizedDrivingLine: readS8(),
    normalizedAIBrakeDifference: readS8()
  };
}

export const DRIVETRAIN_NAMES = ['FWD', 'RWD', 'AWD'];

export const CAR_CLASS_NAMES = ['D', 'C', 'B', 'A', 'S1', 'S2', 'R', 'X'];

export function getCarClassName(classVal) {
  return CAR_CLASS_NAMES[classVal] ?? `Class ${classVal}`;
}

export function getDrivetrainName(type) {
  return DRIVETRAIN_NAMES[type] ?? 'Unknown';
}
