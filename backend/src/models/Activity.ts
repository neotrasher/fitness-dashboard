import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema({
  stravaId: { type: Number },
  activityType: { type: String, required: true },
  activityCategory: { type: String, default: 'other' },
  startTime: { type: Date, required: true },
  duration: { type: Number, required: true },
  distance: { type: Number, default: 0 },
  averageHR: { type: Number },
  maxHR: { type: Number },
  averagePace: { type: Number },
  calories: { type: Number, default: 0 },
  elevationGain: { type: Number },
  name: { type: String },
  description: { type: String },
  source: { type: String, default: 'strava' },
  fileName: { type: String },
  rawData: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
});

// Índice único para evitar duplicados
activitySchema.index({ stravaId: 1 }, { unique: true, sparse: true });
activitySchema.index({ startTime: -1 });
activitySchema.index({ activityCategory: 1 });

export const Activity = mongoose.model('Activity', activitySchema);
