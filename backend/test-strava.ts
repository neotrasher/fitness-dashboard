import dotenv from 'dotenv';
dotenv.config();

async function testStrava() {
  const mongoose = await import('mongoose');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fitness-dashboard');
  
  const { User } = await import('./src/models/User');
  const user = await User.findOne();
  
  if (!user) {
    console.log('No user found');
    process.exit(1);
  }

  const response = await fetch(
    'https://www.strava.com/api/v3/activities/16607129646',
    { headers: { Authorization: `Bearer ${user.stravaAccessToken}` } }
  );
  
  const data = await response.json();
  
  console.log('best_efforts:', JSON.stringify(data.best_efforts, null, 2));
  console.log('splits_metric length:', data.splits_metric?.length);
  
  process.exit(0);
}

testStrava();
