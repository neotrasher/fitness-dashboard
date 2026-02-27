import { useState, useMemo } from 'react';

interface Record {
  timestamp?: string;
  elapsedTime: number;
  speed?: number;
  heartRate?: number;
  cadence?: number;
  power?: number;
  altitude?: number;
  lat?: number;
  lng?: number;
}

interface Props {
  records: Record[];
}

type Tab = 'hr' | 'pace' | 'power' | 'cadence' | 'elevation';

const TABS: { id: Tab; label: string; color: string; unit: string }[] = [
  { id: 'hr',        label: 'FC',        color: '#ef4444', unit: 'bpm' },
  { id: 'pace',      label: 'Ritmo',     color: '#06b6d4', unit: '/km' },
  { id: 'power',     label: 'Potencia',  color: '#f59e0b', unit: 'W'   },
  { id: 'cadence',   label: 'Cadencia',  color: '#8b5cf6', unit: 'spm' },
  { id: 'elevation', label: 'Elevación', color: '#10b981', unit: 'm'   },
];

// Downsample to ~300 points for performance
function downsample(data: number[], targetPoints: number): number[] {
  if (data.length <= targetPoints) return data;
  const step = data.length / targetPoints;
  const result: number[] = [];
  for (let i = 0; i < targetPoints; i++) {
    const idx = Math.min(Math.floor(i * step), data.length - 1);
    result.push(data[idx]);
  }
  return result;
}

function smoothData(data: number[], windowSize: number = 5): number[] {
  return data.map((_, i) => {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(data.length, i + Math.floor(windowSize / 2) + 1);
    const window = data.slice(start, end).filter(v => v > 0);
    return window.length > 0 ? window.reduce((a, b) => a + b, 0) / window.length : 0;
  });
}

