const mongoose = require('mongoose');
const Hospital = require('../models/Hospital');
const User = require('../models/User');
require('dotenv').config();

const addPatientCountToHospitals = async () => {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB successfully');

    // Get all hospitals
    const hospitals = await Hospital.find({});
    console.log(`Found ${hospitals.length} hospitals`);

    // Update each hospital with patient count
    for (const hospital of hospitals) {
      // Count patients for this hospital
      const patientCount = await User.countDocuments({
        hospital: hospital._id,
        role: 'patient'
      });

      // Add patientCount field to hospital document
      await Hospital.findByIdAndUpdate(
        hospital._id,
        { 
          $set: { 
            patientCount: patientCount,
            lastUpdated: new Date()
          } 
        },
        { new: true }
      );

      console.log(`Updated ${hospital.name} with ${patientCount} patients`);
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    // Close the database connection
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the migration if this file is run directly
if (require.main === module) {
  addPatientCountToHospitals()
    .then(() => {
      console.log('Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = addPatientCountToHospitals; 