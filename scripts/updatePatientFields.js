const mongoose = require('mongoose');
require('dotenv').config();
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('MongoDB Connected...');
  updatePatients();
}).catch(err => {
  console.error('Error connecting to MongoDB:', err);
  process.exit(1);
});

/**
 * Script to update existing patients with hospital and primaryDoctor fields
 * based on their appointment history
 */
const updatePatients = async () => {
  try {
    // Get all patients
    const patients = await Patient.find({});
    console.log(`Found ${patients.length} patients to update`);
    
    let updatedCount = 0;
    let noAppointmentsCount = 0;
    
    for (const patient of patients) {
      // Find the most recent appointment for this patient
      const lastAppointment = await Appointment.findOne({ patientId: patient._id })
        .sort({ createdAt: -1 })
        .populate('doctorId')
        .populate('hospitalId');
      
      if (lastAppointment) {
        // Update patient with hospital and primary doctor
        patient.hospital = lastAppointment.hospitalId;
        patient.primaryDoctor = lastAppointment.doctorId;
        
        // Set status to active
        patient.status = 'active';
        
        await patient.save();
        updatedCount++;
        
        console.log(`Updated patient ${patient.name} (${patient._id}) with hospital and doctor`);
      } else {
        noAppointmentsCount++;
        console.log(`Patient ${patient.name} (${patient._id}) has no appointments`);
      }
    }
    
    console.log(`Migration completed. Updated ${updatedCount} patients.`);
    console.log(`${noAppointmentsCount} patients had no appointments.`);
    
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('MongoDB Disconnected');
    process.exit(0);
  } catch (error) {
    console.error('Error updating patients:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}; 