function formatPace(kmh: number): string {
  if (!kmh || kmh <= 0) return '--';
  const paceMins = 60 / kmh;
  const mins = Math.floor(paceMins);
  const secs = Math.round((paceMins - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ActivityCharts({ records }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('hr');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const TARGET_POINTS = 300;

  const chartData = useMemo(() => {
    if (!records || records.length === 0) return null;

    const hrRaw     = records.map(r => r.heartRate || 0);
    const speedRaw  = records.map(r => r.speed || 0);
    const powerRaw  = records.map(r => r.power || 0);
    const cadRaw    = records.map(r => r.cadence || 0);
    const altRaw    = records.map(r => r.altitude || 0);
    const timeRaw   = records.map(r => r.elapsedTime || 0);

    return {
      hr:        downsample(smoothData(hrRaw, 3), TARGET_POINTS),
      speed:     downsample(smoothData(speedRaw, 5), TARGET_POINTS),
      power:     downsample(smoothData(powerRaw, 5), TARGET_POINTS),
      cadence:   downsample(smoothData(cadRaw, 3), TARGET_POINTS),
      altitude:  downsample(altRaw, TARGET_POINTS),
      time:      downsample(timeRaw, TARGET_POINTS),
    };
  }, [records]);

  if (!chartData) return null;

  const getValues = (tab: Tab): number[] => {
    switch (tab) {
      case 'hr':        return chartData.hr;
      case 'pace':      return chartData.speed;
      case 'power':     return chartData.power;
      case 'cadence':   return chartData.cadence;
      case 'elevation': return chartData.altitude;
    }
  };

  const formatValue = (tab: Tab, val: number): string => {
    if (!val || val === 0) return '--';
    switch (tab) {
      case 'hr':        return `${Math.round(val)} bpm`;
      case 'pace':      return `${formatPace(val)}/km`;
      case 'power':     return `${Math.round(val)} W`;
      case 'cadence':   return `${Math.round(val)} spm`;
      case 'elevation': return `${val.toFixed(0)} m`;
    }
  };

  const values = getValues(activeTab);
  const validValues = values.filter(v => v > 0);
  if (validValues.length === 0) {
    return (
      <div className="p-6 border-b border-gray-800">
        <ChartTabs activeTab={activeTab} setActiveTab={setActiveTab} values={values} />
        <div className="h-40 flex items-center justify-center text-gray-600 text-sm">
          Sin datos para esta métrica
        </div>
      </div>
    );
  }

  const tab = TABS.find(t => t.id === activeTab)!;
  const color = tab.color;

  // For pace, invert: slower = higher on chart doesn't make sense visually
  // Lower speed = slower pace, so we keep speed as-is (higher = faster = higher bar)
  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const range = max - min || 1;

  const width = 100 / values.length;

  // SVG path for the line chart
  const chartH = 120;
  const chartW = TARGET_POINTS;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * chartW;
    const normalized = v > 0 ? (v - min) / range : 0;
    const y = chartH - normalized * chartH * 0.85 - chartH * 0.075;
    return { x, y, v };
  });

  const pathD = points
    .filter(p => p.v > 0)
    .reduce((acc, p, i) => i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`, '');

  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x} ${chartH} L ${points[0].x} ${chartH} Z`
    : '';

  // Zone colors for HR
  const getHrZone = (hr: number) => {
    if (hr < 120) return '#3b82f6';
    if (hr < 140) return '#10b981';
    if (hr < 155) return '#f59e0b';
    if (hr < 170) return '#ef4444';
    return '#7c3aed';
  };

  // Stats
  const avg = validValues.reduce((a, b) => a + b, 0) / validValues.length;
  const hoverVal = hoverIndex !== null ? values[hoverIndex] : null;
  const hoverTime = hoverIndex !== null ? chartData.time[hoverIndex] : null;

  return (
    <div className="p-6 border-b border-gray-800">
      <ChartTabs activeTab={activeTab} setActiveTab={setActiveTab} values={values} />

      {/* Stats row */}
      <div className="flex gap-6 mb-4 text-xs">
        <div>
          <span className="text-gray-500">Prom </span>
          <span className="font-medium" style={{ color }}>{formatValue(activeTab, avg)}</span>
        </div>
        <div>
          <span className="text-gray-500">Máx </span>
          <span className="font-medium" style={{ color }}>{formatValue(activeTab, max)}</span>
        </div>
        <div>
          <span className="text-gray-500">Mín </span>
          <span className="font-medium" style={{ color }}>{formatValue(activeTab, min)}</span>
        </div>
        {hoverVal && hoverVal > 0 && (
          <div className="ml-auto">
            <span className="text-gray-500">{formatTime(hoverTime || 0)} → </span>
            <span className="font-medium text-white">{formatValue(activeTab, hoverVal)}</span>
          </div>
        )}
      </div>

      {/* Chart */}
      <div
        className="relative h-32 select-none"
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const idx = Math.round((x / rect.width) * (values.length - 1));
          setHoverIndex(Math.max(0, Math.min(values.length - 1, idx)));
        }}
      >
        <svg
          viewBox={`0 0 ${chartW} ${chartH}`}
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          <defs>
            <linearGradient id={`grad-${activeTab}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaD} fill={`url(#grad-${activeTab})`} />

          {/* Line */}
          <path
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Hover line */}
          {hoverIndex !== null && (
            <line
              x1={(hoverIndex / (values.length - 1)) * chartW}
              y1="0"
              x2={(hoverIndex / (values.length - 1)) * chartW}
              y2={chartH}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
          )}
        </svg>

        {/* Y axis labels */}
        <div className="absolute left-0 top-0 h-full flex flex-col justify-between pointer-events-none">
          <span className="text-xs text-gray-600">{formatValue(activeTab, max)}</span>
          <span className="text-xs text-gray-600">{formatValue(activeTab, min)}</span>
        </div>
      </div>

      {/* Time axis */}
      <div className="flex justify-between text-xs text-gray-600 mt-1">
        <span>{formatTime(chartData.time[0] || 0)}</span>
        <span>{formatTime(chartData.time[Math.floor(chartData.time.length / 2)] || 0)}</span>
        <span>{formatTime(chartData.time[chartData.time.length - 1] || 0)}</span>
      </div>

      {/* HR Zones legend */}
      {activeTab === 'hr' && (
        <div className="flex gap-3 mt-3 text-xs">
          {[
            { label: 'Z1', color: '#3b82f6', range: '<120' },
            { label: 'Z2', color: '#10b981', range: '120-140' },
            { label: 'Z3', color: '#f59e0b', range: '140-155' },
            { label: 'Z4', color: '#ef4444', range: '155-170' },
            { label: 'Z5', color: '#7c3aed', range: '>170' },
          ].map(z => (
            <div key={z.label} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: z.color }} />
              <span className="text-gray-500">{z.label} {z.range}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChartTabs({ activeTab, setActiveTab, values }: {
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
  values: number[];
}) {
  // Check which tabs have data
  return (
    <div className="flex gap-1 mb-4">
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
            activeTab === tab.id
              ? 'text-black'
              : 'bg-gray-900 text-gray-400 hover:text-gray-200 hover:bg-gray-800'
          }`}
          style={activeTab === tab.id ? { backgroundColor: tab.color } : {}}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
