const mongoose = require('mongoose');
require('dotenv').config({ path: './api/.env' });

// Define Installer schema inline for testing
const installerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  version: { type: String, required: true },
  platform: { type: String, required: true },
  fileSize: { type: Number, required: true },
  mimeType: { type: String, required: true },
  data: { type: Buffer, required: true },
  checksum: { type: String, required: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  downloadCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Installer = mongoose.model('Installer', installerSchema);

async function testInstallerQuery() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected successfully');

    console.log('Querying for active installer...');
    const installer = await Installer.findOne({
      isActive: true,
      platform: 'windows'
    }).sort({ version: -1 });

    console.log('Query result:', installer ? 'FOUND' : 'NOT FOUND');
    if (installer) {
      console.log('Installer details:');
      console.log('- Name:', installer.name);
      console.log('- Version:', installer.version);
      console.log('- Size:', installer.fileSize);
      console.log('- ID:', installer._id);
      console.log('- Data type:', typeof installer.data);
      console.log('- Data length:', installer.data ? installer.data.length : 'N/A');
    }

    // Test count
    const count = await Installer.countDocuments();
    console.log('Total installers in collection:', count);

  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

testInstallerQuery();