import { useState, useEffect } from 'react';
import { format } from 'date-fns';
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
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const API_URL = 'http://157.254.174.220:3001/api';

// Tipos
interface Activity {
  _id: string;
  activityType: string;
  activityCategory: string;
  startTime: string;
  duration: number;
  distance: number;
  averageHR?: number;
  averagePace?: number;
  calories?: number;
  name?: string;
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

interface Stats {
  running: { count: number; distance: number; duration: number; avgHR: number; avgPace: string };
  strength: { count: number; duration: number; calories: number };
  cycling: { count: number; distance: number; duration: number };
}

interface StravaUser {
  name: string;
  picture: string;
}

// Períodos disponibles
const PERIODS = [
  { value: '1w', label: '1 Semana' },
  { value: '1m', label: '1 Mes' },
  { value: '3m', label: '3 Meses' },
  { value: '6m', label: '6 Meses' },
  { value: '1y', label: '1 Año' },
  { value: '3y', label: '3 Años' },
  { value: 'all', label: 'Todo' },
];

const RACE_TYPES = [
  { value: '5k', label: '5K' },
  { value: '10k', label: '10K' },
  { value: 'half_marathon', label: 'Media Maratón' },
  { value: 'marathon', label: 'Maratón' },
  { value: 'trail', label: 'Trail' },
  { value: 'ultra', label: 'Ultra' },
  { value: 'other', label: 'Otra' },
];

function App() {
  // Estados principales
  const [activeTab, setActiveTab] = useState<'resumen' | 'coach' | 'actividades' | 'objetivos'>('resumen');
  const [period, setPeriod] = useState('1w');
  const [loading, setLoading] = useState(false);
  
  // Strava
  const [stravaConnected, setStravaConnected] = useState(false);
  const [stravaUser, setStravaUser] = useState<StravaUser | null>(null);
  
  // Datos
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [fitnessStatus, setFitnessStatus] = useState<string>('');
  const [goals, setGoals] = useState<Goal[]>([]);
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalActivities, setTotalActivities] = useState(0);
  const ITEMS_PER_PAGE = 50;
  
