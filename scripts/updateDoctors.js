const mongoose = require('mongoose');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
require('dotenv').config();

const updateDoctors = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB...');

    // Find all doctors
    const doctors = await Doctor.find();
    console.log(`Found ${doctors.length} doctors to update`);

    // Update each doctor
    for (const doctor of doctors) {
      try {
        // Get appointment count
        const appointmentCount = await Appointment.countDocuments({
          doctorId: doctor._id,
          status: { $in: ['completed', 'confirmed'] }
        });

        // Get unique patients count
        const uniquePatients = await Appointment.distinct('patientId', {
          doctorId: doctor._id,
          status: { $in: ['completed', 'confirmed'] }
        });

        // Update doctor with new fields
        const updatedDoctor = await Doctor.findByIdAndUpdate(
          doctor._id,
          {
            $set: {
              // Set default values if not exists
              fees: doctor.fees || 0,
              experience: doctor.experience || 0,
              rating: doctor.rating || 0,
              qualifications: doctor.qualifications || [{
                degree: 'MD',
                institution: 'Medical University',
                year: new Date().getFullYear() - (doctor.experience || 0)
              }],
              availability: doctor.availability || [{
                days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                hours: '09:00 AM - 05:00 PM'
              }],
              // Add appointment and patient counts
              appointments: appointmentCount,
              patients: uniquePatients.length
            }
          },
          { new: true }
        );

        console.log(`Updated doctor: ${doctor._id}`);
        console.log('Updated fields:', {
          fees: updatedDoctor.fees,
          experience: updatedDoctor.experience,
          rating: updatedDoctor.rating,
          appointments: updatedDoctor.appointments,
          patients: updatedDoctor.patients
        });
      } catch (error) {
        console.error(`Error updating doctor ${doctor._id}:`, error);
      }
    }

    console.log('Successfully updated all doctors');
  } catch (error) {
    console.error('Error during doctor update:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the update
updateDoctors().then(() => {
  console.log('Update script completed');
}).catch(error => {
  console.error('Update script failed:', error);
}); 