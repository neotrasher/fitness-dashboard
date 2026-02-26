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

        if (!response.ok) {
            throw new Error('Failed to exchange token');
        }

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

    async syncActivities(athleteId: number, fullSync: boolean = false): Promise<number> {
        const user = await User.findOne({ stravaAthleteId: athleteId });
        if (!user) throw new Error('User not found');

        const now = Math.floor(Date.now() / 1000);
        let accessToken = user.stravaAccessToken;

        if (user.stravaTokenExpiresAt && user.stravaTokenExpiresAt <= now) {
            accessToken = await this.refreshToken(user._id.toString());
        }

        // Sincronizar últimos 365 días (o más si es fullSync)
        const daysBack = fullSync ? 365 * 10 : 365;
        const startDate = Math.floor((Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000);

        let syncedCount = 0;
        let page = 1;
        const perPage = 100;

        while (true) {
            const response = await fetch(
                `https://www.strava.com/api/v3/athlete/activities?after=${startDate}&per_page=${perPage}&page=${page}`,
                {
                    headers: { Authorization: `Bearer ${accessToken}` },
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Strava API Error:', response.status, errorText);
                throw new Error(`Failed to fetch activities: ${response.status} - ${errorText}`);
            }

            const activities = await response.json();

            if (activities.length === 0) break;

            for (const activity of activities) {
                await Activity.findOneAndUpdate(
                    { stravaId: activity.id },
                    {
                        stravaId: activity.id,
                        activityType: activity.type,
                        activityCategory: this.categorizeActivity(activity.type),
                        startTime: new Date(activity.start_date),
                        duration: activity.moving_time,
                        distance: activity.distance,
                        averageHR: activity.average_heartrate,
                        maxHR: activity.max_heartrate,
                        averagePace: activity.distance > 0 ? (activity.moving_time / 60) / (activity.distance / 1000) : 0,
                        calories: activity.calories || 0,
                        elevationGain: activity.total_elevation_gain,
                        name: activity.name,
                        source: 'strava',
                    },
                    { upsert: true, returnDocument: 'after' }

                );
                syncedCount++;
            }

            page++;

            // Evitar rate limiting de Strava
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        return syncedCount;
    }

    // Categorizar actividades en grupos
    private categorizeActivity(stravaType: string): string {
        const cardioTypes = ['Run', 'VirtualRun', 'TrailRun', 'Treadmill'];
        const cyclingTypes = ['Ride', 'VirtualRide', 'MountainBikeRide', 'GravelRide', 'EBikeRide'];
        const strengthTypes = ['WeightTraining', 'Crossfit', 'Workout'];
        const swimTypes = ['Swim', 'OpenWaterSwim'];
        const walkTypes = ['Walk', 'Hike'];

        if (cardioTypes.includes(stravaType)) return 'cardio_running';
        if (cyclingTypes.includes(stravaType)) return 'cardio_cycling';
        if (strengthTypes.includes(stravaType)) return 'strength';
        if (swimTypes.includes(stravaType)) return 'cardio_swimming';
        if (walkTypes.includes(stravaType)) return 'cardio_walking';

        return 'other';
    }

    async getAllActivities(): Promise<any[]> {
        return Activity.find().sort({ startTime: -1 });
    }

    async getActivitiesByCategory(category: string): Promise<any[]> {
        return Activity.find({ activityCategory: category }).sort({ startTime: -1 });
    }

    async getUser(): Promise<any> {
        return User.findOne();
    }

    // Obtener estadísticas separadas por categoría
    async getStats(): Promise<any> {
        const allActivities = await Activity.find();

        const runningActivities = allActivities.filter(a => a.activityCategory === 'cardio_running');
        const strengthActivities = allActivities.filter(a => a.activityCategory === 'strength');
        const cyclingActivities = allActivities.filter(a => a.activityCategory === 'cardio_cycling');

        return {
            total: {
                count: allActivities.length,
                duration: allActivities.reduce((sum, a) => sum + (a.duration || 0), 0),
                calories: allActivities.reduce((sum, a) => sum + (a.calories || 0), 0),
            },
            running: this.calculateCategoryStats(runningActivities),
            strength: this.calculateCategoryStats(strengthActivities),
            cycling: this.calculateCategoryStats(cyclingActivities),
        };
    }

    private calculateCategoryStats(activities: any[]): any {
        if (activities.length === 0) {
            return { count: 0, distance: 0, duration: 0, avgHR: 0, avgPace: 0, calories: 0 };
        }

        const withHR = activities.filter(a => a.averageHR > 0);
        const withPace = activities.filter(a => a.averagePace > 0);

        return {
            count: activities.length,
            distance: activities.reduce((sum, a) => sum + (a.distance || 0), 0),
            duration: activities.reduce((sum, a) => sum + (a.duration || 0), 0),
            calories: activities.reduce((sum, a) => sum + (a.calories || 0), 0),
            avgHR: withHR.length > 0
                ? Math.round(withHR.reduce((sum, a) => sum + a.averageHR, 0) / withHR.length)
                : 0,
            avgPace: withPace.length > 0
                ? (withPace.reduce((sum, a) => sum + a.averagePace, 0) / withPace.length).toFixed(2)
                : 0,
            maxDistance: Math.max(...activities.map(a => a.distance || 0)),
            recentActivities: activities.slice(0, 5),
        };
    }
}
