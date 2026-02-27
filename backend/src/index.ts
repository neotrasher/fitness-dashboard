import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import mongoose from 'mongoose';
import { AIAnalysisService } from './services/aiAnalysisService';
import { FileParserService } from './services/fileParserService';
import { StravaService } from './services/stravaService';
import { Activity } from './models/Activity';
import { User } from './models/User';
import { Goal } from './models/Goal';


dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fitness-dashboard')
  .then(() => console.log('✅ MongoDB conectado'))
  .catch(err => console.error('❌ Error MongoDB:', err));

app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

const aiService = new AIAnalysisService();
const fileParser = new FileParserService();
const stravaService = new StravaService();

// ========== HEALTH ==========
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== STRAVA ==========
app.get('/api/strava/auth', (req, res) => {
  const authUrl = stravaService.getAuthUrl();
  res.json({ url: authUrl });
});

app.get('/api/strava/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('No code provided');
    await stravaService.exchangeToken(code as string);
    res.redirect('http://157.254.174.220:5173?strava=connected');
  } catch (error) {
    console.error('Strava callback error:', error);
    res.redirect('http://157.254.174.220:5173?strava=error');
  }
});

app.post('/api/strava/sync', async (req, res) => {
  try {
    const user = await stravaService.getUser();
    if (!user) return res.status(401).json({ error: 'No conectado a Strava' });
    const fullSync = req.body.fullSync || false;
    const syncedCount = await stravaService.syncActivities(user.stravaAthleteId, fullSync);
    res.json({ success: true, synced: syncedCount });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Error sincronizando' });
  }
});

app.get('/api/strava/status', async (req, res) => {
  try {
    const user = await stravaService.getUser();
    res.json({
      connected: !!user,
      user: user ? {
        name: `${user.profile?.firstName} ${user.profile?.lastName}`,
        picture: user.profile?.profilePicture,
      } : null
    });
  } catch (error) {
    res.json({ connected: false });
  }
});

// Obtener detalles de actividades existentes sin datos detallados
app.post('/api/strava/fetch-details', async (req, res) => {
  try {
    const user = await User.findOne();
    if (!user?.stravaAccessToken) {
      return res.status(401).json({ error: 'No conectado a Strava' });
    }

    // Refrescar token si es necesario
    if (user.stravaTokenExpiresAt && user.stravaTokenExpiresAt < Math.floor(Date.now() / 1000)) {
      const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: process.env.STRAVA_CLIENT_ID,
          client_secret: process.env.STRAVA_CLIENT_SECRET,
          refresh_token: user.stravaRefreshToken,
          grant_type: 'refresh_token',
        }),
      });
      const tokens = await tokenResponse.json();
      user.stravaAccessToken = tokens.access_token;
      user.stravaRefreshToken = tokens.refresh_token;
      user.stravaTokenExpiresAt = tokens.expires_at;
      await user.save();
    }

    // Buscar actividades de running sin detalles
    const activitiesWithoutDetails = await Activity.find({
      activityCategory: 'cardio_running',
      hasDetailedData: { $ne: true }
    }).sort({ startTime: -1 }).limit(80);

    console.log(`📥 Obteniendo detalles de ${activitiesWithoutDetails.length} actividades...`);

    let updated = 0;
    for (const activity of activitiesWithoutDetails) {
      try {
        await new Promise(resolve => setTimeout(resolve, 200)); // Rate limit

        const response = await fetch(
          `https://www.strava.com/api/v3/activities/${activity.stravaId}`,
          { headers: { Authorization: `Bearer ${user.stravaAccessToken}` } }
        );

        if (response.status === 429) {
          console.log('⚠️ Rate limit alcanzado');
          break;
        }

        if (!response.ok) {
          console.log(`❌ Error en actividad ${activity.stravaId}: ${response.status}`);
          continue;
        }

        const details = await response.json();

        // Clasificar workout por nombre
        const name = (details.name || '').toLowerCase();
        let workoutType = 'general';
        if (/interval|series/i.test(name)) workoutType = 'intervals';
        else if (/tempo|threshold/i.test(name)) workoutType = 'tempo';
        else if (/lsd|long/i.test(name)) workoutType = 'long_run';
        else if (/easy(?!.*strides)/i.test(name)) workoutType = 'easy';
        else if (/recovery|recuper/i.test(name)) workoutType = 'recovery';
        else if (/race|carrera|maraton/i.test(name)) workoutType = 'race';
        else if (/fartlek/i.test(name)) workoutType = 'fartlek';
        else if (/strides|progres/i.test(name)) workoutType = 'easy_strides';

        await Activity.findByIdAndUpdate(activity._id, {
          hasDetailedData: true,
          workoutType,
          description: details.description || '',
          laps: details.laps || [],
          splitsMetric: details.splits_metric || [],
          bestEfforts: details.best_efforts || [],
          gear: details.gear,
          map: details.map ? {
            id: details.map.id,
            polyline: details.map.polyline,
            summary_polyline: details.map.summary_polyline
          } : undefined,
          suffer_score: details.suffer_score,
          averageCadence: details.average_cadence,
          calories: details.calories,
        });

        updated++;
        console.log(`✅ ${updated}/${activitiesWithoutDetails.length}: ${details.name}`);
      } catch (err) {
        console.error(`Error en actividad ${activity.stravaId}:`, err);
      }
    }

    res.json({ success: true, updated, remaining: await Activity.countDocuments({ activityCategory: 'cardio_running', hasDetailedData: { $ne: true } }) });
  } catch (error) {
    console.error('Error fetching details:', error);
    res.status(500).json({ error: 'Error obteniendo detalles' });
  }
});


