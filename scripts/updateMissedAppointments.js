/**
 * This script updates the status of appointments to 'not_appeared' 
 * if they haven't been completed or cancelled within 30 minutes after 
 * their scheduled time.
 * 
 * This script should be run regularly with a cron job.
 * For example, to run every 15 minutes:
 * */15 * * * * node /path/to/backend/scripts/updateMissedAppointments.js
 */

// Load environment variables
require('dotenv').config();

const mongoose = require('mongoose');
const { format, addMinutes, subMinutes, parseISO } = require('date-fns');

// Import the Appointment model
// Use dynamic import to avoid issues when the script is run directly
let Appointment;
let Activity;

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Import models after connection is established
    // This ensures the models are properly initialized
    Appointment = require('../models/Appointment');
    Activity = require('../models/Activity');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

// Update missed appointments
async function updateMissedAppointments() {
  try {
    const now = new Date();
    
    // Find confirmed appointments that:
    // 1. Are in the past (date and time are before now)
    // 2. Are more than 30 minutes past their scheduled time
    // 3. Haven't been completed or cancelled
    
    // Format current date to match the date format in the database (YYYY-MM-DD)
    const today = format(now, 'yyyy-MM-dd');
    
    // Get all confirmed appointments for today or earlier
    const appointments = await Appointment.find({
      status: 'confirmed',
      $or: [
        { date: { $lt: today } },  // Earlier dates
        { date: today }            // Today's appointments
      ]
    });
    
    let updatedCount = 0;
    
    // Filter appointments that are more than 30 minutes past their scheduled time
    for (const appointment of appointments) {
      const appointmentDateTime = parseISO(`${appointment.date}T${appointment.time}`);
      const threshold = addMinutes(appointmentDateTime, 30);
      
      // If current time is later than the threshold (30 min after appointment)
      if (now > threshold) {
        // Update the appointment status to 'not_appeared'
        appointment.status = 'not_appeared';
        await appointment.save();
        
        // Log the activity
        await Activity.create({
          user: appointment.doctorId, // Use doctor's ID as the user
          hospitalId: appointment.hospitalId,
          actorId: appointment.doctorId,
          patientId: appointment.patientId,
          action: 'appointment_updated',
          subject: 'appointment',
          subjectId: appointment._id,
          type: 'appointment_updated',
          description: `Patient did not appear for appointment`,
          status: 'warning',
          metadata: {
            appointmentId: appointment._id,
            previousStatus: 'confirmed',
            newStatus: 'not_appeared'
          }
        });
        
        updatedCount++;
      }
    }
    
    console.log(`${updatedCount} appointments marked as 'not_appeared'`);
  } catch (error) {
    console.error('Error updating missed appointments:', error);
  }
}

// Run the script
(async () => {
  try {
    await connectDB();
    await updateMissedAppointments();
    
    // Disconnect from MongoDB after completion
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error running the script:', error);
  }
})(); 