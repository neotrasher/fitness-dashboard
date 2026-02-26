import mongoose from 'mongoose';

const goalSchema = new mongoose.Schema({
  name: { type: String, required: true }, // "Maratón Valencia"
  type: { type: String, enum: ['primary', 'intermediate'], default: 'intermediate' },
  raceType: { type: String }, // "marathon", "half_marathon", "10k", "5k", "trail", "other"
  distance: { type: Number }, // metros
  targetDate: { type: Date, required: true },
  targetTime: { type: String }, // "3:30:00" tiempo objetivo
  notes: { type: String },
  completed: { type: Boolean, default: false },
  actualTime: { type: String }, // tiempo real si se completó
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

goalSchema.index({ targetDate: 1 });
goalSchema.index({ type: 1 });

export const Goal = mongoose.model('Goal', goalSchema);