// ========== STATS CON PERÍODO ==========
app.get('/api/stats', async (req, res) => {
  try {
    const { period } = req.query; // '1w', '1m', '3m', '6m', '1y', '3y', 'all'
    const dateFilter = getDateFilter(period as string);

    const activities = await Activity.find(dateFilter).sort({ startTime: -1 });
    const stats = calculateStats(activities);

    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// ========== ACTIVITIES ==========
app.get('/api/activities/:id', async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id);
    if (!activity) {
      return res.status(404).json({ error: 'Actividad no encontrada' });
    }
    res.json(activity);
  } catch (error) {
    console.error('Error getting activity:', error);
    res.status(500).json({ error: 'Error obteniendo actividad' });
  }
});

app.get('/api/activities', async (req, res) => {
  try {
    const { category, period, page = '1', limit = '50' } = req.query;
    const dateFilter = getDateFilter(period as string);

    let query: any = { ...dateFilter };
    if (category && category !== 'all') {
      query.activityCategory = category;
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [activities, total] = await Promise.all([
      Activity.find(query).sort({ startTime: -1 }).skip(skip).limit(limitNum),
      Activity.countDocuments(query)
    ]);

    res.json({
      activities,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo actividades' });
  }
});

// Obtener detalle de una actividad específica
app.get('/api/activities/:id', async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id);
    if (!activity) {
      return res.status(404).json({ error: 'Actividad no encontrada' });
    }
    res.json(activity);
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo actividad' });
  }
});

app.post('/api/activities/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    let activityData;
    if (file.originalname.endsWith('.fit')) {
      activityData = await fileParser.parseFitFile(file.path);
    } else if (file.originalname.endsWith('.gpx')) {
      activityData = await fileParser.parseGpxFile(file.path);
    } else {
      return res.status(400).json({ error: 'Formato no soportado' });
    }

    const category = categorizeActivityType(activityData.activityType);
    const activity = await Activity.create({
      ...activityData,
      source: 'upload',
      activityCategory: category,
      fileName: file.originalname,
    });

    res.json({ success: true, activity });
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: 'Error procesando archivo' });
  }
});

