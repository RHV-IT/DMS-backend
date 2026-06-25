const { MongoClient } = require('mongodb');

const uri = 'mongodb+srv://psalmuelsapok_db_user:TUKC9dwbzaE3iO88@dms.gxomq4e.mongodb.net/dms';

const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    const db = client.db();
    // Count profiles with status inactive across all users
    const pipeline = [
      { $unwind: '$profiles' },
      { $match: { 'profiles.status': 'inactive' } },
      { $count: 'inactiveCount' }
    ];
    const result = await db.collection('users').aggregate(pipeline).toArray();
    const inactiveCount = result.length > 0 ? result[0].inactiveCount : 0;
    console.log(`Number of inactive profiles: ${inactiveCount}`);

    // Also count total profiles
    const totalPipeline = [
      { $unwind: '$profiles' },
      { $count: 'totalCount' }
    ];
    const totalResult = await db.collection('users').aggregate(totalPipeline).toArray();
    const totalCount = totalResult.length > 0 ? totalResult[0].totalCount : 0;
    console.log(`Total profiles: ${totalCount}`);

    if (inactiveCount === 0) {
      console.log('All profiles are active.');
    } else {
      console.log(`There are still ${inactiveCount} inactive profiles.`);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

run().catch(console.error);