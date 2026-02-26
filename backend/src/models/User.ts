import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  stravaAthleteId: { type: Number, unique: true },
  stravaAccessToken: String,
  stravaRefreshToken: String,
  stravaTokenExpiresAt: Number,
  profile: {
    firstName: String,
    lastName: String,
    profilePicture: String,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const User = mongoose.model('User', userSchema);