// ========== GOALS ==========
app.get('/api/goals', async (req, res) => {
  try {
    const goals = await Goal.find().sort({ targetDate: 1 });
    res.json(goals);
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo goals' });
  }
});

app.post('/api/goals', async (req, res) => {
  try {
    const goal = await Goal.create(req.body);
    res.json({ success: true, goal });
  } catch (error) {
    console.error('Error creating goal:', error);
    res.status(500).json({ error: 'Error creando goal' });
  }
});

app.put('/api/goals/:id', async (req, res) => {
  try {
    const goal = await Goal.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    res.json({ success: true, goal });
  } catch (error) {
    res.status(500).json({ error: 'Error actualizando goal' });
  }
});

app.delete('/api/goals/:id', async (req, res) => {
  try {
    await Goal.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error eliminando goal' });
  }
});

// ========== AI ANALYSIS ==========
app.post('/api/activities/analyze', async (req, res) => {
  try {
    const { question, period } = req.body;
    const dateFilter = getDateFilter(period || '1w');

    const activities = await Activity.find(dateFilter).sort({ startTime: -1 });
    const goals = await Goal.find({ completed: false }).sort({ targetDate: 1 });

    if (activities.length === 0) {
      return res.json({ analysis: 'No hay actividades en este período.' });
    }

    const analysis = await aiService.analyzeActivities(activities, question, period, goals);
    res.json({ analysis });
  } catch (error) {
    console.error('Error analyzing:', error);
    res.status(500).json({ error: 'Error en análisis' });
  }
});

app.post('/api/activities/chat', async (req, res) => {
  try {
    const { message, history, period } = req.body;
    const dateFilter = getDateFilter(period || '1m');

    const activities = await Activity.find(dateFilter).sort({ startTime: -1 });
    const goals = await Goal.find({ completed: false }).sort({ targetDate: 1 });

    const response = await aiService.chat(message, activities, history || [], period, goals);
    res.json({ response });
  } catch (error) {
    console.error('Error in chat:', error);
    res.status(500).json({ error: 'Error en chat' });
  }
});

// ========== FITNESS STATUS ==========
app.get('/api/fitness-status', async (req, res) => {
  try {
    const { period } = req.query;
    const dateFilter = getDateFilter(period as string || '1w');

    const activities = await Activity.find(dateFilter).sort({ startTime: -1 });
    const goals = await Goal.find({ completed: false }).sort({ targetDate: 1 });

    if (activities.length === 0) {
      return res.json({
        status: 'Sin datos en este período',
        hasData: false
      });
    }

    const fitnessStatus = await aiService.getFitnessStatus(activities, period as string || '1w', goals);
    res.json({ ...fitnessStatus, hasData: true });
  } catch (error) {
    console.error('Fitness status error:', error);
    res.status(500).json({ error: 'Error obteniendo estado de fitness' });
  }
});

// Obtener mejores esfuerzos históricos
app.get('/api/stats/best-efforts', async (req, res) => {
  try {
    const distances = ['400m', '1/2 mile', '1K', '1 mile', '2 mile', '5K', '10K', '15K', 'Half-Marathon', 'Marathon'];

    const results: Record<string, { time: number; date: string; activityId: string; activityName: string }> = {};

    for (const distanceName of distances) {
      const activity = await Activity.findOne({
        'best_efforts.name': distanceName
      }).sort({ [`best_efforts.moving_time`]: 1 });

      if (activity) {
        const effort = activity.best_efforts?.find((e: any) => e.name === distanceName);
        if (effort) {
          // Buscar el mejor tiempo entre todas las actividades
          const allActivities = await Activity.find({
            'best_efforts.name': distanceName
          });

          let bestTime = Infinity;
          let bestActivity = null;
          let bestEffort = null;

          for (const act of allActivities) {
            const eff = act.best_efforts?.find((e: any) => e.name === distanceName);
            if (eff && eff.moving_time < bestTime) {
              bestTime = eff.moving_time;
              bestActivity = act;
              bestEffort = eff;
            }
          }

          if (bestActivity && bestEffort) {
            results[distanceName] = {
              time: bestEffort.moving_time,
              date: bestActivity.startTime.toISOString(),
              activityId: bestActivity._id.toString(),
              activityName: bestActivity.name || 'Sin nombre'
            };
          }
        }
      }
    }

    res.json(results);
  } catch (error) {
    console.error('Error getting best efforts:', error);
    res.status(500).json({ error: 'Error obteniendo mejores esfuerzos' });
  }
});

