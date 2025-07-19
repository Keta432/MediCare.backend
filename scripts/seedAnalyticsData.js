/**
 * Analytics Data Seed Script
 * 
 * This script adds treatment outcome data to existing completed appointments
 * to provide data for the analytics dashboard.
 * 
 * Usage: 
 * 1. Connect to your MongoDB instance
 * 2. Run: node seedAnalyticsData.js
 */

const mongoose = require('mongoose');
require('dotenv').config();
const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');

// Common medical conditions for demonstration
const medicalConditions = [
  'Infertility',
  'Ulcerative Colitis',
  'Migraine',
  'Hypertension',
  'Type 2 Diabetes',
  'Asthma',
  'Osteoarthritis',
  'Depression',
  'Anxiety Disorder',
  'GERD'
];

// Generate random date between start and end
const randomDate = (start, end) => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

// Generate random integer between min and max (inclusive)
const randomInt = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1) + min);
};

// Generate random outcome based on disease
const getRandomOutcome = (disease) => {
  // Define success rates for different conditions (for demo purposes)
  const successRates = {
    'Infertility': 0.65,
    'Ulcerative Colitis': 0.75,
    'Migraine': 0.85,
    'Hypertension': 0.80,
    'Type 2 Diabetes': 0.70,
    'Asthma': 0.82,
    'Osteoarthritis': 0.68,
    'Depression': 0.72,
    'Anxiety Disorder': 0.80,
    'GERD': 0.90
  };

  // Default success rate if disease not in our map
  const successRate = successRates[disease] || 0.7;
  
  // Generate random number and determine outcome based on success rate
  const rand = Math.random();
  
  if (rand < successRate) {
    return 'successful';
  } else if (rand < successRate + 0.2) {
    return 'partial';
  } else {
    return 'unsuccessful';
  }
};

const seedAnalyticsData = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get all doctors
    const doctors = await Doctor.find({});
    console.log(`Found ${doctors.length} doctors`);

    if (doctors.length === 0) {
      throw new Error('No doctors found in the database');
    }

    // For each doctor
    for (const doctor of doctors) {
      console.log(`Processing data for doctor: ${doctor._id}`);

      // Find completed appointments without treatment outcome data
      const completedAppointments = await Appointment.find({
        doctorId: doctor._id,
        status: 'completed',
        treatmentOutcome: { $exists: false }
      });

      console.log(`Found ${completedAppointments.length} completed appointments for doctor ${doctor._id}`);

      // Create updates for each appointment
      const updates = [];
      for (const appointment of completedAppointments) {
        // Assign a random disease
        const disease = medicalConditions[randomInt(0, medicalConditions.length - 1)];
        
        // Generate a random treatment outcome based on the disease
        const treatmentOutcome = getRandomOutcome(disease);
        
        // Create a treatment end date (between appointment creation and now)
        const treatmentEndDate = randomDate(
          new Date(appointment.createdAt), 
          new Date()
        );

        // Generate a random diagnosis text
        const diagnosis = `Patient diagnosed with ${disease}. ` + 
          (treatmentOutcome === 'successful' 
            ? 'Treatment has been successful and symptoms have resolved.' 
            : treatmentOutcome === 'partial' 
              ? 'Treatment has shown partial improvement of symptoms.' 
              : 'Treatment has not shown significant improvement yet.');

        // Add to updates array
        updates.push({
          updateOne: {
            filter: { _id: appointment._id },
            update: {
              $set: {
                disease,
                diagnosis,
                treatmentOutcome,
                treatmentEndDate
              }
            }
          }
        });
      }

      // Execute bulk update if there are updates to make
      if (updates.length > 0) {
        console.log(`Updating ${updates.length} appointments for doctor ${doctor._id}`);
        await Appointment.bulkWrite(updates);
      }
    }

    console.log('Analytics data seeding complete!');
  } catch (error) {
    console.error('Error seeding analytics data:', error);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
};

// Run the seed function
seedAnalyticsData(); 