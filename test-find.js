const mongoose = require('mongoose');

const uri = 'mongodb+srv://psalmuelsapok_db_user:TUKC9dwbzaE3iO88@dms.gxomq4e.mongodb.net/dms';

mongoose.connect(uri)
  .then(() => {
    console.log('Connected to MongoDB');
    // Try to find one user
    return mongoose.model('User').findOne({});
  })
  .then((user) => {
    console.log('Found user:', user ? user.email : 'null');
    mongoose.disconnect();
  })
  .catch((err) => {
    console.error('Error:', err);
    mongoose.disconnect();
  });