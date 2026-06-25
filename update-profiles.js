const { MongoClient } = require('mongodb');

const uri = 'mongodb+srv://psalmuelsapok_db_user:TUKC9dwbzaE3iO88@dms.gxomq4e.mongodb.net/dms';

const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    const db = client.db();
    const result = await db.collection('users').updateMany(
      { 'profiles.status': 'inactive' },
      { $set: { 'profiles.$[elem].status': 'active' } },
      { arrayFilters: [{ 'elem.status': 'inactive' }] }
    );
    console.log(`Matched ${result.matchedCount} documents, modified ${result.modifiedCount} documents`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

run().catch(console.error);