// Predicciones basadas en best efforts
app.get('/api/stats/predictions', async (req, res) => {
  try {
    // Buscar mejores tiempos para 5K y 10K
    const activities = await Activity.find({
      'bestEfforts': { $exists: true, $ne: [] }
    });

    let best5K: number | null = null;
    let best10K: number | null = null;
    let bestHalf: number | null = null;

    for (const activity of activities) {
      for (const effort of activity.bestEfforts || []) {
        if (effort.name === '5K' && (!best5K || effort.moving_time < best5K)) {
          best5K = effort.moving_time;
        }
        if (effort.name === '10K' && (!best10K || effort.moving_time < best10K)) {
          best10K = effort.moving_time;
        }
        if (effort.name === 'Half-Marathon' && (!bestHalf || effort.moving_time < bestHalf)) {
          bestHalf = effort.moving_time;
        }
      }
    }

    // Fórmula de Riegel: T2 = T1 * (D2/D1)^1.06
    const riegel = (time: number, dist1: number, dist2: number) => {
      return time * Math.pow(dist2 / dist1, 1.06);
    };

    const predictions: Record<string, { time: number; basedOn: string }> = {};

    // Usar el mejor dato disponible para predecir
    if (best5K) {
      predictions['5K'] = { time: best5K, basedOn: 'PR' };
      predictions['10K'] = { time: Math.round(riegel(best5K, 5, 10)), basedOn: '5K PR' };
      predictions['Half-Marathon'] = { time: Math.round(riegel(best5K, 5, 21.0975)), basedOn: '5K PR' };
      predictions['Marathon'] = { time: Math.round(riegel(best5K, 5, 42.195)), basedOn: '5K PR' };
    }

    // Si tenemos 10K real, usarlo para HM y M (más preciso)
    if (best10K) {
      if (!predictions['10K'] || best10K < predictions['10K'].time) {
        predictions['10K'] = { time: best10K, basedOn: 'PR' };
      }
      const hmFromM10K = Math.round(riegel(best10K, 10, 21.0975));
      const mFrom10K = Math.round(riegel(best10K, 10, 42.195));

      if (!predictions['Half-Marathon'] || hmFromM10K < predictions['Half-Marathon'].time) {
        predictions['Half-Marathon'] = { time: hmFromM10K, basedOn: '10K PR' };
      }
      if (!predictions['Marathon'] || mFrom10K < predictions['Marathon'].time) {
        predictions['Marathon'] = { time: mFrom10K, basedOn: '10K PR' };
      }
    }

    // Si tenemos HM real, usarlo para M
    if (bestHalf) {
      if (!predictions['Half-Marathon'] || bestHalf < predictions['Half-Marathon'].time) {
        predictions['Half-Marathon'] = { time: bestHalf, basedOn: 'PR' };
      }
      const mFromHalf = Math.round(riegel(bestHalf, 21.0975, 42.195));
      if (!predictions['Marathon'] || mFromHalf < predictions['Marathon'].time) {
        predictions['Marathon'] = { time: mFromHalf, basedOn: 'HM PR' };
      }
    }

    res.json({
      predictions,
      personalRecords: {
        '5K': best5K,
        '10K': best10K,
        'Half-Marathon': bestHalf
      }
    });
  } catch (error) {
    console.error('Error calculating predictions:', error);
    res.status(500).json({ error: 'Error calculando predicciones' });
  }
});

