const mongoose = require('mongoose');
const User = require('./api/src/models/User');

const uri = 'mongodb+srv://psalmuelsapok_db_user:TUKC9dwbzaE3iO88@dms.gxomq4e.mongodb.net/dms';

mongoose.connect(uri)
  .then(() => {
    console.log('Connected to MongoDB');
    return User.countDocuments({});
  })
  .then((count) => {
    console.log(`Total users: ${count}`);
    return mongoose.disconnect();
  })
  .catch((err) => {
    console.error('Error:', err);
    mongoose.disconnect();
  });