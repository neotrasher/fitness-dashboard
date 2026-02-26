import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import mongoose from 'mongoose';
import { AIAnalysisService } from './services/aiAnalysisService';
import { FileParserService } from './services/fileParserService';
import { StravaService } from './services/stravaService';
import { Activity } from './models/Activity';
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

app.delete('/api/activities', async (req, res) => {
  try {
    await Activity.deleteMany({});
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error eliminando actividades' });
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
