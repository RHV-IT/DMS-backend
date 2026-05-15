const { MongoClient } = require('mongodb');
require('dotenv').config({ path: './api/.env' });

async function testConnection() {
  const mongoUri = process.env.MONGODB_URI;
  console.log('Testing MongoDB connection...');
  console.log('URI:', mongoUri ? 'Found' : 'Missing');

  if (!mongoUri) {
    console.error('MONGODB_URI not found in environment');
    return;
  }

  const client = new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: 5000, // 5 second timeout
    connectTimeoutMS: 5000,
  });

  try {
    console.log('Connecting...');
    await client.connect();
    console.log('✅ Connected successfully!');

    const db = client.db('dms');
    const collections = await db.collections();
    console.log('Available collections:', collections.map(c => c.collectionName));

    // Check if installers collection exists
    const installers = db.collection('installers');
    const count = await installers.countDocuments();
    console.log(`Installers in database: ${count}`);

  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    if (error.message.includes('authentication failed')) {
      console.log('Check MongoDB credentials');
    } else if (error.message.includes('getaddrinfo ENOTFOUND')) {
      console.log('Check MongoDB hostname');
    } else if (error.message.includes('connection timed out')) {
      console.log('Network connectivity issue - check firewall/VPN');
    }
  } finally {
    await client.close();
    console.log('Connection closed');
  }
}

testConnection();