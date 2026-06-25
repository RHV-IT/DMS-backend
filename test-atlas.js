const mongoose = require('mongoose');

const uri = 'mongodb+srv://psalmuelsapok_db_user:TUKC9dwbzaE3iO88@dms.gxomq4e.mongodb.net/dms';

mongoose.connect(uri)
  .then(() => {
    console.log('Connected to MongoDB Atlas');
    mongoose.disconnect();
  })
  .catch((err) => {
    console.error('Connection error:', err);
  });