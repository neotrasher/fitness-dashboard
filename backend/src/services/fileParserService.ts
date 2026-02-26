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
            fs.unlink(filePath, () => {});
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
    
    fs.unlink(filePath, () => {});
    
    return normalized;
  }

  private normalizeFitData(data: any): any {
    const session = data.sessions?.[0] || {};
    const activity = data.activity || {};
    
    return {
      activityType: this.mapSportType(session.sport || activity.type || 'unknown'),
      startTime: session.start_time || activity.timestamp,
      duration: session.total_timer_time || 0,
      distance: (session.total_distance || 0) * 1000,
      calories: session.total_calories || 0,
      averageHR: session.avg_heart_rate || 0,
      maxHR: session.max_heart_rate || 0,
      averageSpeed: session.avg_speed || 0,
      maxSpeed: session.max_speed || 0,
      elevationGain: session.total_ascent || 0,
      elevationLoss: session.total_descent || 0,
      avgCadence: session.avg_cadence || 0,
      avgPower: session.avg_power || 0,
      laps: data.laps?.length || 0,
      records: data.records?.length || 0,
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
      const lat1 = parseFloat(points[i-1]['@_lat']);
      const lon1 = parseFloat(points[i-1]['@_lon']);
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
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
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
      const ele1 = parseFloat(points[i-1].ele || 0);
      const ele2 = parseFloat(points[i].ele || 0);
      
      if (ele2 > ele1) {
        gain += ele2 - ele1;
      }
    }
    
    return gain;
  }
}
