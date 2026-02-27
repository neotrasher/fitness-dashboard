import { useState, useEffect, useRef } from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, subWeeks, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { ActivityDetail } from './components/ActivityDetail';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const API_URL = 'http://157.254.174.220:3001/api';

interface Activity {
  _id: string;
  activityType: string;
  activityCategory: string;
  workoutType?: string;
  runningSubType?: string;
  startTime: string;
  duration: number;
  distance: number;
  averageHR?: number;
  averagePace?: number;
  calories?: number;
  name?: string;
  elevationGain?: number;
}

interface Goal {
  _id: string;
  name: string;
  type: 'primary' | 'intermediate';
  raceType: string;
  distance?: number;
  targetDate: string;
  targetTime?: string;
  notes?: string;
  completed: boolean;
}

interface WeeklyVolume {
  week: string;
  weekStart: Date;
  distance: number;
  duration: number;
  sessions: number;
  avgPace: number;
}

const PERIODS = [
  { value: '1w', label: '7D' },
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1A' },
  { value: 'all', label: 'Todo' },
];

const WORKOUT_LABELS: Record<string, string> = {
  intervals: 'INT',
  tempo: 'TMP',
  long_run: 'LSD',
  easy: 'EASY',
  recovery: 'REC',
  race: 'RACE',
  fartlek: 'FRTK',
  general: 'RUN'
};

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'activities' | 'goals' | 'coach'>('dashboard');
  const [period, setPeriod] = useState('3m');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [stravaConnected, setStravaConnected] = useState(false);
  const [stravaUser, setStravaUser] = useState<{ name: string; picture: string } | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [allActivities, setAllActivities] = useState<Activity[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [weeklyVolumes, setWeeklyVolumes] = useState<WeeklyVolume[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [thisWeekStats, setThisWeekStats] = useState({ distance: 0, sessions: 0, duration: 0, avgPace: 0 });
  const [lastWeekStats, setLastWeekStats] = useState({ distance: 0, sessions: 0, duration: 0, avgPace: 0 });
  const [periodStats, setPeriodStats] = useState({
    running: { count: 0, distance: 0, duration: 0, avgPace: 0, avgHR: 0 },
    strength: { count: 0, duration: 0 }
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [selectedWeek, setSelectedWeek] = useState<{ start: Date; end: Date } | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalActivities, setTotalActivities] = useState(0);

  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [goalForm, setGoalForm] = useState({
    name: '',
    type: 'intermediate' as 'primary' | 'intermediate',
    raceType: '10k',
    distance: '',
    targetDate: '',
    targetTime: '',
    notes: '',
  });

  // Coach IA states
  const [coachMessages, setCoachMessages] = useState<{role: string; content: string}[]>([]);
  const [coachInput, setCoachInput] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);
  useEffect(() => {
    checkStravaStatus();
    loadGoals();
  }, []);

  useEffect(() => {
    if (stravaConnected) {
      loadAllData();
      loadPredictions();
    }
  }, [period, stravaConnected]);


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('strava') === 'connected') {
      setStravaConnected(true);
      syncStrava();
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const checkStravaStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/strava/status`);
      const data = await res.json();
      setStravaConnected(data.connected);
      if (data.user) setStravaUser(data.user);
      if (data.connected) {
        fetch(`${API_URL}/strava/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullSync: false })
        }).catch(console.error);
      }
    } catch (error) {
      console.error('Error checking Strava:', error);
    } finally {
      setInitialLoading(false);
    }
  };

  const connectStrava = async () => {
    const res = await fetch(`${API_URL}/strava/auth`);
    const data = await res.json();
    window.location.href = data.url;
  };
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API_URL}/activities/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        alert("Actividad cargada!");
        await loadAllData();
      } else {
        alert("Error: " + data.error);
      }
    } catch (error) {
      console.error("Error uploading:", error);
      alert("Error subiendo archivo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const syncStrava = async () => {
    setLoading(true);
    await fetch(`${API_URL}/strava/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullSync: false })
    });
    await loadAllData();
    setLoading(false);
  };

  const loadAllData = async () => {
    setLoading(true);
    await Promise.all([
      loadActivities(1),
      loadStats(),
      loadWeeklyVolumes(),
    ]);
    setLoading(false);
  };

  const loadActivities = async (page: number = 1) => {
    const res = await fetch(`${API_URL}/activities?period=${period}&page=${page}&limit=50`);
    const data = await res.json();
    setActivities(data.activities);
    setAllActivities(data.activities);
    setCurrentPage(data.pagination.page);
    setTotalPages(data.pagination.totalPages);
    setTotalActivities(data.pagination.total);
    calculateThisWeekStats(data.activities);
  };

  const loadStats = async () => {
    const res = await fetch(`${API_URL}/stats?period=${period}`);
    const data = await res.json();
    setPeriodStats(data);
  };

  const loadWeeklyVolumes = async () => {
    const res = await fetch(`${API_URL}/activities?period=${period}&page=1&limit=500`);
    const data = await res.json();
    const acts: Activity[] = data.activities;

    const weeks: Map<string, WeeklyVolume> = new Map();
    const numWeeks = period === '1w' ? 4 : period === '1m' ? 6 : period === '3m' ? 12 : period === '6m' ? 24 : 52;

    for (let i = 0; i < numWeeks; i++) {
      const weekStart = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 });
      const key = format(weekStart, 'yyyy-MM-dd');
      weeks.set(key, { week: `S${numWeeks - i}`, weekStart, distance: 0, duration: 0, sessions: 0, avgPace: 0 });
    }

    acts.filter(a => a.activityCategory === 'cardio_running').forEach(a => {
      const weekStart = startOfWeek(new Date(a.startTime), { weekStartsOn: 1 });
      const key = format(weekStart, 'yyyy-MM-dd');
      const week = weeks.get(key);
      if (week) {
        week.distance += a.distance;
        week.duration += a.duration;
        week.sessions += 1;
      }
    });

    const sortedWeeks = Array.from(weeks.values())
      .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
      .slice(-12);

    setWeeklyVolumes(sortedWeeks);
  };

  const calculateThisWeekStats = (activities: Activity[]) => {
    const now = new Date();
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const lastWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    const lastWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });

    const thisWeek = activities.filter(a =>
      a.activityCategory === 'cardio_running' &&
      new Date(a.startTime) >= thisWeekStart
    );

    const lastWeek = activities.filter(a =>
      a.activityCategory === 'cardio_running' &&
      new Date(a.startTime) >= lastWeekStart &&
      new Date(a.startTime) <= lastWeekEnd
    );

    const calcStats = (acts: Activity[]) => ({
      distance: acts.reduce((sum, a) => sum + a.distance, 0),
      sessions: acts.length,
      duration: acts.reduce((sum, a) => sum + a.duration, 0),
      avgPace: acts.length > 0 ? acts.reduce((sum, a) => sum + (a.averagePace || 0), 0) / acts.length : 0
    });

    setThisWeekStats(calcStats(thisWeek));
    setLastWeekStats(calcStats(lastWeek));
  };

  const loadGoals = async () => {
    try {
      const res = await fetch(`${API_URL}/goals`);
      setGoals(await res.json());
    } catch (error) {
      console.error('Error loading goals:', error);
    }
  };

  const loadActivityDetail = async (activityId: string) => {
    const res = await fetch(`${API_URL}/activities/${activityId}`);
    setSelectedActivity(await res.json());
  };

  const saveGoal = async () => {
    const goalData = {
      name: goalForm.name,
      type: goalForm.type,
      raceType: goalForm.raceType,
      distance: goalForm.distance ? parseFloat(goalForm.distance) * 1000 : undefined,
      targetDate: goalForm.targetDate,
      targetTime: goalForm.targetTime || undefined,
      notes: goalForm.notes || undefined,
    };
    if (editingGoal) {
      await fetch(`${API_URL}/goals/${editingGoal._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(goalData),
      });
    } else {
      await fetch(`${API_URL}/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(goalData),
      });
    }
    setShowGoalModal(false);
    loadGoals();
  };

  const deleteGoal = async (id: string) => {
    if (!confirm('¿Eliminar objetivo?')) return;
    await fetch(`${API_URL}/goals/${id}`, { method: 'DELETE' });
    loadGoals();
  };

  const sendCoachMessage = async () => {
    if (!coachInput.trim()) return;
    const userMessage = { role: "user", content: coachInput };
    setCoachMessages(prev => [...prev, userMessage]);
    setCoachInput("");
    setCoachLoading(true);
    try {
      const res = await fetch(`${API_URL}/activities/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: coachInput,
          conversationHistory: coachMessages,
          period
        }),
      });
      const data = await res.json();
      setCoachMessages(prev => [...prev, { role: "assistant", content: data.response }]);
    } catch (error) {
      setCoachMessages(prev => [...prev, { role: "assistant", content: "Error al conectar con el coach. Intenta de nuevo." }]);
    } finally {
      setCoachLoading(false);
    }
  };

  const formatPace = (pace: number) => {
    if (!pace) return '--:--';
    const mins = Math.floor(pace);
    const secs = Math.round((pace - mins) * 60);
    if (secs === 60) return `${mins + 1}:00`;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDistance = (m: number) => (m / 1000).toFixed(1);

  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const getPercentChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const primaryGoal = goals.find(g => g.type === 'primary' && !g.completed);
  const daysToGoal = primaryGoal ? differenceInDays(new Date(primaryGoal.targetDate), new Date()) : null;

  const [predictions, setPredictions] = useState<Record<string, { time: number; basedOn: string }> | null>(null);
  const loadPredictions = async () => {
    try {
      const res = await fetch(`${API_URL}/stats/predictions`);
      const data = await res.json();
      setPredictions(data.predictions);
    } catch (error) {
      console.error('Error loading predictions:', error);
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };


  const weeklyVolumeChart = {
    labels: weeklyVolumes.map(w => format(w.weekStart, 'dd MMM', { locale: es })),
    datasets: [{
      data: weeklyVolumes.map(w => w.distance / 1000),
      backgroundColor: weeklyVolumes.map((w, i) =>
        selectedWeek && format(w.weekStart, 'yyyy-MM-dd') === format(selectedWeek.start, 'yyyy-MM-dd')
          ? '#06b6d4'
          : i === weeklyVolumes.length - 1
            ? 'rgba(6, 182, 212, 0.7)'
            : 'rgba(6, 182, 212, 0.4)'
      ),
      borderRadius: 4,
      barThickness: 20,
    }],
  };

  const handleWeekClick = (weekIndex: number) => {
    const week = weeklyVolumes[weekIndex];
    if (week) {
      const weekEnd = endOfWeek(week.weekStart, { weekStartsOn: 1 });
      setSelectedWeek({ start: week.weekStart, end: weekEnd });
      setActiveTab('activities');
    }
  };


  const thisWeekDays = eachDayOfInterval({
    start: startOfWeek(subWeeks(new Date(), weekOffset), { weekStartsOn: 1 }),
    end: endOfWeek(subWeeks(new Date(), weekOffset), { weekStartsOn: 1 })
  });

  const getActivitiesForDay = (date: Date) => {
    return allActivities.filter(a =>
      format(new Date(a.startTime), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
    );
  };


  if (initialLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <div className="text-gray-500">Cargando...</div>
      </div>
    );
  }

  if (!stravaConnected) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-6 font-light tracking-tight">RUNNING</div>
          <div className="text-gray-500 mb-8">Dashboard personal de entrenamiento</div>
          <button onClick={connectStrava}
            className="bg-[#fc4c02] hover:bg-[#e34402] px-8 py-3 rounded font-medium tracking-wide">
            Conectar con Strava
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="border-b border-gray-800/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <span className="text-xl font-light tracking-tight">RUNNING</span>
              <nav className="flex gap-1">
                {(['dashboard', 'activities', 'goals', 'coach'] as const).map(tab => (
                  <button key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                      }`}>
                    {tab === 'dashboard' ? 'Dashboard' : tab === 'activities' ? 'Actividades' : tab === 'goals' ? 'Objetivos' : 'Coach IA'}
                  </button>
                ))}
              </nav>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex gap-1 bg-gray-900/50 rounded p-1">
                {PERIODS.map(p => (
                  <button key={p.value} onClick={() => setPeriod(p.value)}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${period === p.value ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'
                      }`}>
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Upload FIT/GPX */}
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".gpx,.fit" className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="text-gray-500 hover:text-white transition-colors" title="Subir FIT/GPX">
                <svg className={`w-5 h-5 ${uploading ? "animate-pulse" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </button>
              <button onClick={syncStrava} disabled={loading}
                className="text-gray-500 hover:text-white transition-colors">
                <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>

              {stravaUser && (
                <img src={stravaUser.picture} alt="" className="w-8 h-8 rounded-full" />
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {primaryGoal && (
              <div className="bg-gradient-to-r from-cyan-900/20 to-transparent border border-cyan-900/30 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-gray-400 text-sm mb-1">Próximo objetivo</div>
                    <div className="text-2xl font-light">{primaryGoal.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-4xl font-light text-cyan-400">{daysToGoal}</div>
                    <div className="text-gray-500 text-sm">días</div>
                  </div>
                  {primaryGoal.targetTime && (
                    <div className="text-right">
                      <div className="text-gray-400 text-sm">Objetivo</div>
                      <div className="text-2xl font-light">{primaryGoal.targetTime}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 gap-4">
              <MetricCard
                label="Esta semana"
                value={`${formatDistance(thisWeekStats.distance)} km`}
                change={getPercentChange(thisWeekStats.distance, lastWeekStats.distance)}
              />
              <MetricCard
                label="Ritmo promedio"
                value={`${formatPace(periodStats.running.avgPace || 0)}/km`}
              />
              <MetricCard
                label="FC promedio"
                value={`${Math.round(periodStats.running.avgHR || 0)} bpm`}
              />
              <MetricCard
                label="Sesiones"
                value={thisWeekStats.sessions.toString()}
                subtitle={`de ${periodStats.running.count} totales`}
              />
            </div>

            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 bg-gray-900/30 rounded-lg p-6">
                <div className="text-sm text-gray-400 mb-4">Volumen semanal (km)</div>
                <div className="h-48">
                  <Bar
                    data={weeklyVolumeChart}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      onClick: (_, elements) => {
                        if (elements.length > 0) {
                          handleWeekClick(elements[0].index);
                        }
                      },
                      plugins: { legend: { display: false } },
                      scales: {
                        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#6b7280' } },
                        x: { grid: { display: false }, ticks: { color: '#6b7280', maxRotation: 45 } }
                      },
                      onHover: (event, elements) => {
                        const target = event.native?.target as HTMLElement;
                        if (target) {
                          target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
                        }
                      }
                    }}
                  />

                </div>
              </div>

              <div className="bg-gray-900/30 rounded-lg p-6">
                <div className="text-sm text-gray-400 mb-4">Predicción de tiempos</div>
                {predictions && Object.keys(predictions).length > 0 ? (
                  <div className="space-y-3">
                    {['5K', '10K', 'Half-Marathon', 'Marathon'].map(dist => {
                      const pred = predictions[dist];
                      if (!pred) return null;
                      return (
                        <div key={dist} className="flex justify-between items-center">
                          <div>
                            <span className="text-gray-400">{dist === 'Half-Marathon' ? 'HM' : dist === 'Marathon' ? 'M' : dist}</span>
                            {pred.basedOn === 'PR' && (
                              <span className="ml-2 text-xs text-cyan-500">PR</span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-xl font-light">{formatTime(pred.time)}</span>
                            {pred.basedOn !== 'PR' && (
                              <div className="text-xs text-gray-500">desde {pred.basedOn}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-gray-600 text-sm">Cargando predicciones...</div>
                )}
              </div>
            </div>

            <div className="bg-gray-900/30 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setWeekOffset(weekOffset + 1)} className="text-gray-500 hover:text-white p-1">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <div className="text-sm text-gray-400">
                  {weekOffset === 0 ? "Esta semana" : weekOffset === 1 ? "Semana pasada" : `Hace ${weekOffset} semanas`}
                </div>
                <button onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))} disabled={weekOffset === 0} className="text-gray-500 hover:text-white p-1 disabled:opacity-30">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {thisWeekDays.map(day => {
                  const dayActivities = getActivitiesForDay(day);
                  const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                  const isPast = day < new Date() && !isToday;
                  const runActivity = dayActivities.find(a => a.activityCategory === 'cardio_running');
                  const gymActivity = dayActivities.find(a => a.activityCategory === 'strength');

                  return (
                    <div key={day.toISOString()}
                      className={`p-3 rounded-lg text-center ${isToday ? 'bg-cyan-900/30 border border-cyan-800/50' :
                        dayActivities.length > 0 ? 'bg-gray-800/50' : 'bg-gray-900/50'
                        }`}>
                      <div className="text-xs text-gray-500 mb-1">
                        {format(day, 'EEE', { locale: es }).toUpperCase()}
                      </div>
                      <div className="text-lg font-light mb-2">
                        {format(day, 'd')}
                      </div>
                      <div className="space-y-1 min-h-[40px]">
                        {runActivity && (
                          <div
                            className="text-cyan-400 text-xs font-medium cursor-pointer hover:text-cyan-300"
                            onClick={() => loadActivityDetail(runActivity._id)}>
                            {formatDistance(runActivity.distance)}k
                            <span className="text-gray-500 ml-1">
                              {WORKOUT_LABELS[runActivity.workoutType || 'general']}
                            </span>
                          </div>
                        )}
                        {gymActivity && (
                          <div
                            className="text-amber-400 text-xs font-medium cursor-pointer hover:text-amber-300"
                            onClick={() => loadActivityDetail(gymActivity._id)}>
                            GYM
                          </div>
                        )}
                        {dayActivities.length === 0 && isPast && (
                          <div className="text-gray-700 text-xs">--</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>


            <div className="grid grid-cols-2 gap-6">
              <div className="bg-gray-900/30 rounded-lg p-6">
                <div className="text-sm text-gray-400 mb-4">Distribución por tipo</div>
                <div className="space-y-3">
                  {(() => {
                    const types = allActivities
                      .filter(a => a.activityCategory === 'cardio_running')
                      .reduce((acc, a) => {
                        const type = a.workoutType || 'general';
                        acc[type] = (acc[type] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>);

                    const total = Object.values(types).reduce((a, b) => a + b, 0);
                    const sorted = Object.entries(types).sort((a, b) => b[1] - a[1]);

                    return sorted.slice(0, 5).map(([type, count]) => (
                      <div key={type} className="flex items-center gap-3">
                        <div className="w-24 text-sm text-gray-400 capitalize">
                          {type.replace('_', ' ')}
                        </div>
                        <div className="flex-1 bg-gray-800 rounded-full h-2">
                          <div className="bg-cyan-500 h-2 rounded-full"
                            style={{ width: `${(count / total) * 100}%` }} />
                        </div>
                        <div className="w-12 text-right text-sm text-gray-500">
                          {Math.round((count / total) * 100)}%
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              <div className="bg-gray-900/30 rounded-lg p-6">
                <div className="text-sm text-gray-400 mb-4">Resumen del período</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-3xl font-light">{formatDistance(periodStats.running.distance)}</div>
                    <div className="text-sm text-gray-500">km totales</div>
                  </div>
                  <div>
                    <div className="text-3xl font-light">{periodStats.running.count}</div>
                    <div className="text-sm text-gray-500">carreras</div>
                  </div>
                  <div>
                    <div className="text-3xl font-light">{Math.round(periodStats.running.duration / 3600)}</div>
                    <div className="text-sm text-gray-500">horas</div>
                  </div>
                  <div>
                    <div className="text-3xl font-light">{periodStats.strength.count}</div>
                    <div className="text-sm text-gray-500">sesiones fuerza</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'activities' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-400">
                {selectedWeek
                  ? `Semana del ${format(selectedWeek.start, 'dd MMM', { locale: es })} al ${format(selectedWeek.end, 'dd MMM', { locale: es })}`
                  : `${totalActivities} actividades`
                }
              </div>
              {selectedWeek && (
                <button
                  onClick={() => setSelectedWeek(null)}
                  className="text-xs text-cyan-400 hover:text-cyan-300"
                >
                  Ver todas
                </button>
              )}
            </div>


            <div className="bg-gray-900/30 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Nombre</th>
                    <th className="px-4 py-3 font-medium text-right">Distancia</th>
                    <th className="px-4 py-3 font-medium text-right">Tiempo</th>
                    <th className="px-4 py-3 font-medium text-right">Ritmo</th>
                    <th className="px-4 py-3 font-medium text-right">FC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {activities
                    .filter(a => {
                      if (!selectedWeek) return true;
                      const actDate = new Date(a.startTime);
                      return actDate >= selectedWeek.start && actDate <= selectedWeek.end;
                    })
                    .map(a => (
                      <tr key={a._id} onClick={() => loadActivityDetail(a._id)}
                        className="hover:bg-gray-800/30 cursor-pointer transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-400">
                          {format(new Date(a.startTime), 'dd MMM', { locale: es })}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded ${a.activityCategory === 'cardio_running' ? 'bg-cyan-900/30 text-cyan-400' :
                            a.activityCategory === 'strength' ? 'bg-amber-900/30 text-amber-400' :
                              'bg-gray-800 text-gray-400'
                            }`}>
                            {a.activityCategory === 'cardio_running' ? 'RUN' :
                              a.activityCategory === 'strength' ? 'GYM' : a.activityType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">{a.name || '--'}</td>
                        <td className="px-4 py-3 text-sm text-right">
                          {a.distance > 0 ? `${formatDistance(a.distance)} km` : '--'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-400">
                          {formatDuration(a.duration)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          {a.averagePace ? `${formatPace(a.averagePace)}` : '--'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-400">
                          {a.averageHR ? `${Math.round(a.averageHR)}` : '--'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center gap-2">
                <button onClick={() => loadActivities(currentPage - 1)} disabled={currentPage === 1}
                  className="px-3 py-1 text-sm text-gray-500 hover:text-white disabled:opacity-30">
                  Anterior
                </button>
                <span className="px-3 py-1 text-sm text-gray-500">
                  {currentPage} / {totalPages}
                </span>
                <button onClick={() => loadActivities(currentPage + 1)} disabled={currentPage === totalPages}
                  className="px-3 py-1 text-sm text-gray-500 hover:text-white disabled:opacity-30">
                  Siguiente
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'goals' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-400">Objetivos</div>
              <button onClick={() => {
                setEditingGoal(null);
                setGoalForm({ name: '', type: 'intermediate', raceType: '10k', distance: '', targetDate: '', targetTime: '', notes: '' });
                setShowGoalModal(true);
              }} className="text-sm text-cyan-400 hover:text-cyan-300">
                + Nuevo objetivo
              </button>
            </div>

            <div className="space-y-3">
              {goals.filter(g => !g.completed).map(g => (
                <div key={g._id} className={`bg-gray-900/30 rounded-lg p-4 border-l-2 ${g.type === 'primary' ? 'border-cyan-500' : 'border-gray-700'
                  }`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        {g.type === 'primary' && <span className="text-xs text-cyan-400">PRINCIPAL</span>}
                        <span className="font-medium">{g.name}</span>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {format(new Date(g.targetDate), 'dd MMMM yyyy', { locale: es })}
                        {g.targetTime && ` · Objetivo: ${g.targetTime}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-light text-cyan-400">
                        {differenceInDays(new Date(g.targetDate), new Date())}
                      </div>
                      <div className="text-xs text-gray-500">días</div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => deleteGoal(g._id)} className="text-xs text-gray-500 hover:text-red-400">
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

        {activeTab === "coach" && (
          <div className="space-y-6">
            <div className="bg-gray-900/30 rounded-lg p-6">
              <div className="text-sm text-gray-400 mb-4">🤖 Coach IA - Llama 3.2</div>
              
              <div className="h-96 overflow-y-auto mb-4 space-y-4">
                {coachMessages.length === 0 && (
                  <div className="text-center text-gray-500 py-12">
                    <div className="text-4xl mb-4">🏃</div>
                    <div>¡Hola! Soy tu coach de running.</div>
                    <div className="text-sm mt-2">Pregúntame sobre tu entrenamiento, ritmos, objetivos...</div>
                  </div>
                )}
                {coachMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-lg px-4 py-2 ${msg.role === "user" ? "bg-cyan-900/50 text-white" : "bg-gray-800 text-gray-200"}`}>
                      <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                    </div>
                  </div>
                ))}
                {coachLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-800 rounded-lg px-4 py-2 text-gray-400">Pensando...</div>
                  </div>
                )}
              </div>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={coachInput}
                  onChange={(e) => setCoachInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendCoachMessage()}
                  placeholder="Pregunta a tu coach..."
                  className="flex-1 bg-gray-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
                <button
                  onClick={sendCoachMessage}
                  disabled={coachLoading || !coachInput.trim()}
                  className="bg-cyan-600 hover:bg-cyan-500 px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  Enviar
                </button>
              </div>
            </div>
          </div>
        )}

      {selectedActivity && (
        <ActivityDetail activity={selectedActivity} onClose={() => setSelectedActivity(null)} />
      )}

      {showGoalModal && (

        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-lg max-w-md w-full p-6">
            <div className="text-lg font-medium mb-4">{editingGoal ? 'Editar' : 'Nuevo'} objetivo</div>
            <div className="space-y-4">
              <input type="text" value={goalForm.name} onChange={e => setGoalForm({ ...goalForm, name: e.target.value })}
                placeholder="Nombre de la carrera" className="w-full bg-gray-800 rounded px-4 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-4">
                <select value={goalForm.type} onChange={e => setGoalForm({ ...goalForm, type: e.target.value as any })}
                  className="bg-gray-800 rounded px-4 py-2 text-sm">
                  <option value="primary">Principal</option>
                  <option value="intermediate">Intermedio</option>
                </select>
                <select value={goalForm.raceType} onChange={e => setGoalForm({ ...goalForm, raceType: e.target.value })}
                  className="bg-gray-800 rounded px-4 py-2 text-sm">
                  <option value="5k">5K</option>
                  <option value="10k">10K</option>
                  <option value="half_marathon">Media Maratón</option>
                  <option value="marathon">Maratón</option>
                </select>
              </div>
              <input type="date" value={goalForm.targetDate} onChange={e => setGoalForm({ ...goalForm, targetDate: e.target.value })}
                className="w-full bg-gray-800 rounded px-4 py-2 text-sm" />
              <input type="text" value={goalForm.targetTime} onChange={e => setGoalForm({ ...goalForm, targetTime: e.target.value })}
                placeholder="Tiempo objetivo (ej: 3:30:00)" className="w-full bg-gray-800 rounded px-4 py-2 text-sm" />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowGoalModal(false)} className="flex-1 py-2 text-gray-400 hover:text-white">
                Cancelar
              </button>
              <button onClick={saveGoal} disabled={!goalForm.name || !goalForm.targetDate}
                className="flex-1 bg-cyan-600 hover:bg-cyan-500 py-2 rounded disabled:opacity-50">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, change, subtitle }: {
  label: string;
  value: string;
  change?: number;
  subtitle?: string;
}) {
  return (
    <div className="bg-gray-900/30 rounded-lg p-4">
      <div className="text-xs text-gray-500 mb-2">{label}</div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-light">{value}</span>
        {change !== undefined && change !== 0 && (
          <span className={`text-xs mb-1 ${change > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {change > 0 ? '↑' : '↓'} {Math.abs(change)}%
          </span>
        )}
      </div>
      {subtitle && <div className="text-xs text-gray-600 mt-1">{subtitle}</div>}
    </div>
  );
}

export default App;
