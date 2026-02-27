import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ActivityMap } from './ActivityMap';

interface Lap {
  lap_index: number;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  average_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  total_elevation_gain?: number;
}

interface Split {
  distance: number;
  moving_time: number;
  elapsed_time: number;
  average_speed: number;
  average_heartrate?: number;
  elevation_difference?: number;
  split: number;
}

interface BestEffort {
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  start_index: number;
  end_index: number;
}

interface Activity {
  _id: string;
  stravaId?: number;
  name?: string;
  description?: string;
  activityType: string;
  activityCategory: string;
  workoutType?: string;
  runningSubType?: string;
  startTime: string;
  duration: number;
  elapsedTime?: number;
  distance: number;
  elevationGain?: number;
  averageHR?: number;
  maxHR?: number;
  averagePace?: number;
  maxPace?: number;
  averageCadence?: number;
  calories?: number;
  suffer_score?: number;
  laps?: Lap[];
  splits_metric?: Split[];
  best_efforts?: BestEffort[];
  map?: {
    summary_polyline?: string;
    summaryPolyline?: string;
    polyline?: string;
  };
  gear?: {
    id: string;
    name: string;
    distance: number;
  };
  hasDetailedData?: boolean;
}

interface Props {
  activity: Activity;
  onClose: () => void;
}

