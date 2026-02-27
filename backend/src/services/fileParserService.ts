import FitParser from 'fit-file-parser';
import { XMLParser } from 'fast-xml-parser';
import fs from 'fs';

export class FileParserService {

  async parseFitFile(filePath: string): Promise<any> {
    const fitParser = new FitParser({
      force: true,
      speedUnit: 'km/h',
      lengthUnit: 'km',
      temperatureUnit: 'celsius',
      elapsedRecordField: true,
      mode: 'cascade',
    });

    return new Promise((resolve, reject) => {
      fs.readFile(filePath, (err, content) => {
        if (err) {
          reject(err);
          return;
        }

        fitParser.parse(content, (error: any, data: any) => {
          if (error) {
            reject(error);
            return;
          }

          try {
            const normalized = this.normalizeFitData(data);
            fs.unlink(filePath, () => { });
            resolve(normalized);
          } catch (e) {
            reject(e);
          }
        });
      });
    });
  }

  async parseGpxFile(filePath: string): Promise<any> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });

    const gpxData = parser.parse(content);
    const normalized = this.normalizeGpxData(gpxData);

    fs.unlink(filePath, () => { });

    return normalized;
  }

  private normalizeFitData(data: any): any {
    const session = data.activity?.sessions?.[0] || data.sessions?.[0] || {};
    const allLaps = session.laps || [];

    // Collect all records from all laps
    const allRecords: any[] = [];
    for (const lap of allLaps) {
      if (lap.records && Array.isArray(lap.records)) {
        allRecords.push(...lap.records);
      }
    }

    // Sub-sport detection (treadmill, track, trail, street, etc.)
    const subSport = session.sub_sport || 'generic';
    const isIndoor = subSport === 'treadmill' || subSport === 'indoor_cycling';

    // Speed comes in km/h from fit-file-parser (configured speedUnit: 'km/h')
    const avgSpeedKmh = session.enhanced_avg_speed || session.avg_speed || 0;
    const maxSpeedKmh = session.enhanced_max_speed || session.max_speed || 0;

    // Cadence: fit-file-parser returns single-leg cadence, multiply x2 for spm
    const avgCadence = session.avg_cadence ? session.avg_cadence * 2 : 0;
    const maxCadence = session.max_cadence ? session.max_cadence * 2 : 0;

    // Distance comes in km from fit-file-parser (configured lengthUnit: 'km')
    const distanceKm = session.total_distance || 0;

    // Normalize laps
    const laps = allLaps.map((lap: any, index: number) => ({
      index: index + 1,
      startTime: lap.start_time,
      totalTime: lap.total_timer_time || lap.total_elapsed_time || 0,
      distance: lap.total_distance || 0,
      avgSpeed: lap.enhanced_avg_speed || lap.avg_speed || 0,
      maxSpeed: lap.enhanced_max_speed || lap.max_speed || 0,
      avgHR: lap.avg_heart_rate || 0,
      maxHR: lap.max_heart_rate || 0,
      avgCadence: lap.avg_cadence ? lap.avg_cadence * 2 : 0,
      maxCadence: lap.max_cadence ? lap.max_cadence * 2 : 0,
      calories: lap.total_calories || 0,
      avgPower: lap.avg_power || 0,
      elevationGain: lap.total_ascent || 0,
      elevationLoss: lap.total_descent || 0,
      avgVerticalOscillation: lap.avg_vertical_oscillation || 0,
      avgStanceTime: lap.avg_stance_time || 0,
      avgVerticalRatio: lap.avg_vertical_ratio || 0,
      avgStepLength: lap.avg_step_length || 0,
      intensity: lap.lap_trigger || 'manual',
      sport: lap.sport || session.sport,
    }));

    // Normalize records (GPS + sensor data points)
    const records = allRecords.map((r: any) => {
      const rec: any = {
        timestamp: r.timestamp,
        elapsedTime: r.elapsed_time || 0,
        distance: r.distance || 0,
        speed: r.enhanced_speed || r.speed || 0,
        heartRate: r.heart_rate || 0,
        cadence: r.cadence ? r.cadence * 2 : 0,
        temperature: r.temperature || 0,
        power: r.power || 0,
        verticalOscillation: r.vertical_oscillation || 0,
        verticalRatio: r.vertical_ratio || 0,
        stepLength: r.step_length || 0,
        altitude: r.enhanced_altitude || r.altitude || 0,
      };

      if (r.position_lat !== undefined && r.position_long !== undefined) {
        rec.lat = r.position_lat;
        rec.lng = r.position_long;
      }

      return rec;
    });

    return {
      activityType: this.mapSportType(session.sport || 'unknown'),
      subSport: subSport,
      isIndoor: isIndoor,
      name: session.sport === 'running' && subSport === 'treadmill'
        ? 'Cinta'
        : session.sport === 'running'
          ? 'Carrera'
          : session.sport || 'Actividad',

      startTime: session.start_time || session.timestamp,
      duration: session.total_timer_time || 0,
      elapsedTime: session.total_elapsed_time || 0,

      distance: distanceKm * 1000,
      averageSpeed: avgSpeedKmh,
      maxSpeed: maxSpeedKmh,

      averageHR: session.avg_heart_rate || 0,
      maxHR: session.max_heart_rate || 0,

      avgCadence: avgCadence,
      maxCadence: maxCadence,

      avgPower: session.avg_power || 0,
      maxPower: session.max_power || 0,
      normalizedPower: session.normalized_power || 0,

      calories: session.total_calories || 0,
      trainingEffect: session.total_training_effect || 0,
      anaerobicEffect: session.total_anaerobic_effect || 0,

      elevationGain: session.total_ascent || 0,
      elevationLoss: session.total_descent || 0,

      avgTemperature: session.avg_temperature || 0,
      maxTemperature: session.max_temperature || 0,

      avgVerticalOscillation: session.avg_vertical_oscillation || 0,
      avgStanceTime: session.avg_stance_time || 0,
      avgVerticalRatio: session.avg_vertical_ratio || 0,
      avgStepLength: session.avg_step_length || 0,

      hasGPS: !isIndoor && session.start_position_lat !== undefined,
      startLat: session.start_position_lat || null,
      startLng: session.start_position_long || null,
      boundingBox: session.nec_lat ? {
        north: session.nec_lat,
        east: session.nec_long,
        south: session.swc_lat,
        west: session.swc_long,
      } : null,

      laps: laps,
      records: records,
      lapCount: laps.length,
    };
  }

  private normalizeGpxData(data: any): any {
    const track = data.gpx?.trk;
    const metadata = data.gpx?.metadata;

    if (!track) {
      return {
        activityType: 'unknown',
        startTime: metadata?.time,
        duration: 0,
        distance: 0,
        calories: 0,
        averageHR: 0,
        maxHR: 0,
      };
    }

    const points = this.extractTrackPoints(track);
    const distance = this.calculateDistance(points);
    const duration = this.calculateDuration(points);

    return {
      activityType: this.mapSportType(track.type || 'running'),
      name: track.name,
      startTime: points[0]?.time,
      duration,
      distance,
      calories: 0,
      averageHR: this.calculateAvgHR(points),
      maxHR: this.calculateMaxHR(points),
      elevationGain: this.calculateElevationGain(points),
    };
  }

  private mapSportType(sport: string): string {
    const sportMap: Record<string, string> = {
      'running': '🏃 Running',
      'cycling': '🚴 Ciclismo',
      'swimming': '🏊 Natación',
      'walking': '🚶 Caminata',
      'hiking': '🥾 Senderismo',
      'strength_training': '🏋️ Fuerza',
      'cardio': '💪 Cardio',
      'other': '🏅 Otro',
      'treadmill': '🏃 Cinta',
      'generic': '🏅 Actividad',
      'fitness_equipment': '🏋️ Máquina',
    };

    return sportMap[sport.toLowerCase()] || `🏅 ${sport}`;
  }

  private extractTrackPoints(track: any): any[] {
    const segments = Array.isArray(track.trkseg) ? track.trkseg : [track.trkseg];
    const points: any[] = [];

    for (const segment of segments) {
      if (segment?.trkpt) {
        const pts = Array.isArray(segment.trkpt) ? segment.trkpt : [segment.trkpt];
        points.push(...pts);
      }
    }

    return points;
  }

  private calculateDistance(points: any[]): number {
    let distance = 0;

    for (let i = 1; i < points.length; i++) {
      const lat1 = parseFloat(points[i - 1]['@_lat']);
      const lon1 = parseFloat(points[i - 1]['@_lon']);
      const lat2 = parseFloat(points[i]['@_lat']);
      const lon2 = parseFloat(points[i]['@_lon']);

      distance += this.haversine(lat1, lon1, lat2, lon2);
    }

    return distance;
  }

  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private calculateDuration(points: any[]): number {
    if (points.length < 2) return 0;

    const start = new Date(points[0].time).getTime();
    const end = new Date(points[points.length - 1].time).getTime();

    return (end - start) / 1000;
  }

  private calculateAvgHR(points: any[]): number {
    const hrPoints = points.filter(p => p.extensions?.hr);
    if (hrPoints.length === 0) return 0;

    const sum = hrPoints.reduce((acc, p) => acc + parseInt(p.extensions.hr), 0);
    return sum / hrPoints.length;
  }

  private calculateMaxHR(points: any[]): number {
    const hrValues = points
      .filter(p => p.extensions?.hr)
      .map(p => parseInt(p.extensions.hr));

    return hrValues.length > 0 ? Math.max(...hrValues) : 0;
  }

  private calculateElevationGain(points: any[]): number {
    let gain = 0;

    for (let i = 1; i < points.length; i++) {
      const ele1 = parseFloat(points[i - 1].ele || 0);
      const ele2 = parseFloat(points[i].ele || 0);

      if (ele2 > ele1) {
        gain += ele2 - ele1;
      }
    }

    return gain;
  }
}
