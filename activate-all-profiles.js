const mongoose = require('mongoose');
const User = require('./api/src/models/User');

const uri = 'mongodb+srv://psalmuelsapok_db_user:TUKC9dwbzaE3iO88@dms.gxomq4e.mongodb.net/dms';

mongoose.connect(uri)
  .then(() => {
    console.log('Connected to MongoDB');
    return User.updateMany(
      { 'profiles.status': 'inactive' },
      { $set: { 'profiles.$[elem].status': 'active' } },
      { arrayFilters: [{ 'elem.status': 'inactive' }], multi: true }
    );
  })
  .then((result) => {
    console.log(`Updated ${result.nModified} profiles`);
    mongoose.disconnect();
  })
  .catch((err) => {
    console.error('Error:', err);
    mongoose.disconnect();
  });