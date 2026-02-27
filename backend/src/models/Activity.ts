import mongoose from 'mongoose';

const lapSchema = new mongoose.Schema({
  index: Number,
  startTime: Date,
  totalTime: Number,       // segundos
  distance: Number,        // km
  avgSpeed: Number,        // km/h
  maxSpeed: Number,        // km/h
  avgHR: Number,
  maxHR: Number,
  avgCadence: Number,      // spm
  maxCadence: Number,
  calories: Number,
  avgPower: Number,        // watts
  elevationGain: Number,
  elevationLoss: Number,
  avgVerticalOscillation: Number,
  avgStanceTime: Number,
  avgVerticalRatio: Number,
  avgStepLength: Number,
  intensity: String,
  sport: String,
  // Campos de Strava
  paceZone: Number,
}, { _id: false });

const recordSchema = new mongoose.Schema({
  timestamp: Date,
  elapsedTime: Number,
  distance: Number,        // km
  speed: Number,           // km/h
  heartRate: Number,
  cadence: Number,         // spm
  temperature: Number,
  power: Number,
  verticalOscillation: Number,
  verticalRatio: Number,
  stepLength: Number,
  altitude: Number,
  lat: Number,
  lng: Number,
}, { _id: false });

const splitSchema = new mongoose.Schema({
  split: Number,
  distance: Number,
  elapsedTime: Number,
  movingTime: Number,
  avgSpeed: Number,
  avgHR: Number,
  elevationDiff: Number,
  paceZone: Number,
}, { _id: false });

const bestEffortSchema = new mongoose.Schema({
  name: String,            // "400m", "1K", "5K", "10K"
  distance: Number,
  elapsedTime: Number,
  movingTime: Number,
  prRank: Number,
}, { _id: false });

const gearSchema = new mongoose.Schema({
  id: String,
  name: String,
  nickname: String,
  distance: Number,
}, { _id: false });

const boundingBoxSchema = new mongoose.Schema({
  north: Number,
  east: Number,
  south: Number,
  west: Number,
}, { _id: false });

const activitySchema = new mongoose.Schema({
  // Identificadores
  stravaId: { type: Number },

  // Tipo y clasificación
  activityType: { type: String, required: true },
  activityCategory: { type: String, default: 'other' },
  subSport: { type: String },               // treadmill, trail, track, street, generic
  isIndoor: { type: Boolean, default: false },
  workoutType: { type: String },            // intervals, tempo, lsd, easy, recovery, race

  // Info básica
  name: { type: String },
  description: { type: String },
  startTime: { type: Date, required: true },
  timezone: { type: String },

  // Tiempo
  duration: { type: Number, required: true },   // segundos activos
  elapsedTime: { type: Number },                // segundos totales con pausas

  // Distancia y elevación
  distance: { type: Number, default: 0 },       // metros
  elevationGain: { type: Number },
  elevationLoss: { type: Number },
  elevHigh: { type: Number },
  elevLow: { type: Number },

  // Velocidad y ritmo
  averageSpeed: { type: Number },               // km/h
  maxSpeed: { type: Number },                   // km/h
  averagePace: { type: Number },                // min/km (calculado)

  // Frecuencia cardíaca
  averageHR: { type: Number },
  maxHR: { type: Number },

  // Cadencia
  avgCadence: { type: Number },                 // spm
  maxCadence: { type: Number },

  // Potencia
  avgPower: { type: Number },                   // watts
  maxPower: { type: Number },
  normalizedPower: { type: Number },

  // Dinámica de carrera
  avgVerticalOscillation: { type: Number },     // mm
  avgStanceTime: { type: Number },              // ms
  avgVerticalRatio: { type: Number },           // %
  avgStepLength: { type: Number },              // mm

  // Temperatura
  avgTemperature: { type: Number },
  maxTemperature: { type: Number },

  // Esfuerzo
  calories: { type: Number, default: 0 },
  trainingEffect: { type: Number },
  anaerobicEffect: { type: Number },
  sufferScore: { type: Number },

  // GPS
  hasGPS: { type: Boolean, default: false },
  startLat: { type: Number },
  startLng: { type: Number },
  boundingBox: boundingBoxSchema,
  map: {
    polyline: { type: String },
    summaryPolyline: { type: String },
  },

  // Equipo
  gear: gearSchema,
  deviceName: { type: String },

  // Datos detallados
  laps: [lapSchema],
  lapCount: { type: Number, default: 0 },
  records: [recordSchema],
  splitsMetric: [splitSchema],
  bestEfforts: [bestEffortSchema],

  // Análisis automático
  workoutAnalysis: {
    type: { type: String },
    confidence: Number,
    fastestLapPace: Number,
    slowestLapPace: Number,
    paceVariation: Number,
    avgFastPace: Number,
    avgSlowPace: Number,
  },

  // Metadata
  source: { type: String, default: 'strava' },
  hasDetailedData: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Índices
activitySchema.index({ stravaId: 1 }, { unique: true, sparse: true });
activitySchema.index({ startTime: -1 });
activitySchema.index({ activityCategory: 1 });
activitySchema.index({ workoutType: 1 });

export const Activity = mongoose.model('Activity', activitySchema);