export function ActivityDetail({ activity, onClose }: Props) {
  const formatPace = (speed: number) => {
    if (!speed || speed === 0) return '--:--';
    const pace = 1000 / speed / 60;
    const mins = Math.floor(pace);
    const secs = Math.round((pace - mins) * 60);
    if (secs === 60) return `${mins + 1}:00`;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPaceFromMinKm = (pace: number) => {
    if (!pace) return '--:--';
    const mins = Math.floor(pace);
    const secs = Math.round((pace - mins) * 60);
    if (secs === 60) return `${mins + 1}:00`;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDistance = (meters: number) => (meters / 1000).toFixed(2);

  const WORKOUT_LABELS: Record<string, string> = {
    intervals: 'Intervalos',
    tempo: 'Tempo',
    long_run: 'Largo',
    easy: 'Fácil',
    recovery: 'Recuperación',
    race: 'Carrera',
    fartlek: 'Fartlek',
    general: 'General'
  };

  const SUBTYPE_LABELS: Record<string, string> = {
    outdoor: 'Calle',
    treadmill: 'Cinta',
    trail: 'Trail',
    virtual: 'Virtual'
  };

  // Calculate lap stats for visualization
  const laps = activity.laps || [];
  const splits = activity.splits_metric || [];
  const bestEfforts = activity.best_efforts || [];

  const maxLapPace = laps.length > 0 ? Math.max(...laps.map(l => l.average_speed)) : 0;
  const maxSplitPace = splits.length > 0 ? Math.max(...splits.map(s => s.average_speed)) : 0;
  const maxLapDistance = laps.length > 0 ? Math.max(...laps.map(l => l.distance)) : 0;

  return (
    <div className="fixed inset-0 bg-black/90 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#0a0a0f] border border-gray-800 rounded-lg max-w-4xl w-full my-8">
        {/* Header */}
        <div className="border-b border-gray-800 p-6">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-sm text-gray-500 mb-1">
                {format(new Date(activity.startTime), "EEEE, d 'de' MMMM yyyy · HH:mm", { locale: es })}
              </div>
              <h2 className="text-2xl font-light">{activity.name || 'Actividad'}</h2>
              <div className="flex gap-2 mt-3">
                {activity.workoutType && (
                  <span className="text-xs px-2 py-1 bg-cyan-900/30 text-cyan-400 rounded">
                    {WORKOUT_LABELS[activity.workoutType] || activity.workoutType}
                  </span>
                )}
                {activity.runningSubType && (
                  <span className="text-xs px-2 py-1 bg-gray-800 text-gray-400 rounded">
                    {SUBTYPE_LABELS[activity.runningSubType] || activity.runningSubType}
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white p-2">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Main Stats */}
        <div className="grid grid-cols-4 gap-4 p-6 border-b border-gray-800">
          <div>
            <div className="text-3xl font-light">{formatDistance(activity.distance)}</div>
            <div className="text-sm text-gray-500">km</div>
          </div>
          <div>
            <div className="text-3xl font-light">{formatDuration(activity.duration)}</div>
            <div className="text-sm text-gray-500">tiempo</div>
          </div>
          <div>
            <div className="text-3xl font-light">{formatPaceFromMinKm(activity.averagePace || 0)}</div>
            <div className="text-sm text-gray-500">/km</div>
          </div>
          <div>
            <div className="text-3xl font-light">{activity.averageHR ? Math.round(activity.averageHR) : '--'}</div>
            <div className="text-sm text-gray-500">bpm</div>
          </div>
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-5 gap-4 p-6 border-b border-gray-800 text-sm">
          <div>
            <div className="text-gray-500 mb-1">Elevación</div>
            <div className="font-medium">{activity.elevationGain ? `${Math.round(activity.elevationGain)} m` : '--'}</div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">Cadencia</div>
            <div className="font-medium">{activity.averageCadence ? `${Math.round(activity.averageCadence * 2)} spm` : '--'}</div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">FC Máx</div>
            <div className="font-medium">{activity.maxHR ? `${Math.round(activity.maxHR)} bpm` : '--'}</div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">Calorías</div>
            <div className="font-medium">{activity.calories ? `${Math.round(activity.calories)}` : '--'}</div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">Zapatillas</div>
            <div className="font-medium truncate">{activity.gear?.name || '--'}</div>
          </div>
        </div>

        {/* Description */}
        {activity.description && (
          <div className="p-6 border-b border-gray-800">
            <div className="text-sm text-gray-500 mb-2">Notas</div>
            <div className="text-sm whitespace-pre-wrap">{activity.description}</div>
          </div>
        )}

        {/* Map */}
        {(activity.map?.summary_polyline || activity.map?.summaryPolyline) && (
          <div className="p-6 border-b border-gray-800">
            <div className="text-sm text-gray-500 mb-3">Recorrido</div>
            <div className="h-64 rounded-lg overflow-hidden">
              <ActivityMap encodedPolyline={activity.map.summary_polyline || activity.map.summaryPolyline || activity.map.polyline || ''} />
            </div>
          </div>
        )}

        {/* Laps */}
        {laps.length > 0 && (
          <div className="p-6 border-b border-gray-800">
            <div className="text-sm text-gray-500 mb-3">Laps ({laps.length})</div>

            {/* Visual bars */}
            <div className="flex items-end gap-1 h-24 mb-4">
              {(() => {
                const minPace = Math.min(...laps.map(l => l.average_speed));
                const maxPace = Math.max(...laps.map(l => l.average_speed));
                const range = maxPace - minPace || 1;
                
                return laps.map((lap, i) => {
                  const heightPercent = maxLapPace > 0 ? (lap.average_speed / maxLapPace) * 100 : 50;
                  const widthPercent = maxLapDistance > 0 ? (lap.distance / maxLapDistance) * 100 : 100;
                  
                  // Posición relativa: 0 = más lento, 1 = más rápido
                  const relativePosition = (lap.average_speed - minPace) / range;
                  
                  // Interpolar entre azul oscuro (lento) y cyan (rápido)
                  // HSL: cyan ~185, azul ~220
                  const hue = 220 - (relativePosition * 35); // 220 → 185
                  const lightness = 35 + (relativePosition * 25); // 35% → 60%

                  return (
                    <div
                      key={i}
                      className="hover:brightness-125 transition-all rounded-t relative group cursor-pointer"
                      style={{ 
                        height: `${Math.max(heightPercent, 10)}%`,
                        flex: `${widthPercent} 0 0`,
                        backgroundColor: `hsl(${hue}, 70%, ${lightness}%)`
                      }}
                      title={`Lap ${i + 1}: ${formatPace(lap.average_speed)}/km`}
                    >
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-800 px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 border border-gray-700">
                        <div className="font-medium">{formatPace(lap.average_speed)}/km</div>
                        <div className="text-gray-400">{(lap.distance / 1000).toFixed(2)} km</div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>



            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 text-xs">
                    <th className="pb-2 font-medium">Lap</th>
                    <th className="pb-2 font-medium text-right">Dist</th>
                    <th className="pb-2 font-medium text-right">Tiempo</th>
                    <th className="pb-2 font-medium text-right">Ritmo</th>
                    <th className="pb-2 font-medium text-right">FC</th>
                    <th className="pb-2 font-medium text-right">Cad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {laps.map((lap, i) => (
                    <tr key={i} className="text-gray-300">
                      <td className="py-2 text-gray-500">{i + 1}</td>
                      <td className="py-2 text-right">{(lap.distance / 1000).toFixed(2)}</td>
                      <td className="py-2 text-right text-gray-400">{formatDuration(lap.moving_time)}</td>
                      <td className="py-2 text-right font-medium">{formatPace(lap.average_speed)}</td>
                      <td className="py-2 text-right text-gray-400">{lap.average_heartrate ? Math.round(lap.average_heartrate) : '--'}</td>
                      <td className="py-2 text-right text-gray-400">{lap.average_cadence ? Math.round(lap.average_cadence * 2) : '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Splits */}
        {splits.length > 0 && (
          <div className="p-6 border-b border-gray-800">
            <div className="text-sm text-gray-500 mb-3">Splits por km ({splits.length})</div>

            {/* Visual bars */}
            <div className="flex items-end gap-1 h-20 mb-4">
              {(() => {
                const minPace = Math.min(...splits.map(s => s.average_speed));
                const maxPace = Math.max(...splits.map(s => s.average_speed));
                const range = maxPace - minPace || 1;
                
                return splits.map((split, i) => {
                  const heightPercent = maxSplitPace > 0 ? (split.average_speed / maxSplitPace) * 100 : 50;
                  const relativePosition = (split.average_speed - minPace) / range;
                  const hue = 220 - (relativePosition * 35);
                  const lightness = 35 + (relativePosition * 25);

                  return (
                    <div
                      key={i}
                      className="hover:brightness-125 transition-all rounded-t flex-1 relative group cursor-pointer"
                      style={{ 
                        height: `${Math.max(heightPercent, 10)}%`,
                        backgroundColor: `hsl(${hue}, 70%, ${lightness}%)`
                      }}
                    >
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-800 px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 border border-gray-700">
                        <div className="font-medium">Km {split.split}</div>
                        <div className="text-cyan-400">{formatPace(split.average_speed)}/km</div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Compact grid */}
            <div className="grid grid-cols-5 gap-2 text-xs">
              {splits.map((split, i) => (
                <div key={i} className="bg-gray-900/50 rounded p-2 text-center">
                  <div className="text-gray-500 mb-1">Km {split.split}</div>
                  <div className="font-medium">{formatPace(split.average_speed)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Best Efforts */}
        {bestEfforts.length > 0 && (
          <div className="p-6 border-b border-gray-800">
            <div className="text-sm text-gray-500 mb-3">Mejores esfuerzos</div>
            <div className="grid grid-cols-4 gap-3">
              {bestEfforts
                .filter(e => ['400m', '1/2 mile', '1K', '1 mile', '2 mile', '5K', '10K'].includes(e.name))
                .map((effort, i) => (
                  <div key={i} className="bg-gray-900/50 rounded p-3">
                    <div className="text-xs text-gray-500 mb-1">{effort.name}</div>
                    <div className="text-lg font-light">{formatDuration(effort.moving_time)}</div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Strava Link */}
        {activity.stravaId && (
          <div className="p-6">
            <a
              href={`https://www.strava.com/activities/${activity.stravaId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-[#fc4c02] transition-colors"
            >
              Ver en Strava →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
