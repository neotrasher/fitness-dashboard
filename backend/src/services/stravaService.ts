import { User } from '../models/User';
import { Activity } from '../models/Activity';

interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: any;
}

export class StravaService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.STRAVA_CLIENT_ID || '';
    this.clientSecret = process.env.STRAVA_CLIENT_SECRET || '';
    this.redirectUri = process.env.STRAVA_REDIRECT_URI || '';
  }

  getAuthUrl(): string {
    const scope = 'read,activity:read_all';
    return `https://www.strava.com/oauth/authorize?client_id=${this.clientId}&response_type=code&redirect_uri=${this.redirectUri}&scope=${scope}`;
  }

  async exchangeToken(code: string): Promise<StravaTokens> {
    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) throw new Error('Failed to exchange token');

    const data = await response.json();

    await User.findOneAndUpdate(
      { stravaAthleteId: data.athlete.id },
      {
        stravaAthleteId: data.athlete.id,
        stravaAccessToken: data.access_token,
        stravaRefreshToken: data.refresh_token,
        stravaTokenExpiresAt: data.expires_at,
        profile: {
          firstName: data.athlete.firstname,
          lastName: data.athlete.lastname,
          profilePicture: data.athlete.profile,
        },
        updatedAt: new Date(),
      },
      { upsert: true, returnDocument: 'after' }
    );

    return data;
  }

  async refreshToken(userId: string): Promise<string> {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const now = Math.floor(Date.now() / 1000);
    if (user.stravaTokenExpiresAt && user.stravaTokenExpiresAt > now) {
      return user.stravaAccessToken || '';
    }

    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: user.stravaRefreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const data = await response.json();

    user.stravaAccessToken = data.access_token;
    user.stravaRefreshToken = data.refresh_token;
    user.stravaTokenExpiresAt = data.expires_at;
    user.updatedAt = new Date();
    await user.save();

    return data.access_token;
  }

  // Find a FIT-uploaded activity that matches a Strava activity by start time (±2 min)
  private async findMatchingFitActivity(stravaStartDate: Date): Promise<any> {
    const toleranceMs = 2 * 60 * 1000; // 2 minutes
    const minTime = new Date(stravaStartDate.getTime() - toleranceMs);
    const maxTime = new Date(stravaStartDate.getTime() + toleranceMs);

    return Activity.findOne({
      source: 'upload',
      startTime: { $gte: minTime, $lte: maxTime },
    });
  }

  async syncActivities(athleteId: number, fullSync: boolean = false): Promise<number> {
    const user = await User.findOne({ stravaAthleteId: athleteId });
    if (!user) throw new Error('User not found');

    const now = Math.floor(Date.now() / 1000);
    let accessToken = user.stravaAccessToken;

    if (user.stravaTokenExpiresAt && user.stravaTokenExpiresAt <= now) {
      accessToken = await this.refreshToken(user._id.toString());
    }

    const daysBack = fullSync ? 365 * 10 : 90;
    const startDate = Math.floor((Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000);

    let syncedCount = 0;
    let detailedCount = 0;
    let mergedCount = 0;
    let page = 1;
    const perPage = 100;
    const MAX_DETAILED_PER_SYNC = 80;

    console.log(`🔄 Iniciando sync (fullSync: ${fullSync}, días: ${daysBack})`);

    while (true) {
      const response = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?after=${startDate}&per_page=${perPage}&page=${page}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!response.ok) {
        if (response.status === 429) {
          console.log('⚠️ Rate limit alcanzado. Espera 15 minutos.');
          break;
        }
        const errorText = await response.text();
        console.error('Strava API Error:', response.status, errorText);
        throw new Error(`Failed to fetch activities: ${response.status}`);
      }

      const activities = await response.json();
      if (activities.length === 0) break;

      for (const activity of activities) {
        // 1. Check if already synced with full data
        const existingByStrava = await Activity.findOne({ stravaId: activity.id });
        if (existingByStrava && existingByStrava.hasDetailedData) {
          syncedCount++;
          continue;
        }

        const isRunning = ['Run', 'VirtualRun', 'TrailRun', 'Treadmill'].includes(activity.type);
        const shouldGetDetails = isRunning && detailedCount < MAX_DETAILED_PER_SYNC;

        let detailedActivity: any = {};
        let hasDetailedData = false;

        if (shouldGetDetails) {
          await new Promise(resolve => setTimeout(resolve, 200));
          detailedActivity = await this.getActivityDetails(activity.id, accessToken as string);
          if (detailedActivity && detailedActivity.id) {
            hasDetailedData = true;
            detailedCount++;
            console.log(`✅ Detalles obtenidos: ${activity.name} (${detailedCount}/${MAX_DETAILED_PER_SYNC})`);
          }
        }

        const workoutType = hasDetailedData
          ? this.classifyWorkout(detailedActivity)
          : this.classifyWorkoutBasic(activity);
        const workoutAnalysis = hasDetailedData ? this.analyzeWorkout(detailedActivity) : null;
        const { category, subType } = this.categorizeActivity(
          activity.type,
          hasDetailedData ? detailedActivity : undefined
        );

        // Strava data to save/merge
        const stravaData = {
          stravaId: activity.id,
          activityType: activity.type,
          activityCategory: category,
          runningSubType: subType,
          workoutType,
          sportType: detailedActivity.sport_type || activity.type,

          name: detailedActivity.name || activity.name,
          description: detailedActivity.description || '',
          startTime: new Date(activity.start_date),
          timezone: detailedActivity.timezone,

          duration: activity.moving_time,
          elapsedTime: activity.elapsed_time,

          distance: activity.distance,
          elevationGain: activity.total_elevation_gain,
          elevHigh: detailedActivity.elev_high,
          elevLow: detailedActivity.elev_low,

          averagePace: activity.distance > 0
            ? (activity.moving_time / 60) / (activity.distance / 1000)
            : 0,
          averageSpeed: detailedActivity.average_speed || activity.average_speed,
          maxSpeed: detailedActivity.max_speed || activity.max_speed,

          averageHR: detailedActivity.average_heartrate || activity.average_heartrate,
          maxHR: detailedActivity.max_heartrate || activity.max_heartrate,

          averageCadence: detailedActivity.average_cadence,
          averageWatts: detailedActivity.average_watts,
          maxWatts: detailedActivity.max_watts,
          weightedAverageWatts: detailedActivity.weighted_average_watts,

          calories: detailedActivity.calories || activity.kilojoules || 0,
          sufferScore: detailedActivity.suffer_score,

          gear: detailedActivity.gear ? {
            id: detailedActivity.gear.id,
            name: detailedActivity.gear.name,
            nickname: detailedActivity.gear.nickname,
            distance: detailedActivity.gear.distance,
          } : undefined,
          deviceName: detailedActivity.device_name,

          map: detailedActivity.map ? {
            polyline: detailedActivity.map.polyline,
            summaryPolyline: detailedActivity.map.summary_polyline,
          } : undefined,

          laps: hasDetailedData ? detailedActivity.laps?.map((lap: any) => ({
            lap_index: lap.lap_index,
            distance: lap.distance,
            elapsed_time: lap.elapsed_time,
            moving_time: lap.moving_time,
            average_speed: lap.average_speed,
            max_speed: lap.max_speed,
            average_heartrate: lap.average_heartrate,
            max_heartrate: lap.max_heartrate,
            average_cadence: lap.average_cadence,
            average_watts: lap.average_watts,
            total_elevation_gain: lap.total_elevation_gain,
            pace_zone: lap.pace_zone,
          })) : [],

          splitsMetric: hasDetailedData ? detailedActivity.splits_metric?.map((split: any) => ({
            split: split.split,
            distance: split.distance,
            elapsed_time: split.elapsed_time,
            moving_time: split.moving_time,
            average_speed: split.average_speed,
            average_heartrate: split.average_heartrate,
            elevation_difference: split.elevation_difference,
            pace_zone: split.pace_zone,
          })) : [],

          bestEfforts: hasDetailedData ? detailedActivity.best_efforts?.map((effort: any) => ({
            name: effort.name,
            distance: effort.distance,
            elapsed_time: effort.elapsed_time,
            moving_time: effort.moving_time,
            pr_rank: effort.pr_rank,
          })) : [],

          workoutAnalysis,
          source: 'strava',
          hasDetailedData,
          updatedAt: new Date(),
        };

        // 2. Check if there's a FIT upload to merge with
        const fitActivity = await this.findMatchingFitActivity(new Date(activity.start_date));

        if (fitActivity) {
          // MERGE: enrich FIT activity with Strava metadata
          // Preserve FIT sensor data (records, power, running dynamics)
          // Override with Strava metadata (name, description, gear, map, stravaId)
          console.log(`🔀 Merging FIT + Strava: ${activity.name}`);

          await Activity.findByIdAndUpdate(fitActivity._id, {
            // Strava identity
            stravaId: activity.id,
            source: 'fit+strava',

            // Strava metadata (these don't exist in FIT files)
            name: detailedActivity.name || activity.name,
            description: detailedActivity.description || '',
            workoutType,
            runningSubType: subType,
            activityCategory: category,
            timezone: detailedActivity.timezone,
            sufferScore: detailedActivity.suffer_score,

            // Gear & device (only from Strava)
            gear: stravaData.gear,
            deviceName: detailedActivity.device_name,

            // Map polyline (Strava has encoded polyline, FIT has raw GPS)
            map: stravaData.map,

            // Use Strava laps if FIT laps are incomplete, otherwise keep FIT laps
            ...(hasDetailedData && detailedActivity.laps?.length > 0 && fitActivity.laps?.length <= 1
              ? { laps: stravaData.laps }
              : {}),

            // Splits and best efforts only come from Strava
            splitsMetric: stravaData.splitsMetric,
            bestEfforts: stravaData.bestEfforts,

            workoutAnalysis,
            hasDetailedData: true,
            updatedAt: new Date(),
          });

          mergedCount++;
          syncedCount++;
        } else {
          // No FIT match — normal Strava upsert
          await Activity.findOneAndUpdate(
            { stravaId: activity.id },
            stravaData,
            { upsert: true, returnDocument: 'after' }
          );
          syncedCount++;
        }
      }

      page++;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`✅ Sync completado: ${syncedCount} actividades, ${detailedCount} con detalles, ${mergedCount} mergeadas FIT+Strava`);
    return syncedCount;
  }

  private async getActivityDetails(activityId: number, accessToken: string): Promise<any> {
    const response = await fetch(
      `https://www.strava.com/api/v3/activities/${activityId}?include_all_efforts=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) {
      console.error(`Failed to get details for activity ${activityId}`);
      return {};
    }

    return response.json();
  }

  private classifyWorkoutBasic(activity: any): string {
    const name = (activity.name || '').toLowerCase();
    if (/interval|series|repeat/i.test(name)) return 'intervals';
    if (/tempo|threshold/i.test(name)) return 'tempo';
    if (/lsd|long/i.test(name)) return 'long_run';
    if (/easy|recovery|recuper/i.test(name)) return 'easy';
    if (/race|carrera/i.test(name)) return 'race';
    if (/fartlek/i.test(name)) return 'fartlek';
    if (/stride|progres/i.test(name)) return 'easy_strides';
    return 'general';
  }

  private classifyWorkout(activity: any): string {
    const name = (activity.name || '').toLowerCase();
    const description = (activity.description || '').toLowerCase();
    const text = `${name} ${description}`;

    if (/interval|series|repeat|x\d+|\dx/i.test(text)) return 'intervals';
    if (/tempo|threshold|lt\s|umbral/i.test(text)) return 'tempo';
    if (/lsd|long\s*(slow)?\s*(run|distance)?|tirada/i.test(text)) return 'long_run';
    if (/easy|fácil|facil|recovery|recuper/i.test(text)) return 'easy';
    if (/race|carrera|competencia|pk|parkrun/i.test(text)) return 'race';
    if (/fartlek/i.test(text)) return 'fartlek';
    if (/hill|cuesta|subida/i.test(text)) return 'hills';
    if (/stride|progres/i.test(text)) return 'easy_strides';

    if (activity.laps && activity.laps.length > 1) {
      const paces = activity.laps
        .filter((lap: any) => lap.distance > 200)
        .map((lap: any) => lap.average_speed);

      if (paces.length >= 2) {
        const maxPace = Math.max(...paces);
        const minPace = Math.min(...paces);
        const variation = ((maxPace - minPace) / minPace) * 100;
        if (variation > 15) return 'intervals';
        if (variation > 8) return 'tempo';
      }
    }

    const distance = activity.distance || 0;
    const avgHR = activity.average_heartrate || 0;
    if (distance > 15000) return 'long_run';
    if (distance < 8000 && avgHR < 140) return 'easy';
    return 'general';
  }

  private analyzeWorkout(activity: any): any {
    const laps = activity.laps || [];
    if (laps.length < 2) return { type: 'unknown', confidence: 0 };

    const significantLaps = laps.filter((lap: any) => lap.distance > 200);
    if (significantLaps.length < 2) return { type: 'unknown', confidence: 0 };

    const paces = significantLaps.map((lap: any) => {
      if (lap.distance > 0 && lap.moving_time > 0) {
        return (lap.moving_time / 60) / (lap.distance / 1000);
      }
      return 0;
    }).filter((p: number) => p > 0);

    if (paces.length < 2) return { type: 'unknown', confidence: 0 };

    const fastestLapPace = Math.min(...paces);
    const slowestLapPace = Math.max(...paces);
    const avgPace = paces.reduce((a: number, b: number) => a + b, 0) / paces.length;
    const variance = paces.reduce((sum: number, p: number) => sum + Math.pow(p - avgPace, 2), 0) / paces.length;
    const paceVariation = Math.sqrt(variance);

    const fastLaps = paces.filter((p: number) => p < avgPace);
    const slowLaps = paces.filter((p: number) => p >= avgPace);
    const avgFastPace = fastLaps.length > 0 ? fastLaps.reduce((a: number, b: number) => a + b, 0) / fastLaps.length : 0;
    const avgSlowPace = slowLaps.length > 0 ? slowLaps.reduce((a: number, b: number) => a + b, 0) / slowLaps.length : 0;

    const paceDiff = slowestLapPace - fastestLapPace;
    let type = 'general';
    let confidence = 50;

    if (paceDiff > 1.5) { type = 'intervals'; confidence = Math.min(95, 60 + paceDiff * 10); }
    else if (paceDiff > 0.5) { type = 'tempo'; confidence = 70; }
    else { type = avgPace > 6 ? 'easy' : 'tempo'; confidence = 80; }

    return { type, confidence, fastestLapPace, slowestLapPace, paceVariation, avgFastPace, avgSlowPace };
  }

  private categorizeActivity(stravaType: string, detailedActivity?: any): { category: string; subType?: string } {
    const cardioRunningTypes = ['Run', 'VirtualRun', 'TrailRun', 'Treadmill'];
    const cyclingTypes = ['Ride', 'VirtualRide', 'MountainBikeRide', 'GravelRide', 'EBikeRide'];
    const strengthTypes = ['WeightTraining', 'Crossfit', 'Workout'];
    const swimTypes = ['Swim', 'OpenWaterSwim'];
    const walkTypes = ['Walk', 'Hike'];

    let category = 'other';
    let subType: string | undefined;

    if (cardioRunningTypes.includes(stravaType)) {
      category = 'cardio_running';
      if (stravaType === 'Treadmill') {
        subType = 'treadmill';
      } else if (stravaType === 'TrailRun') {
        subType = 'trail';
      } else if (stravaType === 'VirtualRun') {
        subType = 'virtual';
      } else if (detailedActivity) {
        const hasMap = detailedActivity.map?.summary_polyline && detailedActivity.map.summary_polyline.length > 50;
        const hasElevation = (detailedActivity.total_elevation_gain || 0) > 10;
        if (!hasMap && !hasElevation) {
          subType = 'treadmill';
        } else if (detailedActivity.sport_type === 'TrailRun') {
          subType = 'trail';
        } else {
          subType = 'outdoor';
        }
      } else {
        subType = 'outdoor';
      }
    } else if (cyclingTypes.includes(stravaType)) {
      category = 'cardio_cycling';
    } else if (strengthTypes.includes(stravaType)) {
      category = 'strength';
    } else if (swimTypes.includes(stravaType)) {
      category = 'cardio_swimming';
    } else if (walkTypes.includes(stravaType)) {
      category = 'cardio_walking';
    }

    return { category, subType };
  }

  async getUser(): Promise<any> {
    return User.findOne();
  }

  async getActivityById(activityId: string): Promise<any> {
    return Activity.findById(activityId);
  }

  async getActivityByStravaId(stravaId: number): Promise<any> {
    return Activity.findOne({ stravaId });
  }
}