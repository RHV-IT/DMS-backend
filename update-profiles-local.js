const mongoose = require('mongoose');
const User = require('./api/src/models/User');

const uri = 'mongodb://localhost:27017/dms';

mongoose.connect(uri)
  .then(() => {
    console.log('Connected to MongoDB at localhost:27017/dms');
    // Update all inactive profiles to active
    return User.updateMany(
      { 'profiles.status': 'inactive' },
      { $set: { 'profiles.$[elem].status': 'active' } },
      { arrayFilters: [{ 'elem.status': 'inactive'}], multi: true }
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