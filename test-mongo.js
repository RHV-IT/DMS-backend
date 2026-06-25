const { MongoClient } = require('mongodb');

const uri = 'mongodb+srv://psalmuelsapok_db_user:TUKC9dwbzaE3iO88@dms.gxomq4e.mongodb.net/dms';

const client = new MongoClient(uri); // No options needed

async function run() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    const db = client.db(); // gets the database from the URI
    const collection = db.collection('users');
    const count = await collection.countDocuments();
    console.log(`Total users: ${count}`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

run().catch(console.dir);