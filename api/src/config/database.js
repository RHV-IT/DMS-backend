const mongoose = require('mongoose');

// Disable mongoose buffering
mongoose.set('bufferCommands', false);

const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.error('MONGODB_URI is missing');
    process.exit(1);
  }

  console.log('Mongo URI exists');
  console.log('Connecting to MongoDB');

  try {
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });

    console.log('MongoDB connected successfully');
    return conn;
  } catch (error) {
    console.error('MongoDB connection failed');
    process.exit(1);
  }
};

// Connection event listeners
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected');
});

module.exports = connectDB;