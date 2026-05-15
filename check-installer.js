const { MongoClient } = require('mongodb');
require('dotenv').config({ path: './api/.env' });

async function checkInstaller() {
  const mongoUri = process.env.MONGODB_URI;
  const client = new MongoClient(mongoUri);

  try {
    await client.connect();
    const db = client.db('dms');
    const installers = db.collection('installers');

    const count = await installers.countDocuments();
    console.log(`Total installers in database: ${count}`);

    const activeInstallers = await installers.find({ isActive: true, platform: 'windows' }).toArray();
    console.log(`Active Windows installers: ${activeInstallers.length}`);

    if (activeInstallers.length > 0) {
      console.log('Active installer details:');
      activeInstallers.forEach(installer => {
        console.log(`- Name: ${installer.name}`);
        console.log(`- Version: ${installer.version}`);
        console.log(`- Size: ${installer.fileSize} bytes`);
        console.log(`- ID: ${installer._id}`);
      });
    } else {
      console.log('No active installers found');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

checkInstaller();