  // Chat
  const [chatMessages, setChatMessages] = useState<{role: string; content: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  
  // Modal de Goals
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

  // Cargar datos al inicio y cuando cambia el período
  useEffect(() => {
    checkStravaStatus();
    loadGoals();
  }, []);

  useEffect(() => {
    if (stravaConnected) {
      loadData();
    }
  }, [period, stravaConnected]);

  // Verificar si volvemos de Strava OAuth
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
      if (data.user) {
        setStravaUser(data.user);
      }
    } catch (error) {
      console.error('Error checking Strava:', error);
    }
  };

  const connectStrava = async () => {
    try {
      const res = await fetch(`${API_URL}/strava/auth`);
      const data = await res.json();
      window.location.href = data.url;
    } catch (error) {
      console.error('Error connecting Strava:', error);
    }
  };

  const syncStrava = async () => {
    setLoading(true);
    try {
      await fetch(`${API_URL}/strava/sync`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullSync: false })
      });
      await loadData();
    } catch (error) {
      console.error('Error syncing:', error);
    }
    setLoading(false);
  };

  const loadData = async () => {
    setLoading(true);
    setCurrentPage(1);
    try {
      await Promise.all([
        loadStats(),
        loadActivities(1),
        loadFitnessStatus(),
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    }
    setLoading(false);
  };

  const loadStats = async () => {
    const res = await fetch(`${API_URL}/stats?period=${period}`);
    const data = await res.json();
    setStats(data);
  };

  const loadActivities = async (page: number = 1) => {
    const res = await fetch(`${API_URL}/activities?period=${period}&page=${page}&limit=${ITEMS_PER_PAGE}`);
    const data = await res.json();
    setActivities(data.activities);
    setCurrentPage(data.pagination.page);
    setTotalPages(data.pagination.totalPages);
    setTotalActivities(data.pagination.total);
  };

  const loadFitnessStatus = async () => {
    const res = await fetch(`${API_URL}/fitness-status?period=${period}`);
    const data = await res.json();
    setFitnessStatus(data.status || 'Sin datos disponibles');
  };

  const loadGoals = async () => {
    try {
      const res = await fetch(`${API_URL}/goals`);
      const data = await res.json();
      setGoals(data);
    } catch (error) {
      console.error('Error loading goals:', error);
    }
  };

  // Chat con el coach
  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    
    const userMessage = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatLoading(true);

    try {
      const res = await fetch(`${API_URL}/activities/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: chatMessages,
          period,
        }),
      });
      const data = await res.json();
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (error) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Error al procesar tu mensaje.' }]);
    }
    setChatLoading(false);
  };

  // Goals CRUD
  const openGoalModal = (goal?: Goal) => {
    if (goal) {
      setEditingGoal(goal);
      setGoalForm({
        name: goal.name,
        type: goal.type,
        raceType: goal.raceType,
        distance: goal.distance ? (goal.distance / 1000).toString() : '',
        targetDate: goal.targetDate.split('T')[0],
        targetTime: goal.targetTime || '',
        notes: goal.notes || '',
      });
    } else {
      setEditingGoal(null);
      setGoalForm({
        name: '',
        type: 'intermediate',
        raceType: '10k',
        distance: '',
        targetDate: '',
        targetTime: '',
        notes: '',
      });
    }
    setShowGoalModal(true);
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

    try {
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
      loadFitnessStatus();
    } catch (error) {
      console.error('Error saving goal:', error);
    }
  };

  const deleteGoal = async (id: string) => {
    if (!confirm('¿Eliminar este objetivo?')) return;
    try {
      await fetch(`${API_URL}/goals/${id}`, { method: 'DELETE' });
      loadGoals();
      loadFitnessStatus();
    } catch (error) {
      console.error('Error deleting goal:', error);
    }
  };

  const toggleGoalCompleted = async (goal: Goal) => {
    try {
      await fetch(`${API_URL}/goals/${goal._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !goal.completed }),
      });
      loadGoals();
    } catch (error) {
      console.error('Error updating goal:', error);
    }
  };

  // Formatters
  const formatPace = (pace: string | number) => {
    const paceNum = typeof pace === 'string' ? parseFloat(pace) : pace;
    if (!paceNum || paceNum === 0) return '-';
    const minutes = Math.floor(paceNum);
    const seconds = Math.round((paceNum - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')} /km`;
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const formatDistance = (meters: number) => {
    return (meters / 1000).toFixed(1) + ' km';
  };

  const getDaysUntil = (date: string) => {
    const days = Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return 'Pasado';
    if (days === 0) return 'Hoy';
    if (days === 1) return 'Mañana';
    return `${days} días`;
  };

  // Charts data
  const getRunningChartData = () => {
    const runningActivities = activities
      .filter(a => a.activityCategory === 'cardio_running')
      .slice(0, 14)
      .reverse();

    return {
      labels: runningActivities.map(a => format(new Date(a.startTime), 'dd MMM', { locale: es })),
      datasets: [{
        label: 'Distancia (km)',
        data: runningActivities.map(a => (a.distance / 1000).toFixed(1)),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.3,
        fill: true,
      }],
    };
  };

  const getWeeklyVolumeData = () => {
    const running = stats?.running.duration || 0;
    const strength = stats?.strength.duration || 0;
    const cycling = stats?.cycling?.duration || 0;

    return {
      labels: ['Running', 'Fuerza', 'Ciclismo'],
      datasets: [{
        label: 'Minutos',
        data: [running / 60, strength / 60, cycling / 60],
        backgroundColor: ['#3b82f6', '#f59e0b', '#10b981'],
      }],
    };
  };

  // Render principal
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏃</span>
              <h1 className="text-xl font-bold">Fitness Dashboard</h1>
            </div>
            
            <div className="flex items-center gap-3">
              {stravaConnected ? (
                <>
                  {stravaUser && (
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      {stravaUser.picture && (
                        <img src={stravaUser.picture} alt="" className="w-8 h-8 rounded-full" />
                      )}
                      <span>{stravaUser.name}</span>
                    </div>
                  )}
                  <button
                    onClick={syncStrava}
                    disabled={loading}
                    className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 px-4 py-2 rounded-lg font-medium flex items-center gap-2"
                  >
                    {loading ? '⏳' : '🔄'} Sync
                  </button>
                </>
              ) : (
                <button
                  onClick={connectStrava}
                  className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-lg font-medium"
                >
                  Conectar Strava
                </button>
              )}
            </div>
          </div>

          {/* Tabs y Period Selector */}
          <div className="flex items-center justify-between mt-4">
            <nav className="flex gap-1">
              {[
                { id: 'resumen', label: '📊 Resumen' },
                { id: 'coach', label: '🤖 Coach IA' },
                { id: 'actividades', label: '📋 Actividades' },
                { id: 'objetivos', label: '🎯 Objetivos' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* Period Selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Período:</span>
              <div className="flex bg-gray-700 rounded-lg p-1">
                {PERIODS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setPeriod(p.value)}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      period === p.value
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {!stravaConnected ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🏃‍♂️</div>
            <h2 className="text-2xl font-bold mb-2">Conecta tu cuenta de Strava</h2>
            <p className="text-gray-400 mb-6">Sincroniza tus actividades para ver tu análisis personalizado</p>
            <button
              onClick={connectStrava}
              className="bg-orange-500 hover:bg-orange-600 px-6 py-3 rounded-lg font-medium text-lg"
            >
              Conectar con Strava
            </button>
          </div>
        ) : (
          <>
            {/* Tab: Resumen */}
            {activeTab === 'resumen' && (
              <div className="space-y-6">
                {/* Goals activos (mini preview) */}
                {goals.filter(g => !g.completed).length > 0 && (
                  <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-xl p-4 border border-purple-700/50">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold flex items-center gap-2">
                        🎯 Próximos Objetivos
                      </h3>
                      <button 
                        onClick={() => setActiveTab('objetivos')}
                        className="text-sm text-blue-400 hover:text-blue-300"
                      >
                        Ver todos →
                      </button>
                    </div>
                    <div className="flex gap-4 overflow-x-auto pb-2">
                      {goals.filter(g => !g.completed).slice(0, 3).map(goal => (
                        <div 
                          key={goal._id}
                          className={`flex-shrink-0 px-4 py-2 rounded-lg ${
                            goal.type === 'primary' 
                              ? 'bg-yellow-500/20 border border-yellow-500/50' 
                              : 'bg-gray-700/50 border border-gray-600'
                          }`}
                        >
                          <div className="font-medium">{goal.name}</div>
                          <div className="text-sm text-gray-400">
                            {format(new Date(goal.targetDate), 'dd MMM yyyy', { locale: es })} • {getDaysUntil(goal.targetDate)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fitness Status */}
                <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-xl p-6 border border-blue-700/50">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    📈 Estado de Fitness 
                    <span className="text-sm font-normal text-gray-400">
                      ({PERIODS.find(p => p.value === period)?.label})
                    </span>
                  </h2>
                  {loading ? (
                    <div className="animate-pulse">Analizando...</div>
                  ) : (
                    <div className="prose prose-invert max-w-none whitespace-pre-wrap">
                      {fitnessStatus}
                    </div>
                  )}
                </div>

                {/* Stats Cards */}
                <div className="space-y-4">
                  {/* Running Stats */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      🏃 Running / Cardio
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <StatCard label="Sesiones" value={stats?.running.count || 0} />
                      <StatCard label="Distancia" value={formatDistance(stats?.running.distance || 0)} />
                      <StatCard label="Tiempo" value={`${((stats?.running.duration || 0) / 3600).toFixed(1)} hrs`} />
                      <StatCard label="Ritmo Prom" value={formatPace(stats?.running.avgPace || '0')} />
                      <StatCard label="FC Prom" value={`${stats?.running.avgHR || '-'} bpm`} />
                    </div>
                  </div>

                  {/* Strength Stats */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      💪 Fuerza
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <StatCard label="Sesiones" value={stats?.strength.count || 0} />
                      <StatCard label="Tiempo" value={`${((stats?.strength.duration || 0) / 3600).toFixed(1)} hrs`} />
                      <StatCard label="Calorías" value={stats?.strength.calories || 0} />
                    </div>
                  </div>
                </div>

                {/* Charts */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-gray-800 rounded-xl p-4">
                    <h3 className="font-semibold mb-4">📈 Últimas Carreras (km)</h3>
                    <Line 
                      data={getRunningChartData()} 
                      options={{
                        responsive: true,
                        plugins: { legend: { display: false } },
                        scales: {
                          y: { grid: { color: 'rgba(255,255,255,0.1)' } },
                          x: { grid: { display: false } }
                        }
                      }}
                    />
                  </div>
                  <div className="bg-gray-800 rounded-xl p-4">
                    <h3 className="font-semibold mb-4">⏱️ Distribución por Tipo (min)</h3>
                    <Bar 
                      data={getWeeklyVolumeData()}
                      options={{
                        responsive: true,
                        plugins: { legend: { display: false } },
                        scales: {
                          y: { grid: { color: 'rgba(255,255,255,0.1)' } },
                          x: { grid: { display: false } }
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Coach IA */}
            {activeTab === 'coach' && (
              <div className="max-w-3xl mx-auto">
                <div className="bg-gray-800 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-gray-700">
                    <h2 className="font-bold flex items-center gap-2">
                      🤖 Coach IA
                      <span className="text-sm font-normal text-gray-400">
                        (Analizando: {PERIODS.find(p => p.value === period)?.label})
                      </span>
                    </h2>
                  </div>
                  
                  {/* Chat Messages */}
                  <div className="h-96 overflow-y-auto p-4 space-y-4">
                    {chatMessages.length === 0 && (
                      <div className="text-center text-gray-500 py-10">
                        <div className="text-4xl mb-2">💬</div>
                        <p>Pregúntame sobre tu entrenamiento</p>
                        <div className="flex flex-wrap justify-center gap-2 mt-4">
                          {[
                            '¿Cómo va mi semana?',
                            '¿Estoy listo para un 10K?',
                            '¿Debería descansar?',
                            'Analiza mi volumen',
                          ].map(q => (
                            <button
                              key={q}
                              onClick={() => { setChatInput(q); }}
                              className="px-3 py-1 bg-gray-700 rounded-full text-sm hover:bg-gray-600"
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {chatMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] px-4 py-2 rounded-2xl whitespace-pre-wrap ${
                            msg.role === 'user'
                              ? 'bg-blue-600 text-white rounded-br-md'
                              : 'bg-gray-700 text-gray-100 rounded-bl-md'
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex justify-start">
                        <div className="bg-gray-700 px-4 py-2 rounded-2xl rounded-bl-md">
                          <span className="animate-pulse">Pensando...</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Chat Input */}
                  <div className="p-4 border-t border-gray-700">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
                        placeholder="Escribe tu pregunta..."
                        className="flex-1 bg-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={sendChatMessage}
                        disabled={chatLoading || !chatInput.trim()}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg font-medium"
                      >
                        Enviar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Actividades */}
            {activeTab === 'actividades' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold">
                    📋 Actividades ({totalActivities})
                  </h2>
                </div>

                <div className="bg-gray-800 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left">Fecha</th>
                        <th className="px-4 py-3 text-left">Tipo</th>
                        <th className="px-4 py-3 text-left">Nombre</th>
                        <th className="px-4 py-3 text-right">Distancia</th>
                        <th className="px-4 py-3 text-right">Tiempo</th>
                        <th className="px-4 py-3 text-right">Ritmo</th>
                        <th className="px-4 py-3 text-right">FC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {activities.map(activity => (
                        <tr key={activity._id} className="hover:bg-gray-700/50">
                          <td className="px-4 py-3 text-sm">
                            {format(new Date(activity.startTime), 'dd MMM yyyy', { locale: es })}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              activity.activityCategory === 'cardio_running' 
                                ? 'bg-blue-500/20 text-blue-300'
                                : activity.activityCategory === 'strength'
                                ? 'bg-yellow-500/20 text-yellow-300'
                                : 'bg-green-500/20 text-green-300'
                            }`}>
                              {activity.activityCategory === 'cardio_running' ? '🏃 Running' 
                                : activity.activityCategory === 'strength' ? '💪 Fuerza'
                                : activity.activityType}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">{activity.name || '-'}</td>
                          <td className="px-4 py-3 text-right text-sm">
                            {activity.distance > 0 ? formatDistance(activity.distance) : '-'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            {formatDuration(activity.duration)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            {activity.averagePace ? formatPace(activity.averagePace) : '-'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            {activity.averageHR ? `${Math.round(activity.averageHR)} bpm` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Paginación */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <button
                      onClick={() => loadActivities(1)}
                      disabled={currentPage === 1}
                      className="px-3 py-2 bg-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-600"
                    >
                      ⏮️
                    </button>
                    <button
                      onClick={() => loadActivities(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-3 py-2 bg-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-600"
                    >
                      ◀️
                    </button>
                    
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => loadActivities(pageNum)}
                            className={`px-3 py-2 rounded-lg ${
                              currentPage === pageNum 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-gray-700 hover:bg-gray-600'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => loadActivities(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="px-3 py-2 bg-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-600"
                    >
                      ▶️
                    </button>
                    <button
                      onClick={() => loadActivities(totalPages)}
                      disabled={currentPage === totalPages}
                      className="px-3 py-2 bg-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-600"
                    >
                      ⏭️
                    </button>

                    <span className="text-gray-400 ml-4">
                      Página {currentPage} de {totalPages}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Objetivos */}
            {activeTab === 'objetivos' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold">🎯 Mis Objetivos</h2>
                  <button
                    onClick={() => openGoalModal()}
                    className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2"
                  >
                    ➕ Agregar Objetivo
                  </button>
                </div>

                {goals.length === 0 ? (
                  <div className="text-center py-16 bg-gray-800 rounded-xl">
                    <div className="text-5xl mb-4">🎯</div>
                    <h3 className="text-xl font-semibold mb-2">Sin objetivos definidos</h3>
                    <p className="text-gray-400 mb-4">Agrega tus próximas carreras para que el análisis las considere</p>
                    <button
                      onClick={() => openGoalModal()}
                      className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium"
                    >
                      Agregar primer objetivo
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Objetivos activos */}
                    <div>
                      <h3 className="font-semibold text-gray-400 mb-3">Próximos</h3>
                      <div className="space-y-3">
                        {goals.filter(g => !g.completed).map(goal => (
                          <div
                            key={goal._id}
                            className={`bg-gray-800 rounded-xl p-4 border-l-4 ${
                              goal.type === 'primary' ? 'border-yellow-500' : 'border-blue-500'
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  {goal.type === 'primary' && (
                                    <span className="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-0.5 rounded font-medium">
                                      PRINCIPAL
                                    </span>
                                  )}
                                  <h4 className="font-semibold text-lg">{goal.name}</h4>
                                </div>
                                <div className="flex flex-wrap gap-3 text-sm text-gray-400">
                                  <span>📅 {format(new Date(goal.targetDate), 'dd MMMM yyyy', { locale: es })}</span>
                                  <span className="text-blue-400 font-medium">{getDaysUntil(goal.targetDate)}</span>
                                  {goal.raceType && <span>🏁 {RACE_TYPES.find(r => r.value === goal.raceType)?.label}</span>}
                                  {goal.distance && <span>📏 {(goal.distance / 1000).toFixed(0)} km</span>}
                                  {goal.targetTime && <span>⏱️ Objetivo: {goal.targetTime}</span>}
                                </div>
                                {goal.notes && <p className="text-sm text-gray-500 mt-2">{goal.notes}</p>}
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => toggleGoalCompleted(goal)}
                                  className="p-2 hover:bg-gray-700 rounded-lg text-green-400"
                                  title="Marcar como completado"
                                >
                                  ✓
                                </button>
                                <button
                                  onClick={() => openGoalModal(goal)}
                                  className="p-2 hover:bg-gray-700 rounded-lg"
                                  title="Editar"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => deleteGoal(goal._id)}
                                  className="p-2 hover:bg-gray-700 rounded-lg text-red-400"
                                  title="Eliminar"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Objetivos completados */}
                    {goals.filter(g => g.completed).length > 0 && (
                      <div>
                        <h3 className="font-semibold text-gray-400 mb-3">Completados</h3>
                        <div className="space-y-3">
                          {goals.filter(g => g.completed).map(goal => (
                            <div
                              key={goal._id}
                              className="bg-gray-800/50 rounded-xl p-4 border-l-4 border-green-500 opacity-70"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="font-semibold line-through">{goal.name}</h4>
                                  <span className="text-sm text-gray-500">
                                    {format(new Date(goal.targetDate), 'dd MMM yyyy', { locale: es })}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => toggleGoalCompleted(goal)}
                                    className="p-2 hover:bg-gray-700 rounded-lg"
                                    title="Desmarcar"
                                  >
                                    ↩️
                                  </button>
                                  <button
                                    onClick={() => deleteGoal(goal._id)}
                                    className="p-2 hover:bg-gray-700 rounded-lg text-red-400"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Goal Modal */}
      {showGoalModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold mb-4">
              {editingGoal ? '✏️ Editar Objetivo' : '➕ Nuevo Objetivo'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Nombre de la carrera *</label>
                <input
                  type="text"
                  value={goalForm.name}
                  onChange={e => setGoalForm({...goalForm, name: e.target.value})}
                  placeholder="Ej: Maratón Valencia"
                  className="w-full bg-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Tipo</label>
                  <select
                    value={goalForm.type}
                    onChange={e => setGoalForm({...goalForm, type: e.target.value as 'primary' | 'intermediate'})}
                    className="w-full bg-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="primary">🎯 Principal</option>
                    <option value="intermediate">📌 Intermedio</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Tipo de carrera</label>
                  <select
                    value={goalForm.raceType}
                    onChange={e => setGoalForm({...goalForm, raceType: e.target.value})}
                    className="w-full bg-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {RACE_TYPES.map(rt => (
                      <option key={rt.value} value={rt.value}>{rt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Fecha *</label>
                <input
                  type="date"
                  value={goalForm.targetDate}
                  onChange={e => setGoalForm({...goalForm, targetDate: e.target.value})}
                  className="w-full bg-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Distancia (km)</label>
                  <input
                    type="number"
                    value={goalForm.distance}
                    onChange={e => setGoalForm({...goalForm, distance: e.target.value})}
                    placeholder="42.195"
                    className="w-full bg-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Tiempo objetivo</label>
                  <input
                    type="text"
                    value={goalForm.targetTime}
                    onChange={e => setGoalForm({...goalForm, targetTime: e.target.value})}
                    placeholder="3:30:00"
                    className="w-full bg-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Notas</label>
                <textarea
                  value={goalForm.notes}
                  onChange={e => setGoalForm({...goalForm, notes: e.target.value})}
                  placeholder="Detalles adicionales..."
                  rows={2}
                  className="w-full bg-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowGoalModal(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded-lg font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={saveGoal}
                disabled={!goalForm.name || !goalForm.targetDate}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 py-2 rounded-lg font-medium"
              >
                {editingGoal ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Componente auxiliar
function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="text-sm text-gray-400">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

export default App;
