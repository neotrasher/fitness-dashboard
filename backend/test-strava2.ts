import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

async function testStravaActivity() {
  const mongoose = await import('mongoose');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fitness-dashboard');
  
  const User = (await import('./src/models/User')).User;
  const user = await User.findOne();
  
  if (!user) {
    console.log('No hay usuario');
    process.exit(1);
  }

  const activityId = 14775776381;
  
  const response = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}?include_all_efforts=true`,
    {
      headers: { Authorization: `Bearer ${user.stravaAccessToken}` }
    }
  );
  
  const activity = await response.json();
  
  // Guardar en archivo
  fs.writeFileSync('activity-data.json', JSON.stringify(activity, null, 2));
  console.log('✅ Datos guardados en activity-data.json');
  console.log('Campos disponibles:', Object.keys(activity));
  
  process.exit(0);
}

testStravaActivity();
