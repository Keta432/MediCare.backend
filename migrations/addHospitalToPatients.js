const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

// Import models
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const Hospital = require('../models/Hospital');

// Connect to the database
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => {
    console.error('Error connecting to MongoDB:', err);
    process.exit(1);
  });

const addHospitalToPatients = async () => {
  try {
    console.log('Starting migration: Add hospital to patients');
    
    // 1. Get all patients
    const patients = await Patient.find({}).lean();
    console.log(`Found ${patients.length} total patients`);
    
    // 2. Get all appointments to find hospital associations
    const appointments = await Appointment.find({}).lean();
    console.log(`Found ${appointments.length} appointments`);
    
    // 3. Get all doctors with their hospitals
    const doctors = await Doctor.find({}).lean();
    console.log(`Found ${doctors.length} doctors`);
    
    // Create a map of doctor ID to hospital ID
    const doctorHospitalMap = {};
    doctors.forEach(doctor => {
      if (doctor.hospitalId && doctor._id) {
        doctorHospitalMap[doctor._id.toString()] = doctor.hospitalId;
      }
    });
    
    // Create a map of patient ID to hospital ID based on appointments
    const patientHospitalMap = {};
    appointments.forEach(appointment => {
      const patientId = typeof appointment.patientId === 'string' 
        ? appointment.patientId 
        : appointment.patientId?._id?.toString();
      
      // Try to get hospital directly from appointment
      if (appointment.hospitalId) {
        const hospitalId = typeof appointment.hospitalId === 'string' 
          ? appointment.hospitalId 
          : appointment.hospitalId._id?.toString();
        
        if (patientId && hospitalId) {
          patientHospitalMap[patientId] = hospitalId;
        }
      }
      // Or try to get hospital from doctor
      else if (appointment.doctorId) {
        const doctorId = typeof appointment.doctorId === 'string' 
          ? appointment.doctorId 
          : appointment.doctorId._id?.toString();
        
        const hospitalId = doctorHospitalMap[doctorId];
        if (patientId && hospitalId) {
          patientHospitalMap[patientId] = hospitalId;
        }
      }
    });
    
    console.log(`Created hospital associations for ${Object.keys(patientHospitalMap).length} patients`);
    
    // Update patients with hospital information
    let updatedCount = 0;
    
    for (const patient of patients) {
      const patientId = patient._id.toString();
      const hospitalId = patientHospitalMap[patientId];
      
      // Only update if a hospital was found and the patient doesn't already have one
      if (hospitalId && !patient.hospital) {
        await Patient.updateOne(
          { _id: patientId },
          { $set: { hospital: hospitalId } }
        );
        updatedCount++;
      }
      // Check if the patient has a primaryDoctor
      else if (patient.primaryDoctor && !patient.hospital) {
        const doctorId = typeof patient.primaryDoctor === 'string' 
          ? patient.primaryDoctor 
          : patient.primaryDoctor._id?.toString();
        
        const hospitalId = doctorHospitalMap[doctorId];
        if (hospitalId) {
          await Patient.updateOne(
            { _id: patientId },
            { $set: { hospital: hospitalId } }
          );
          updatedCount++;
        }
      }
    }
    
    console.log(`Updated ${updatedCount} patients with hospital information`);
    
    // If no patients were updated, add all patients to the first hospital
    if (updatedCount === 0) {
      // Find all hospitals
      const hospitals = await Hospital.find({}).lean();
      
      if (hospitals.length > 0) {
        const defaultHospitalId = hospitals[0]._id;
        
        // Add all patients to this hospital
        await Patient.updateMany(
          { hospital: { $exists: false } },
          { $set: { hospital: defaultHospitalId } }
        );
        
        console.log(`Assigned all patients to the default hospital: ${defaultHospitalId}`);
      } else {
        console.log('No hospitals found. Cannot assign patients to a hospital.');
      }
    }
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the migration
addHospitalToPatients(); 