// ========== HELPER FUNCTIONS ==========
function getDateFilter(period: string): any {
  if (!period || period === 'all') return {};

  const now = new Date();
  let startDate: Date;

  switch (period) {
    case '1w':
      // Inicio de la semana actual (lunes)
      startDate = getMonday(now);
      break;
    case '1m':
      // Últimas 4 semanas completas desde el lunes
      startDate = getMonday(new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000));
      break;
    case '3m':
      // Últimas 12 semanas completas desde el lunes
      startDate = getMonday(new Date(now.getTime() - 84 * 24 * 60 * 60 * 1000));
      break;
    case '6m':
      // Últimas 26 semanas completas desde el lunes
      startDate = getMonday(new Date(now.getTime() - 182 * 24 * 60 * 60 * 1000));
      break;
    case '1y':
      // Últimas 52 semanas completas desde el lunes
      startDate = getMonday(new Date(now.getTime() - 364 * 24 * 60 * 60 * 1000));
      break;
    case '3y':
      // Últimos 3 años desde el lunes
      startDate = getMonday(new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000));
      break;
    default:
      return {};
  }

  return { startTime: { $gte: startDate } };
}

// Obtener el lunes de la semana de una fecha dada
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // Si es domingo (0), retroceder 6 días. Si no, retroceder (día - 1) días
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0); // Inicio del día
  return d;
}

function calculateStats(activities: any[]): any {
  const running = activities.filter(a => a.activityCategory === 'cardio_running');
  const strength = activities.filter(a => a.activityCategory === 'strength');
  const cycling = activities.filter(a => a.activityCategory === 'cardio_cycling');

  return {
    total: {
      count: activities.length,
      duration: activities.reduce((sum, a) => sum + (a.duration || 0), 0),
      calories: activities.reduce((sum, a) => sum + (a.calories || 0), 0),
    },
    running: calculateCategoryStats(running),
    strength: calculateCategoryStats(strength),
    cycling: calculateCategoryStats(cycling),
  };
}

function calculateCategoryStats(activities: any[]): any {
  if (activities.length === 0) {
    return { count: 0, distance: 0, duration: 0, avgHR: 0, avgPace: '0', calories: 0 };
  }

  const totalDistance = activities.reduce((sum, a) => sum + (a.distance || 0), 0);
  const totalDuration = activities.reduce((sum, a) => sum + (a.duration || 0), 0);
  const totalCalories = activities.reduce((sum, a) => sum + (a.calories || 0), 0);

  const withHR = activities.filter(a => a.averageHR > 0);
  const avgHR = withHR.length > 0
    ? Math.round(withHR.reduce((sum, a) => sum + a.averageHR, 0) / withHR.length)
    : 0;

  const withPace = activities.filter(a => a.averagePace > 0);
  const avgPace = withPace.length > 0
    ? (withPace.reduce((sum, a) => sum + a.averagePace, 0) / withPace.length).toFixed(2)
    : '0';

  return {
    count: activities.length,
    distance: totalDistance,
    duration: totalDuration,
    avgHR,
    avgPace,
    calories: totalCalories,
  };
}

function categorizeActivityType(type: string): string {
  const normalizedType = type.toLowerCase();
  if (normalizedType.includes('run') || normalizedType.includes('treadmill')) return 'cardio_running';
  if (normalizedType.includes('cycling') || normalizedType.includes('ride')) return 'cardio_cycling';
  if (normalizedType.includes('strength') || normalizedType.includes('weight')) return 'strength';
  if (normalizedType.includes('swim')) return 'cardio_swimming';
  if (normalizedType.includes('walk') || normalizedType.includes('hike')) return 'cardio_walking';
  return 'other';
}

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
