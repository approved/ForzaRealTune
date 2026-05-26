export class TuningAnalyzer {
  constructor() {
    this.history = [];
    this.maxHistory = Infinity;
    this.summary = {
      maxTireSlipRatio: { fl: 0, fr: 0, rl: 0, rr: 0 },
      maxTireSlipAngle: { fl: 0, fr: 0, rl: 0, rr: 0 },
      avgTireTemp: { fl: 0, fr: 0, rl: 0, rr: 0 },
      peakSpeed: 0,
      peakPower: 0,
      peakTorque: 0,
      peakRpm: 0,
      samples: 0,
      bottomOutCount: 0,
      totalTravel: { fl: 0, fr: 0, rl: 0, rr: 0 }
    };
    this.tempSamples = { fl: [], fr: [], rl: [], rr: [] };
    this.lastTemps = { fl: 0, fr: 0, rl: 0, rr: 0 };
    this.lastSpeeds = [];
  }

  push(data) {
    this.history.push(data);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const s = this.summary;
    s.samples++;

    const sr = data.tireSlipRatio;
    const sa = data.tireSlipAngle;
    const tt = data.tireTemp;

    s.maxTireSlipRatio.fl = Math.max(s.maxTireSlipRatio.fl, Math.abs(sr.frontLeft));
    s.maxTireSlipRatio.fr = Math.max(s.maxTireSlipRatio.fr, Math.abs(sr.frontRight));
    s.maxTireSlipRatio.rl = Math.max(s.maxTireSlipRatio.rl, Math.abs(sr.rearLeft));
    s.maxTireSlipRatio.rr = Math.max(s.maxTireSlipRatio.rr, Math.abs(sr.rearRight));

    s.maxTireSlipAngle.fl = Math.max(s.maxTireSlipAngle.fl, Math.abs(sa.frontLeft));
    s.maxTireSlipAngle.fr = Math.max(s.maxTireSlipAngle.fr, Math.abs(sa.frontRight));
    s.maxTireSlipAngle.rl = Math.max(s.maxTireSlipAngle.rl, Math.abs(sa.rearLeft));
    s.maxTireSlipAngle.rr = Math.max(s.maxTireSlipAngle.rr, Math.abs(sa.rearRight));

    this.tempSamples.fl.push(tt.frontLeft);
    this.tempSamples.fr.push(tt.frontRight);
    this.tempSamples.rl.push(tt.rearLeft);
    this.tempSamples.rr.push(tt.rearRight);

    this.lastTemps = {
      fl: tt.frontLeft,
      fr: tt.frontRight,
      rl: tt.rearLeft,
      rr: tt.rearRight
    };

    if (data.speed > s.peakSpeed) s.peakSpeed = data.speed;
    if (data.power > s.peakPower) s.peakPower = data.power;
    if (data.torque > s.peakTorque) s.peakTorque = data.torque;
    if (data.currentEngineRpm > s.peakRpm) s.peakRpm = data.currentEngineRpm;

    const st = data.suspensionTravelMeters;
    if (st.frontLeft < 0.001 || st.frontRight < 0.001 ||
        st.rearLeft < 0.001 || st.rearRight < 0.001) {
      s.bottomOutCount++;
    }

    s.totalTravel.fl += st.frontLeft;
    s.totalTravel.fr += st.frontRight;
    s.totalTravel.rl += st.rearLeft;
    s.totalTravel.rr += st.rearRight;

    this.lastSpeeds.push(data.speed);
    if (this.lastSpeeds.length > 10) this.lastSpeeds.shift();
  }

  getAvgAccel() {
    if (this.history.length < 2) return 0;
    const recent = this.history.slice(-30);
    const accels = recent.map(h => Math.sqrt(
      h.acceleration.x ** 2 + h.acceleration.y ** 2 + h.acceleration.z ** 2
    ));
    return accels.reduce((a, b) => a + b, 0) / accels.length;
  }

  getAvgTemps() {
    const avg = (arr) => {
      if (arr.length === 0) return 0;
      return arr.reduce((a, b) => a + b, 0) / arr.length;
    };
    return {
      fl: avg(this.tempSamples.fl),
      fr: avg(this.tempSamples.fr),
      rl: avg(this.tempSamples.rl),
      rr: avg(this.tempSamples.rr)
    };
  }

  getAvgSuspensionTravel() {
    const s = this.summary;
    if (s.samples === 0) return { fl: 0, fr: 0, rl: 0, rr: 0 };
    return {
      fl: s.totalTravel.fl / s.samples,
      fr: s.totalTravel.fr / s.samples,
      rl: s.totalTravel.rl / s.samples,
      rr: s.totalTravel.rr / s.samples
    };
  }

  getAvgSlipRatioPerWheel() {
    if (this.history.length === 0) return { fl: 0, fr: 0, rl: 0, rr: 0 };
    const recent = this.history.slice(-60);
    const avg = (key) => {
      const vals = recent.map(h => Math.abs(h.tireSlipRatio[key]));
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };
    return {
      fl: avg('frontLeft'),
      fr: avg('frontRight'),
      rl: avg('rearLeft'),
      rr: avg('rearRight')
    };
  }

  getAvgSlipAnglePerWheel() {
    if (this.history.length === 0) return { fl: 0, fr: 0, rl: 0, rr: 0 };
    const recent = this.history.slice(-60);
    const avg = (key) => {
      const vals = recent.map(h => Math.abs(h.tireSlipAngle[key]));
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };
    return {
      fl: avg('frontLeft'),
      fr: avg('frontRight'),
      rl: avg('rearLeft'),
      rr: avg('rearRight')
    };
  }

  getAvgCombinedSlip() {
    if (this.history.length === 0) return { fl: 0, fr: 0, rl: 0, rr: 0 };
    const recent = this.history.slice(-60);
    const avg = (key) => {
      const vals = recent.map(h => Math.abs(h.tireCombinedSlip[key]));
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };
    return {
      fl: avg('frontLeft'),
      fr: avg('frontRight'),
      rl: avg('rearLeft'),
      rr: avg('rearRight')
    };
  }

  getRecommendations(carInfo) {
    const recs = [];
    const slipRatio = this.getAvgSlipRatioPerWheel();
    const slipAngle = this.getAvgSlipAnglePerWheel();
    const combinedSlip = this.getAvgCombinedSlip();
    const avgTemps = this.getAvgTemps();
    const avgTravel = this.getAvgSuspensionTravel();
    const s = this.summary;

    const isFwd = carInfo.drivetrain === 0;
    const isRwd = carInfo.drivetrain === 1;
    const isAwd = carInfo.drivetrain === 2;

    const driveAxle = isFwd ? 'front' : (isRwd ? 'rear' : 'all');
    const isDriveWheel = (axle) => driveAxle === 'all' || driveAxle === axle;

    // Tire pressure & grip analysis
    const avgSlipRatio = (slipRatio.fl + slipRatio.fr + slipRatio.rl + slipRatio.rr) / 4;
    const avgSlipAngle = (slipAngle.fl + slipAngle.fr + slipAngle.rl + slipAngle.rr) / 4;

    if (isDriveWheel('front')) {
      const driveSlip = (slipRatio.fl + slipRatio.fr) / 2;
      if (driveSlip > 0.15) {
        recs.push({
          area: 'Tires (Drive)',
          severity: driveSlip > 0.3 ? 'high' : 'medium',
          symptom: `High acceleration wheelspin (avg slip ratio ${(driveSlip * 100).toFixed(0)}%)`,
          advice: 'Increase tire pressure slightly (1-2 PSI) or reduce power. Consider a differential adjustment if RWD/AWD.'
        });
      }
    }

    if (!isFwd) {
      const rearSlip = (slipRatio.rl + slipRatio.rr) / 2;
      if (rearSlip > 0.15) {
        recs.push({
          area: 'Tires (Rear)',
          severity: rearSlip > 0.3 ? 'high' : 'medium',
          symptom: `Excessive rear wheelspin (${(rearSlip * 100).toFixed(0)}% avg slip ratio)`,
          advice: isRwd
            ? 'Reduce power, increase rear tire pressure, or loosen rear differential'
            : 'Check front/rear balance on AWD differential'
        });
      }
    }

    if (avgSlipAngle > 0.12) {
      const axle = slipAngle.fl + slipAngle.fr > slipAngle.rl + slipAngle.rr ? 'front' : 'rear';
      recs.push({
        area: 'Cornering Grip',
        severity: avgSlipAngle > 0.25 ? 'high' : 'medium',
        symptom: `High ${axle} slip angle (${(avgSlipAngle * 100).toFixed(0)}%) — cornering understeer${axle === 'rear' ? '/oversteer' : ''}`,
        advice: axle === 'front'
          ? 'Reduce front tire pressure, increase front camber, soften front springs, or stiffen rear anti-roll bar'
          : 'Reduce rear tire pressure, increase rear camber, soften rear springs, or stiffen front anti-roll bar'
      });
    }

    if (combinedSlip.fl > 0.3 || combinedSlip.fr > 0.3 || combinedSlip.rl > 0.3 || combinedSlip.rr > 0.3) {
      const maxCS = Math.max(combinedSlip.fl, combinedSlip.fr, combinedSlip.rl, combinedSlip.rr);
      recs.push({
        area: 'Combined Grip',
        severity: maxCS > 0.6 ? 'high' : 'medium',
        symptom: `High combined slip (${(maxCS * 100).toFixed(0)}%) — braking while cornering or accelerating while cornering causing instability`,
        advice: 'Soften anti-roll bars, adjust damping (reduce rebound on outside wheels), or adjust differential lock-up settings'
      });
    }

    // Tire temperature analysis
    const temps = [avgTemps.fl, avgTemps.fr, avgTemps.rl, avgTemps.rr];
    const minTemp = Math.min(...temps);
    const maxTemp = Math.max(...temps);
    const tempSpread = maxTemp - minTemp;

    const frontAvg = (avgTemps.fl + avgTemps.fr) / 2;
    const rearAvg = (avgTemps.rl + avgTemps.rr) / 2;
    const leftAvg = (avgTemps.fl + avgTemps.rl) / 2;
    const rightAvg = (avgTemps.fr + avgTemps.rr) / 2;

    if (tempSpread > 25) {
      // Uneven temps
      if (Math.abs(leftAvg - rightAvg) > 15) {
        const hotSide = leftAvg > rightAvg ? 'left' : 'right';
        recs.push({
          area: 'Camber',
          severity: 'medium',
          symptom: `Uneven tire temps side-to-side (${hotSide} hotter by ${Math.abs(leftAvg - rightAvg).toFixed(0)}°F)`,
          advice: `Race tracks with more ${hotSide === 'left' ? 'right' : 'left'} turns cause this naturally. If excessive, reduce camber on the hotter side, adjust tire pressure.`
        });
      }
      if (Math.abs(frontAvg - rearAvg) > 20) {
        const hotEnd = frontAvg > rearAvg ? 'front' : 'rear';
        recs.push({
          area: 'Tire Pressure',
          severity: 'medium',
          symptom: `${hotEnd === 'front' ? 'Front' : 'Rear'} tires running hotter than ${hotEnd === 'front' ? 'rear' : 'front'} (Δ${Math.abs(frontAvg - rearAvg).toFixed(0)}°F)`,
          advice: hotEnd === 'front'
            ? 'Reduce front tire pressure or increase front camber (less contact patch scrub)'
            : 'Reduce rear tire pressure or increase rear camber'
        });
      }
    }

    const allTempsHigh = temps.every(t => t > 200);
    if (allTempsHigh) {
      recs.push({
        area: 'Tire Overheating',
        severity: 'high',
        symptom: `All tires running hot (avg ${(temps.reduce((a,b) => a+b,0)/4).toFixed(0)}°F)`,
        advice: 'Increase tire pressure across all four tires to reduce contact patch and heat buildup'
      });
    }

    const allTempsLow = temps.every(t => t < 140);
    if (allTempsLow) {
      recs.push({
        area: 'Tire Temperature',
        severity: 'low',
        symptom: `Tires not reaching optimal temperature (avg ${(temps.reduce((a,b) => a+b,0)/4).toFixed(0)}°F)`,
        advice: 'Decrease tire pressure to increase contact patch and generate more heat, or drive more aggressively to build heat'
      });
    }

    // Suspension analysis
    if (s.bottomOutCount > s.samples * 0.05) {
      recs.push({
        area: 'Suspension',
        severity: 'high',
        symptom: `Frequent bottoming out (${s.bottomOutCount} events out of ${s.samples} samples)`,
        advice: 'Increase spring rates (stiffen) or raise ride height. Consider increasing bump damping.'
      });
    }

    const travelRange = {
      fl: s.totalTravel.fl / s.samples,
      fr: s.totalTravel.fr / s.samples,
      rl: s.totalTravel.rl / s.samples,
      rr: s.totalTravel.rr / s.samples
    };
    const maxAvgTravel = Math.max(...Object.values(travelRange));
    if (maxAvgTravel < 0.01 && s.samples > 50) {
      recs.push({
        area: 'Suspension',
        severity: 'medium',
        symptom: 'Very little suspension travel — ride is very stiff',
        advice: 'Reduce spring rates (soften) for better mechanical grip over bumps and curbs'
      });
    }

    // Gearing analysis
    if (s.peakRpm > 0 && this.history.length > 0) {
      const last = this.history[this.history.length - 1];
      if (last.currentEngineRpm > 0) {
        const rpmRatio = last.currentEngineRpm / last.engineMaxRpm;
        const avgRpmRatio = this.history.slice(-30).reduce((sum, h) => {
          return h.currentEngineRpm > 0 ? sum + (h.currentEngineRpm / h.engineMaxRpm) : sum;
        }, 0) / Math.min(30, this.history.slice(-30).filter(h => h.currentEngineRpm > 0).length || 1);

        if (avgRpmRatio < 0.6 && s.peakSpeed > 30) {
          recs.push({
            area: 'Gearing',
            severity: 'medium',
            symptom: `Engine running below optimal RPM range (avg ${(avgRpmRatio * 100).toFixed(0)}% of max RPM)`,
            advice: 'Shorten gear ratios (move slider toward Acceleration) to keep engine in power band'
          });
        } else if (avgRpmRatio > 0.92 && s.samples > 50) {
          recs.push({
            area: 'Gearing',
            severity: 'medium',
            symptom: `Engine frequently near redline (avg ${(avgRpmRatio * 100).toFixed(0)}% of max RPM)`,
            advice: 'Lengthen gear ratios (move slider toward Speed) to reduce need for shifting'
          });
        }

        // Check if hitting rev limiter
        const nearRedline = this.history.slice(-30).filter(h =>
          h.currentEngineRpm > h.engineMaxRpm * 0.97
        ).length;
        if (nearRedline > 10) {
          recs.push({
            area: 'Gearing',
            severity: 'low',
            symptom: 'Hitting rev limiter frequently — losing time shifting',
            advice: 'Lengthen final drive ratio or individual gear ratios to stay in power band longer'
          });
        }
      }
    }

    // Boost analysis (forced induction cars)
    if (s.peakRpm > 0) {
      const lastBoostValues = this.history.slice(-30).map(h => h.boost).filter(b => b > 0);
      if (lastBoostValues.length > 10) {
        const avgBoost = lastBoostValues.reduce((a, b) => a + b, 0) / lastBoostValues.length;
        if (avgBoost > 5) {
          recs.push({
            area: 'Forced Induction',
            severity: 'low',
            symptom: `Average boost of ${avgBoost.toFixed(1)} PSI detected`,
            advice: 'If you have a turbocharger, adjust boost control and wastegate pressure for desired power delivery. Higher boost = more power but more heat.'
          });
        }
      }
    }

    // Aero analysis (at higher speeds)
    if (s.peakSpeed > 60) {
      recs.push({
        area: 'Aero (Info)',
        severity: 'low',
        symptom: `Peak speed of ${(s.peakSpeed * 3.6).toFixed(0)} km/h (${(s.peakSpeed * 2.237).toFixed(0)} mph)`,
        advice: s.peakSpeed > 80
          ? 'At high speeds consider increasing downforce for stability, but watch for drag on straights'
          : 'At lower speeds, reduce downforce for better acceleration'
      });
    }

    // Brake analysis
    const brakeSamples = this.history.filter(h => h.brake > 50 && h.speed > 10);
    if (brakeSamples.length > 10) {
      const brakeDecel = brakeSamples.map(h => -h.acceleration.z).filter(a => a > 0);
      if (brakeDecel.length > 0) {
        const avgDecel = brakeDecel.reduce((a, b) => a + b, 0) / brakeDecel.length;
        if (avgDecel < 8) {
          recs.push({
            area: 'Brakes',
            severity: 'low',
            symptom: `Average braking deceleration ${avgDecel.toFixed(1)} m/s² — below optimal`,
            advice: 'Brake harder later into corners. If locking up, increase brake pressure or adjust brake balance rearward.'
          });
        }
      }
    }

    // Differential analysis
    const cornerSamples = this.history.filter(h =>
      Math.abs(h.angularVelocity.y) > 0.1 && h.speed > 20
    );
    if (cornerSamples.length > 20) {
      const insideSlip = isFwd || isAwd ? 'fl' : 'rl';
      const outsideSlip = isFwd || isAwd ? 'fr' : 'rr';
      const insideOutsideDiff = Math.abs(slipRatio[insideSlip] - slipRatio[outsideSlip]);
      if (insideOutsideDiff > 0.2) {
        recs.push({
          area: 'Differential',
          severity: 'medium',
          symptom: `Large inside/outside wheel speed difference (${(insideOutsideDiff * 100).toFixed(0)}%) in corners`,
          advice: `${isAwd ? 'Adjust center differential' : 'Reduce acceleration lock on differential'} for better corner exit traction`
        });
      }
    }

    return recs;
  }

  reset() {
    this.history = [];
    this.summary = {
      maxTireSlipRatio: { fl: 0, fr: 0, rl: 0, rr: 0 },
      maxTireSlipAngle: { fl: 0, fr: 0, rl: 0, rr: 0 },
      avgTireTemp: { fl: 0, fr: 0, rl: 0, rr: 0 },
      peakSpeed: 0,
      peakPower: 0,
      peakTorque: 0,
      peakRpm: 0,
      samples: 0,
      bottomOutCount: 0,
      totalTravel: { fl: 0, fr: 0, rl: 0, rr: 0 }
    };
    this.tempSamples = { fl: [], fr: [], rl: [], rr: [] };
    this.lastTemps = { fl: 0, fr: 0, rl: 0, rr: 0 };
    this.lastSpeeds = [];
  }
}
