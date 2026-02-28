import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ActivityMap } from './ActivityMap';
import { ActivityCharts } from './ActivityCharts';

interface Lap {
  // Campos nuevos (FIT upload)
  index?: number;
  totalTime?: number;
  avgSpeed?: number;
  maxSpeed?: number;
  avgHR?: number;
  maxHR?: number;
  avgCadence?: number;
  avgPower?: number;
  // Campos Strava (legacy)
  lap_index?: number;
  moving_time?: number;
  elapsed_time?: number;
  average_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  // Comunes
  distance: number;
  calories?: number;
  total_elevation_gain?: number;
  elevationGain?: number;
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
  moving_time?: number;
  movingTime?: number;
  elapsed_time?: number;
  elapsedTime?: number;
  start_index?: number;
  end_index?: number;
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
  subSport?: string;
  isIndoor?: boolean;
  startTime: string;
  duration: number;
  elapsedTime?: number;
  distance: number;
  elevationGain?: number;
  elevationLoss?: number;
  averageHR?: number;
  maxHR?: number;
  averagePace?: number;
  averageSpeed?: number;
  maxSpeed?: number;
  averageCadence?: number;
  avgCadence?: number;
  maxCadence?: number;
  avgPower?: number;
  normalizedPower?: number;
  calories?: number;
  trainingEffect?: number;
  avgTemperature?: number;
  avgVerticalOscillation?: number;
  avgStanceTime?: number;
  avgVerticalRatio?: number;
  avgStepLength?: number;
  suffer_score?: number;
  hasGPS?: boolean;
  startLat?: number;
  startLng?: number;
  laps?: Lap[];
  splitsMetric?: Split[];
  splits_metric?: Split[];
  bestEfforts?: BestEffort[];
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

