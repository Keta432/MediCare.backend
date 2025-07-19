const mongoose = require('mongoose');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Hospital = require('../models/Hospital');
require('dotenv').config();

const migrateDoctors = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB...');

    // Delete all existing doctor entries
    await Doctor.deleteMany({});
    console.log('Deleted existing doctor entries');

    // Find all users with role 'doctor'
    const doctorUsers = await User.find({ role: 'doctor' });
    console.log(`Found ${doctorUsers.length} doctor users`);

    // Create new doctor entries
    const doctorPromises = doctorUsers.map(async (user) => {
      // Create doctor document with schema
      const doctorData = {
        userId: user._id,
        specialization: user.specialization || 'General Medicine',
        hospitalId: user.hospital, // Save hospital ID directly from user
        qualifications: [],
        experience: 0,
        fees: 0,
        availability: [],
        rating: 0,
        reviews: []
      };

      // Add the doctor to the collection
      const doctor = await Doctor.create(doctorData);
      console.log(`Created doctor entry for ${user.name} with hospital ${user.hospital}`);
      return doctor;
    });

    await Promise.all(doctorPromises);
    console.log('Successfully migrated doctor data with hospital information');

  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the migration
migrateDoctors(); 