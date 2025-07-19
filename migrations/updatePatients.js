/**
 * Migration script to update patients to use the User model reference
 * Run with: node backend/migrations/updatePatients.js
 */

const mongoose = require('mongoose');
const config = require('../config');
const User = require('../models/User');
const Patient = require('../models/Patient');

// Connect to MongoDB
mongoose.connect(config.MONGO_URI)
  .then(() => console.log('MongoDB Connected for migration'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

const migratePatients = async () => {
  try {
    console.log('Starting patient migration...');
    
    // Get all patients
    const patients = await Patient.find({});
    console.log(`Found ${patients.length} patients to process`);
    
    let updated = 0;
    let created = 0;
    let errors = 0;
    
    for (const patient of patients) {
      try {
        // Skip patients that already have a user reference
        if (patient.user) {
          console.log(`Patient ${patient._id} already has user reference: ${patient.user}`);
          continue;
        }
        
        // Check if name and email exist on the patient
        if (!patient.name || !patient.email) {
          console.log(`Patient ${patient._id} is missing name or email - skipping`);
          continue;
        }
        
        // Try to find existing user with this email
        let user = await User.findOne({ email: patient.email });
        
        if (user) {
          console.log(`Found existing user ${user._id} for patient ${patient._id}`);
        } else {
          // Create a new user
          const randomPassword = Math.random().toString(36).slice(-8);
          user = await User.create({
            name: patient.name,
            email: patient.email,
            password: randomPassword,
            gender: patient.gender || 'other',
            role: 'patient'
          });
          console.log(`Created new user ${user._id} for patient ${patient._id}`);
          created++;
        }
        
        // Update the patient with the user reference
        patient.user = user._id;
        
        // Save the updated patient
        await patient.save();
        updated++;
        console.log(`Updated patient ${patient._id} with user ${user._id}`);
      } catch (err) {
        console.error(`Error processing patient ${patient._id}:`, err);
        errors++;
      }
    }
    
    console.log('Migration completed:');
    console.log(`- Updated: ${updated} patients`);
    console.log(`- Created: ${created} new users`);
    console.log(`- Errors: ${errors}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

migratePatients(); 