  // Pace from km/h
  const formatPaceFromSpeed = (speed: number) => {
    if (!speed || speed <= 0) return '--:--';
    const kmh = speed * 3.6; // m/s to km/h
    const paceMins = 60 / kmh;
    const mins = Math.floor(paceMins);
    const secs = Math.round((paceMins - mins) * 60);
    if (secs === 60) return `${mins + 1}:00`;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Pace from min/km decimal
  const formatPaceFromMinKm = (pace: number) => {
    if (!pace || pace <= 0) return '--:--';
    const mins = Math.floor(pace);
    const secs = Math.round((pace - mins) * 60);
    if (secs === 60) return `${mins + 1}:00`;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds: number) => {
    const totalSecs = Math.round(seconds); // fix decimals
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDistance = (meters: number) => (meters / 1000).toFixed(2);

  // Lap helpers — support both Strava and FIT field names
  const getLapTime = (lap: Lap) => lap.totalTime || lap.moving_time || lap.elapsed_time || 0;
  const getLapSpeed = (lap: Lap) => lap.avgSpeed || lap.average_speed || 0;
  const getLapHR = (lap: Lap) => lap.avgHR || lap.average_heartrate || 0;
  const getLapCadence = (lap: Lap) => {
    // FIT: already multiplied x2 in parser
    if (lap.avgCadence) return lap.avgCadence;
    // Strava: single-leg, multiply x2
    if (lap.average_cadence) return lap.average_cadence * 2;
    return 0;
  };
  const getLapDistance = (lap: Lap) => {
    // FIT: distance in km, Strava: distance in meters
    const d = lap.distance || 0;
    return d < 50 ? d * 1000 : d; // if < 50, likely km → convert to meters
  };

  // Elevation: FIT returns km, Strava returns meters
  const getElevationMeters = (elev?: number) => {
    if (!elev || elev === 0) return null;
    return elev < 10 ? Math.round(elev * 1000) : Math.round(elev); // if < 10, likely km
  };

  // Cadence: FIT already x2, Strava needs x2
  const getSessionCadence = () => {
    if (activity.avgCadence) return activity.avgCadence; // FIT: already correct
    if (activity.averageCadence) return activity.averageCadence * 2; // Strava: x2
    return 0;
  };

  // Pace display
  const getPaceDisplay = () => {
    if (activity.averagePace && activity.averagePace > 0) return formatPaceFromMinKm(activity.averagePace);
    if (activity.averageSpeed && activity.averageSpeed > 0) return formatPaceFromSpeed(activity.averageSpeed);
    return '--:--';
  };

  const WORKOUT_LABELS: Record<string, string> = {
    intervals: 'Intervalos', tempo: 'Tempo', long_run: 'Largo',
    easy: 'Fácil', recovery: 'Recuperación', race: 'Carrera',
    fartlek: 'Fartlek', general: 'General'
  };

  const SUBTYPE_LABELS: Record<string, string> = {
    outdoor: 'Calle', treadmill: 'Cinta', trail: 'Trail',
    virtual: 'Virtual', generic: 'General', street: 'Calle', track: 'Pista'
  };

  const laps = (activity.laps || []).filter(lap => (lap.totalTime || lap.elapsed_time || 0) > 10);
  const splits = activity.splitsMetric || activity.splits_metric || [];
  const bestEfforts = activity.bestEfforts || activity.best_efforts || [];
  const elevMeters = getElevationMeters(activity.elevationGain);
  const cadence = getSessionCadence();

  const lapSpeeds = laps.map(l => getLapSpeed(l)).filter(s => s > 0);
  const maxLapSpeed = lapSpeeds.length > 0 ? Math.max(...lapSpeeds) : 0;
  const minLapSpeed = lapSpeeds.length > 0 ? Math.min(...lapSpeeds) : 0;
  const lapDistances = laps.map(l => getLapDistance(l));
  const maxLapDist = lapDistances.length > 0 ? Math.max(...lapDistances) : 0;

  const subType = activity.subSport || activity.runningSubType;

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
                {subType && subType !== 'generic' && (
                  <span className="text-xs px-2 py-1 bg-gray-800 text-gray-400 rounded">
                    {SUBTYPE_LABELS[subType] || subType}
                  </span>
                )}
                {activity.isIndoor && (
                  <span className="text-xs px-2 py-1 bg-gray-800 text-gray-400 rounded">Indoor</span>
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
            <div className="text-3xl font-light">{getPaceDisplay()}</div>
            <div className="text-sm text-gray-500">/km</div>
          </div>
          <div>
            <div className="text-3xl font-light">{activity.averageHR ? Math.round(activity.averageHR) : '--'}</div>
            <div className="text-sm text-gray-500">FC prom</div>
          </div>
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-5 gap-4 p-6 border-b border-gray-800 text-sm">
          <div>
            <div className="text-gray-500 mb-1">Elevación</div>
            <div className="font-medium">{elevMeters !== null ? `${elevMeters} m` : '0 m'}</div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">Cadencia</div>
            <div className="font-medium">{cadence > 0 ? `${Math.round(cadence)} spm` : '--'}</div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">FC Máx</div>
            <div className="font-medium">{activity.maxHR ? `${Math.round(activity.maxHR)} bpm` : '--'}</div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">Calorías</div>
            <div className="font-medium">{activity.calories ? Math.round(activity.calories) : '--'}</div>
          </div>
          <div>
            <div className="text-gray-500 mb-1">Zapatillas</div>
            <div className="font-medium truncate">{activity.gear?.name || '--'}</div>
          </div>
        </div>

        {/* Running Dynamics (FIT only) */}
        {(activity.avgVerticalOscillation || activity.avgStanceTime || activity.avgPower) && (
          <div className="grid grid-cols-4 gap-4 p-6 border-b border-gray-800 text-sm">
            {activity.avgPower ? (
              <div>
                <div className="text-gray-500 mb-1">Potencia</div>
                <div className="font-medium">{Math.round(activity.avgPower)} W</div>
              </div>
            ) : null}
            {activity.avgVerticalOscillation ? (
              <div>
                <div className="text-gray-500 mb-1">Oscilación V.</div>
                <div className="font-medium">{activity.avgVerticalOscillation.toFixed(1)} mm</div>
              </div>
            ) : null}
            {activity.avgStanceTime ? (
              <div>
                <div className="text-gray-500 mb-1">Tiempo contacto</div>
                <div className="font-medium">{Math.round(activity.avgStanceTime)} ms</div>
              </div>
            ) : null}
            {activity.avgVerticalRatio ? (
              <div>
                <div className="text-gray-500 mb-1">Ratio vertical</div>
                <div className="font-medium">{activity.avgVerticalRatio.toFixed(1)}%</div>
              </div>
            ) : null}
          </div>
        )}

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

        {/* Charts */}
        {activity.records && activity.records.length > 0 && (
          <ActivityCharts records={activity.records} />
        )}

        {/* Laps */}
        {laps.length > 0 && (
          <div className="p-6 border-b border-gray-800">
            <div className="text-sm text-gray-500 mb-3">Laps ({laps.length})</div>

            {/* Visual bars */}
            {maxLapSpeed > 0 && (
              <div className="flex items-end gap-1 h-24 mb-4">
                {laps.map((lap, i) => {
                  const speed = getLapSpeed(lap);
                  const heightPercent = maxLapSpeed > 0 ? (speed / maxLapSpeed) * 100 : 50;
                  const dist = getLapDistance(lap);
                  const widthPercent = maxLapDist > 0 ? (dist / maxLapDist) * 100 : 100;
                  const range = maxLapSpeed - minLapSpeed || 1;
                  const relativePos = speed > 0 ? (speed - minLapSpeed) / range : 0;
                  const hue = 220 - (relativePos * 35);
                  const lightness = 35 + (relativePos * 25);

                  return (
                    <div
                      key={i}
                      className="hover:brightness-125 transition-all rounded-t relative group cursor-pointer"
                      style={{
                        height: `${Math.max(heightPercent, 10)}%`,
                        flex: `${Math.max(widthPercent, 5)} 0 0`,
                        backgroundColor: `hsl(${hue}, 70%, ${lightness}%)`
                      }}
                      title={`Lap ${i + 1}: ${formatPaceFromSpeed(speed)}/km`}
                    >
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-800 px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 border border-gray-700">
                        <div className="font-medium">{formatPaceFromSpeed(speed)}/km</div>
                        <div className="text-gray-400">{(dist / 1000).toFixed(2)} km</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

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
                  {laps.map((lap, i) => {
                    const dist = getLapDistance(lap);
                    const time = getLapTime(lap);
                    const speed = getLapSpeed(lap);
                    const hr = getLapHR(lap);
                    const cad = getLapCadence(lap);
                    return (
                      <tr key={i} className="text-gray-300">
                        <td className="py-2 text-gray-500">{i + 1}</td>
                        <td className="py-2 text-right">{(dist / 1000).toFixed(2)}</td>
                        <td className="py-2 text-right text-gray-400">{time > 0 ? formatDuration(time) : '--'}</td>
                        <td className="py-2 text-right font-medium">{formatPaceFromSpeed(speed)}</td>
                        <td className="py-2 text-right text-gray-400">{hr > 0 ? Math.round(hr) : '--'}</td>
                        <td className="py-2 text-right text-gray-400">{cad > 0 ? Math.round(cad) : '--'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Splits */}
        {splits.length > 0 && (
          <div className="p-6 border-b border-gray-800">
            <div className="text-sm text-gray-500 mb-3">Splits por km ({splits.length})</div>
            <div className="flex items-end gap-1 h-20 mb-4">
              {(() => {
                const speeds = splits.map(s => s.average_speed || s.avgSpeed || 0).filter(s => s > 0);
                const maxS = Math.max(...speeds);
                const minS = Math.min(...speeds);
                const range = maxS - minS || 1;
                return splits.map((split, i) => {
                  const speed = split.avgSpeed || split.average_speed || 0;
                  const heightPercent = maxS > 0 ? (speed / maxS) * 100 : 50;
                  const relPos = (speed - minS) / range;
                  const hue = 220 - (relPos * 35);
                  const lightness = 35 + (relPos * 25);
                  return (
                    <div key={i} className="hover:brightness-125 transition-all rounded-t flex-1 relative group cursor-pointer"
                      style={{ height: `${Math.max(heightPercent, 10)}%`, backgroundColor: `hsl(${hue}, 70%, ${lightness}%)` }}>
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-800 px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap z-10 border border-gray-700">
                        <div className="font-medium">Km {split.split}</div>
                        <div className="text-cyan-400">{formatPaceFromSpeed(speed)}/km</div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
            <div className="grid grid-cols-5 gap-2 text-xs">
              {splits.map((split, i) => (
                <div key={i} className="bg-gray-900/50 rounded p-2 text-center">
                  <div className="text-gray-500 mb-1">Km {split.split}</div>
                  <div className="font-medium">{formatPaceFromSpeed(split.avgSpeed || split.average_speed)}</div>
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
                    <div className="text-lg font-light">{formatDuration(effort.movingTime || effort.moving_time || 0)}</div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Strava Link */}
        {activity.stravaId && (
          <div className="p-6">
            <a href={`https://www.strava.com/activities/${activity.stravaId}`}
              target="_blank" rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-[#fc4c02] transition-colors">
              Ver en Strava →
            </a>
          </div>
        )}

      </div>
    </div>
  );
}
