import mongoose from 'mongoose';

// Sub-schemas para datos detallados
const lapSchema = new mongoose.Schema({
    lap_index: Number,
    distance: Number,
    elapsed_time: Number,
    moving_time: Number,
    average_speed: Number,
    max_speed: Number,
    average_heartrate: Number,
    max_heartrate: Number,
    average_cadence: Number,
    average_watts: Number,
    total_elevation_gain: Number,
    pace_zone: Number,
}, { _id: false });

const splitSchema = new mongoose.Schema({
    split: Number,
    distance: Number,
    elapsed_time: Number,
    moving_time: Number,
    average_speed: Number,
    average_heartrate: Number,
    elevation_difference: Number,
    pace_zone: Number,
}, { _id: false });

const bestEffortSchema = new mongoose.Schema({
    name: String, // "400m", "1K", "5K", "10K"
    distance: Number,
    elapsed_time: Number,
    moving_time: Number,
    pr_rank: Number,
}, { _id: false });

const gearSchema = new mongoose.Schema({
    id: String,
    name: String,
    nickname: String,
    distance: Number, // km totales de la zapatilla
}, { _id: false });

const activitySchema = new mongoose.Schema({
    // Identificadores
    stravaId: { type: Number },

    // Tipo y clasificación
    activityType: { type: String, required: true }, // Run, Ride, etc.
    activityCategory: { type: String, default: 'other' },
    runningSubType: { type: String }, // outdoor, treadmill, trail, virtual
    workoutType: { type: String }, // intervals, tempo, lsd, easy, recovery, race
    sportType: { type: String }, // Run, TrailRun, etc.

    // Info básica
    name: { type: String },
    description: { type: String },
    startTime: { type: Date, required: true },
    timezone: { type: String },

    // Métricas de tiempo
    duration: { type: Number, required: true }, // moving_time en segundos
    elapsedTime: { type: Number }, // elapsed_time total

    // Métricas de distancia
    distance: { type: Number, default: 0 },
    elevationGain: { type: Number },
    elevHigh: { type: Number },
    elevLow: { type: Number },

    // Métricas de ritmo/velocidad
    averagePace: { type: Number }, // min/km
    averageSpeed: { type: Number }, // m/s
    maxSpeed: { type: Number },

    // Métricas cardíacas
    averageHR: { type: Number },
    maxHR: { type: Number },

    // Métricas de running
    averageCadence: { type: Number },
    averageWatts: { type: Number },
    maxWatts: { type: Number },
    weightedAverageWatts: { type: Number },

    // Métricas de esfuerzo
    calories: { type: Number, default: 0 },
    sufferScore: { type: Number }, // Relative effort de Strava

    // Equipo
    gear: gearSchema,
    deviceName: { type: String },
    map: {
        polyline: { type: String },
        summaryPolyline: { type: String },
    },

    // Datos detallados
    laps: [lapSchema],
    splitsMetric: [splitSchema], // splits por km
    bestEfforts: [bestEffortSchema],

    // Análisis calculado
    workoutAnalysis: {
        type: { type: String }, // auto-detected: intervals, tempo, lsd, easy, etc.
        confidence: Number, // 0-100
        fastestLapPace: Number,
        slowestLapPace: Number,
        paceVariation: Number, // desviación estándar
        avgFastPace: Number, // promedio de laps rápidos
        avgSlowPace: Number, // promedio de laps lentos
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
