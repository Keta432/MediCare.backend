const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Patient = require('../models/Patient');
const Hospital = require('../models/Hospital');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const User = require('../models/User');

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => {
    console.error('MongoDB Connection Error:', err);
    process.exit(1);
  });

const addHospitalToPatients = async () => {
  try {
    console.log('Starting migration: Adding hospital to patients');
    
    // Get all patients
    const patients = await Patient.find({}).lean();
    console.log(`Found ${patients.length} total patients`);
    
    // Get all hospitals
    const hospitals = await Hospital.find({}).lean();
    
    if (hospitals.length === 0) {
      console.error('No hospitals found in the database');
      return;
    }
    
    const defaultHospital = hospitals[0]._id;
    console.log(`Using default hospital ID: ${defaultHospital}`);
    
    // Get all doctors with their hospitals - no need to populate userId now
    const doctors = await Doctor.find({}).lean();
    console.log(`Found ${doctors.length} doctors`);
    
    // Create a map of doctor ID to hospital ID
    const doctorHospitalMap = {};
    doctors.forEach(doctor => {
      if (doctor.hospitalId && doctor._id) {
        doctorHospitalMap[doctor._id.toString()] = doctor.hospitalId;
      }
    });
    
    // Get all appointments to find hospital associations
    const appointments = await Appointment.find({}).lean();
    console.log(`Found ${appointments.length} appointments`);
    
    // Create a map of patient ID to hospital ID based on appointments
    const patientHospitalMap = {};
    
    // First assign hospital based on appointments
    appointments.forEach(appointment => {
      const patientId = typeof appointment.patientId === 'string' 
        ? appointment.patientId 
        : appointment.patientId?._id?.toString();
      
      // Try to get hospital directly from appointment
      if (appointment.hospitalId && patientId) {
        const hospitalId = typeof appointment.hospitalId === 'string' 
          ? appointment.hospitalId 
          : appointment.hospitalId._id?.toString();
        
        patientHospitalMap[patientId] = hospitalId;
      }
      // Or try to get hospital from doctor
      else if (appointment.doctorId && patientId) {
        const doctorId = typeof appointment.doctorId === 'string' 
          ? appointment.doctorId 
          : appointment.doctorId._id?.toString();
        
        const hospitalId = doctorHospitalMap[doctorId];
        if (hospitalId) {
          patientHospitalMap[patientId] = hospitalId;
        }
      }
    });
    
    console.log(`Created hospital associations for ${Object.keys(patientHospitalMap).length} patients through appointments`);
    
    // Update patients with hospital information
    let updatedCount = 0;
    
    for (const patient of patients) {
      const patientId = patient._id.toString();
      let hospitalId = patientHospitalMap[patientId];
      
      // Check if the patient already has a hospital
      if (patient.hospital) {
        console.log(`Patient ${patientId} already has hospital: ${patient.hospital}`);
        continue;
      }
      
      // If no hospital found through appointments, check primary doctor
      if (!hospitalId && patient.primaryDoctor) {
        const doctorId = typeof patient.primaryDoctor === 'string' 
          ? patient.primaryDoctor 
          : patient.primaryDoctor._id?.toString();
        
        hospitalId = doctorHospitalMap[doctorId];
      }
      
      // If still no hospital, use the default hospital
      if (!hospitalId) {
        hospitalId = defaultHospital;
      }
      
      // Update the patient with the hospital ID
      await Patient.updateOne(
        { _id: patientId },
        { $set: { hospital: hospitalId } }
      );
      updatedCount++;
      console.log(`Updated patient ${patientId} with hospital ${hospitalId}`);
    }
    
    console.log(`Updated ${updatedCount} patients with hospital information`);
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  }
};

// Run the migration
addHospitalToPatients()
  .then(() => {
    console.log('Migration completed');
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('Migration error:', err);
    mongoose.disconnect();
  }); 