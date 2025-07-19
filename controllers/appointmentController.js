const asyncHandler = require('express-async-handler');
const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const User = require('../models/User');
const Activity = require('../models/Activity');
const { sendAppointmentEmail } = require('../utils/emailService');
const mongoose = require('mongoose');
const ActivityService = require('../utils/activityService');

// @desc    Book appointment
// @route   POST /api/appointments
// @access  Public
const bookAppointment = asyncHandler(async (req, res) => {
  const {
    doctorId,
    patientDetails,
    hospitalId,
    date,
    time,
    type,
    notes
  } = req.body;

  try {
    // Validate required fields
    if (!doctorId || !hospitalId || !date || !time || !patientDetails) {
      res.status(400);
      throw new Error('Please provide all required fields');
    }

    // Validate patient details
    if (!patientDetails.name || !patientDetails.email) {
      res.status(400);
      throw new Error('Patient name and email are required');
    }

    // Check if doctor exists and is active
    const doctor = await Doctor.findById(doctorId).populate('userId', 'name email status');
    if (!doctor) {
      res.status(404);
      throw new Error('Doctor not found');
    }

    if (!doctor.userId || doctor.userId.status !== 'active') {
      res.status(400);
      throw new Error('Selected doctor is not available for appointments');
    }

    // Track if the patient's status was changed
    let patientStatusChanged = false;

    // Find or create patient directly in Patient collection
    let patient = await Patient.findOne({ 
      email: patientDetails.email 
    });

    if (!patient) {
      // Create new patient with active status
      patient = await Patient.create({
        name: patientDetails.name,
        email: patientDetails.email,
        dateOfBirth: patientDetails.dateOfBirth || null,
        age: patientDetails.age || null,
        gender: patientDetails.gender || 'not_specified',
        phone: patientDetails.phone || '',
        bloodGroup: patientDetails.bloodGroup || 'Not Specified',
        allergies: Array.isArray(patientDetails.allergies) ? patientDetails.allergies : [],
        medicalHistory: patientDetails.medicalHistory ? [{ condition: patientDetails.medicalHistory }] : [],
        emergencyContact: {
          name: '',
          relationship: '',
          phone: patientDetails.phone || ''
        },
        hospital: hospitalId,
        status: 'active',
        lastStatusChangeDate: new Date()
      });
      
      console.log(`Created new patient with ID: ${patient._id} and active status`);
    } else if (patient.status === 'inactive') {
      // Update existing patient's status if inactive
      console.log(`Changing patient ${patient._id} status from inactive to active due to new appointment booking`);
      patient.status = 'active';
      patient.lastStatusChangeDate = new Date();
      patientStatusChanged = true;
      
      // Update hospital if not set
      if (!patient.hospital) {
        patient.hospital = hospitalId;
        console.log(`Updated hospital for patient ${patient._id}`);
      }
      
      await patient.save();
    }

    // Check if slot is available
    const existingAppointment = await Appointment.findOne({
      doctorId,
      date,
      time,
      status: { $ne: 'cancelled' }
    });

    if (existingAppointment) {
      res.status(400);
      throw new Error('This time slot is already booked');
    }

    // Create appointment with the patient's ID
    const appointment = await Appointment.create({
      doctorId,
      patientId: patient._id,
      hospitalId,
      date,
      time,
      type: type || 'consultation',
      notes: notes || '',
      status: 'pending'
    });

    // Add appointment to patient's appointments array
    patient.appointments = patient.appointments || [];
    patient.appointments.push({
      doctor: doctorId,
      date: new Date(date),
      status: 'scheduled'
    });
    await patient.save();

    if (patientStatusChanged) {
      console.log(`Patient ${patient._id} status changed from inactive to active and saved`);
    }

    // Populate the appointment with doctor and patient details for the response
    await appointment.populate([
      {
        path: 'doctorId',
        populate: {
          path: 'userId',
          select: 'name email'
        },
        select: 'userId specialization'
      },
      { path: 'patientId', select: 'name email' },
      { path: 'hospitalId', select: 'name address' }
    ]);

    // Send email notification
    try {
      await sendAppointmentEmail(patientDetails.email, appointment);
    } catch (error) {
      console.error('Error sending email:', error);
      // Don't fail the appointment creation if email fails
    }

    // Log activity for appointment booking
    try {
      await ActivityService.logActivity({
        user: req.user?._id,
        hospitalId: hospitalId,
        actorId: req.user?._id,
        actorName: req.user?.name || 'User',
        actorRole: req.user?.role || 'user',
        patientId: patient._id,
        action: 'appointment_booked',
        subject: 'appointment',
        subjectId: appointment._id,
        description: `Appointment booked for patient`,
        metadata: {
          appointmentDate: date,
          doctorId: doctorId,
          type: type,
          patientStatusChanged
        }
      });
      
      // Log patient status change if it occurred
      if (patientStatusChanged) {
        await ActivityService.logActivity({
          user: req.user?._id,
          hospitalId: hospitalId,
          actorId: req.user?._id,
          actorName: req.user?.name || 'User',
          actorRole: req.user?.role || 'user',
          patientId: patient._id,
          action: 'update_patient_status',
          subject: 'patient',
          subjectId: patient._id,
          description: `Patient status changed to active due to new appointment booking`,
          metadata: {
            appointmentId: appointment._id,
            previousStatus: 'inactive',
            newStatus: 'active'
          }
        });
      }
    } catch (activityError) {
      console.error('Error logging appointment activity:', activityError);
      // Don't fail the appointment creation if activity logging fails
    }

    res.status(201).json(appointment);
  } catch (error) {
    console.error('Error in appointment booking:', error);
    res.status(error.status || 500);
    throw new Error(error.message || 'Error booking appointment');
  }
});

// @desc    Get doctor's available slots
// @route   GET /api/appointments/doctor-availability
// @access  Public
const getDoctorAvailability = asyncHandler(async (req, res) => {
  const { doctorId, date } = req.query;

  if (!doctorId || !date) {
    res.status(400);
    throw new Error('Please provide doctor ID and date');
  }

  // Get doctor's availability settings
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) {
    res.status(404);
    throw new Error('Doctor not found');
  }

  // Get all booked appointments for the date
  const bookedAppointments = await Appointment.find({
    doctorId,
    date,
    status: { $ne: 'cancelled' }
  }).select('time');

  // Get booked time slots
  const bookedSlots = bookedAppointments.map(apt => apt.time);

  // Define available time slots (you can customize this based on doctor's schedule)
  const allSlots = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'
  ];

  // Filter out booked slots
  const availableSlots = allSlots.filter(slot => !bookedSlots.includes(slot));

  res.json(availableSlots);
});

// @desc    Get available slots for a doctor on a specific date
// @route   GET /api/appointments/available-slots
// @access  Private
const getAvailableSlots = asyncHandler(async (req, res) => {
  const { doctorId, date } = req.query;

  if (!doctorId || !date) {
    res.status(400);
    throw new Error('Please provide doctor ID and date');
  }

  try {
    // Get all booked appointments for the date
    const bookedAppointments = await Appointment.find({
      doctorId,
      date,
      status: { $ne: 'cancelled' }
    }).select('time');

    // Get booked time slots
    const bookedSlots = bookedAppointments.map(apt => apt.time);

    // Define the full list of all possible time slots
    const allTimeSlots = [
      '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
      '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'
    ];

    // Filter out the booked slots to get available slots
    const availableSlots = allTimeSlots.filter(slot => !bookedSlots.includes(slot));

    res.json({
      availableSlots,
      bookedSlots
    });
  } catch (error) {
    console.error('Error fetching available slots:', error);
    res.status(500);
    throw new Error('Error fetching available slots: ' + error.message);
  }
});

// @desc    Get all appointments
// @route   GET /api/appointments
// @access  Private
const getAppointments = asyncHandler(async (req, res) => {
  try {
    const { limit = 1000, doctorId, hospitalId } = req.query;
    
    // If user is staff with no hospital assigned, return empty array
    if (req.user.role === 'staff' && !req.user.hospital) {
      console.log('Staff with no hospital assigned requesting appointments. Returning empty array.');
      return res.json([]);
    }
    
    // Build query object
    const query = {
      patientId: { $ne: null }
    };
    
    // Add doctor filter if provided
    if (doctorId) {
      query.$or = [
        { 'doctorId': doctorId },
        { 'doctorId.userId': doctorId }
      ];
    }
    
    // Use hospital from query params or from user if they're staff
    if (hospitalId) {
      query.hospitalId = hospitalId;
    } else if (req.user.role === 'staff' && req.user.hospital) {
      // If user is staff, only return appointments for their hospital
      query.hospitalId = req.user.hospital;
      console.log(`Filtering appointments for staff user's hospital: ${req.user.hospital}`);
    }

    // Ensure we include all necessary fields
    const appointments = await Appointment.find(query)
      .populate({
        path: 'doctorId',
        select: 'userId specialization',
        populate: {
          path: 'userId',
          select: 'name email'
        }
      })
      .populate('patientId', 'name email phone status') // Add status to populated patient fields
      .populate('hospitalId', 'name address')
      .sort({ date: 1, time: 1 })
      .select('patientId doctorId hospitalId date time type status symptoms notes diagnosis disease treatmentOutcome treatmentEndDate noShowReason')
      .limit(Number(limit));

    if (!appointments || appointments.length === 0) {
      return res.json([]);
    }

    // Filter out any appointments where population failed
    const validAppointments = appointments.filter(
      apt => apt.patientId && apt.doctorId && apt.doctorId.userId
    );

    // Debug log
    console.log(`Returning ${validAppointments.length} appointments with treatment data`);

    res.json(validAppointments);
  } catch (error) {
    console.error('Error in getAppointments:', error);
    res.status(500);
    throw new Error('Error fetching appointments: ' + error.message);
  }
});

// @desc    Get appointment by ID
// @route   GET /api/appointments/:id
// @access  Private
const getAppointmentById = asyncHandler(async (req, res) => {
  try {
    // If user is staff with no hospital assigned, return 404
    if (req.user.role === 'staff' && !req.user.hospital) {
      console.log('Staff with no hospital assigned requesting appointment details. Access denied.');
      res.status(404);
      throw new Error('Appointment not found');
    }
    
    const appointment = await Appointment.findById(req.params.id)
      .populate({
        path: 'doctorId',
        populate: {
          path: 'userId',
          select: 'name email'
        },
        select: 'userId specialization'
      })
      .populate('patientId', 'name email status')
      .populate('hospitalId', 'name address')
      .select('patientId doctorId hospitalId date time type status symptoms notes diagnosis disease treatmentOutcome treatmentEndDate noShowReason');

    if (!appointment) {
      res.status(404);
      throw new Error('Appointment not found');
    }

    // If user is staff, check if appointment is from their hospital
    if (req.user.role === 'staff' && appointment.hospitalId && 
        appointment.hospitalId._id.toString() !== req.user.hospital.toString()) {
      console.log(`Staff user from hospital ${req.user.hospital} trying to access appointment from hospital ${appointment.hospitalId._id}`);
      res.status(404);
      throw new Error('Appointment not found');
    }

    console.log(`Retrieved appointment ${appointment._id} with treatment data:`, {
      diagnosis: appointment.diagnosis,
      disease: appointment.disease,
      treatmentOutcome: appointment.treatmentOutcome || 'none',
      patientStatus: appointment.patientId?.status || 'unknown'
    });
    res.json(appointment);
  } catch (error) {
    console.error('Error in getAppointmentById:', error);
    res.status(error.statusCode || 500);
    throw new Error(error.message || 'Error fetching appointment');
  }
});

// @desc    Update appointment status
// @route   PUT /api/appointments/:id/status
// @access  Private
const updateAppointmentStatus = asyncHandler(async (req, res) => {
  try {
    const { status, noShowReason } = req.body;

    // Create update object
    const updateData = { status };
    
    // If status is not_appeared and noShowReason is provided, add it to the update
    if (status === 'not_appeared' && noShowReason) {
      updateData.noShowReason = noShowReason;
    }

    // Find the appointment
    const appointment = await Appointment.findById(req.params.id);
    
    if (!appointment) {
      res.status(404);
      throw new Error('Appointment not found');
    }
    
    // If status is completed and checkInTime is missing, set it to the current time or the time the appointment was scheduled
    if (status === 'completed' && !appointment.checkInTime) {
      // Use consultation start time if available, or current time as fallback
      const checkInTime = appointment.consultationStartTime || new Date().toISOString();
      updateData.checkInTime = checkInTime;
      console.log(`Auto-setting checkInTime to ${checkInTime} for completed appointment ${appointment._id}`);
    }
    
    // If consultationStartTime is missing and status is completed, set it now
    if (status === 'completed' && !appointment.consultationStartTime) {
      updateData.consultationStartTime = new Date().toISOString();
    }

    // Find and update appointment
    const updatedAppointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      updateData,
      { 
        new: true,
        runValidators: true 
      }
    );

    if (!updatedAppointment) {
      res.status(404);
      throw new Error('Appointment not found');
    }

    // Track if patient status changed for logging
    let patientStatusChanged = false;

    // Update patient's appointment status using findOneAndUpdate
    if (updatedAppointment.patientId) {
      try {
        // Find the patient first
        const patient = await Patient.findById(updatedAppointment.patientId);
        
        if (patient) {
          // If appointment is confirmed and patient is inactive, set status to active
          if (status === 'confirmed' && patient.status === 'inactive') {
            console.log(`Changing patient ${patient._id} status from inactive to active due to confirmed appointment`);
            patient.status = 'active';
            patient.lastStatusChangeDate = new Date();
            patientStatusChanged = true;
          }
          
          // Update the patient's appointments array
          if (patient.appointments && Array.isArray(patient.appointments)) {
            // Find the appointment in the patient's appointments array
            const appointmentIndex = patient.appointments.findIndex(
              apt => apt.doctor && apt.doctor.toString() === updatedAppointment.doctorId.toString()
            );
            
            if (appointmentIndex !== -1) {
              // Update the status of the found appointment
              patient.appointments[appointmentIndex].status = status === 'confirmed' ? 'scheduled' : status;
            } else {
              // If appointment not found in patient's appointments array, add it
              patient.appointments.push({
                doctor: updatedAppointment.doctorId,
                date: new Date(updatedAppointment.date),
                status: status === 'confirmed' ? 'scheduled' : status
              });
            }
          }
          
          // Save the patient with all updates
          await patient.save();
          
          // Log if patient status was changed
          if (patientStatusChanged) {
            console.log(`Patient ${patient._id} status changed from inactive to active due to confirmed appointment`);
            
            // Log activity for patient status change
            try {
              await ActivityService.logActivity({
                user: req.user._id,
                action: 'update_patient_status',
                subject: 'patient',
                subjectId: patient._id,
                details: 'Patient status changed to active due to confirmed appointment',
                metadata: {
                  appointmentId: updatedAppointment._id,
                  previousStatus: 'inactive',
                  newStatus: 'active'
                }
              });
            } catch (activityError) {
              console.error('Error creating patient status update activity log:', activityError);
            }
          }
        }
      } catch (patientError) {
        console.error('Error updating patient record:', patientError);
        // Don't fail the operation if patient record update fails
      }
    }

    // Log the activity
    try {
      await ActivityService.logActivity({
        user: req.user._id,
        hospitalId: updatedAppointment.hospitalId,
        actorId: req.user._id,
        actorName: req.user.name || 'User',
        actorRole: req.user.role || 'user',
        patientId: updatedAppointment.patientId,
        action: status === 'confirmed' ? 'appointment_confirmed' : 
                status === 'cancelled' ? 'appointment_cancelled' :
                status === 'completed' ? 'appointment_completed' :
                status === 'not_appeared' ? 'appointment_not_appeared' : 
                'appointment_updated',
        subject: 'appointment',
        subjectId: updatedAppointment._id,
        description: `Appointment ${status} by ${req.user.role || 'user'}`,
        metadata: {
          appointmentId: updatedAppointment._id,
          previousStatus: updatedAppointment.status,
          newStatus: status,
          patientStatusChanged: patientStatusChanged
        }
      });
    } catch (activityError) {
      console.error('Error creating activity log:', activityError);
      // Don't fail the overall operation if activity logging fails
    }

    // Populate the updated appointment with all necessary details
    try {
      await updatedAppointment.populate([
        {
          path: 'doctorId',
          populate: {
            path: 'userId',
            select: 'name email'
          },
          select: 'userId specialization'
        },
        { path: 'patientId', select: 'name email' },
        { path: 'hospitalId', select: 'name address' }
      ]);
    } catch (populateError) {
      console.error('Error populating appointment:', populateError);
      // If population fails, we can still return the basic updated appointment
    }

    res.json(updatedAppointment);
  } catch (error) {
    console.error('Error updating appointment status:', error);
    res.status(500).json({ message: 'Error updating appointment status: ' + error.message });
  }
});

// Get user appointments
const getUserAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find({ patientId: req.user._id })
      .populate({
        path: 'doctorId',
        populate: {
          path: 'userId',
          select: 'name email'
        },
        select: 'userId specialization'
      })
      .sort({ date: -1 });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create new appointment
// @route   POST /api/appointments
// @access  Private
const createAppointment = asyncHandler(async (req, res) => {
  try {
    console.log('Creating appointment with data:', req.body);
    
    const appointment = new Appointment(req.body);
    const savedAppointment = await appointment.save();
    console.log(`New appointment created with ID: ${savedAppointment._id}`);

    // Track whether patient status was changed
    let patientStatusChanged = false;

    // Set patient status to active when a new appointment is created
    try {
      if (req.body.patientId) {
        const patient = await Patient.findById(req.body.patientId);
        console.log(`Found patient for new appointment: ${patient?._id}, status: ${patient?.status}`);
        
        if (patient && patient.status === 'inactive') {
          console.log(`Changing patient ${patient._id} status from inactive to active`);
          patient.status = 'active';
          patient.lastStatusChangeDate = new Date(); // Reset the last status change date
          await patient.save();
          patientStatusChanged = true;
          console.log(`Patient ${patient._id} status changed from inactive to active due to new appointment`);
        }
      } else if (req.body.patientDetails) {
        // If patientId is not provided but patientDetails is, try to find or create the patient
        const { patientDetails } = req.body;
        let patient = await Patient.findOne({ email: patientDetails.email });
        
        if (!patient) {
          // Create a new patient
          patient = await Patient.create({
            name: patientDetails.name,
            email: patientDetails.email,
            dateOfBirth: patientDetails.dateOfBirth || null,
            age: patientDetails.age || null,
            gender: patientDetails.gender || 'not_specified',
            phone: patientDetails.phone || '',
            bloodGroup: patientDetails.bloodGroup || 'Not Specified',
            allergies: Array.isArray(patientDetails.allergies) ? patientDetails.allergies : [],
            medicalHistory: patientDetails.medicalHistory ? [{ condition: patientDetails.medicalHistory }] : [],
            emergencyContact: {
              name: '',
              relationship: '',
              phone: patientDetails.phone || ''
            },
            status: 'active',
            lastStatusChangeDate: new Date()
          });
          
          console.log(`Created new patient with ID: ${patient._id}`);
          
          // Update the appointment with the new patient ID
          appointment.patientId = patient._id;
          await appointment.save();
        } else if (patient.status === 'inactive') {
          // Update existing patient if inactive
          patient.status = 'active';
          patient.lastStatusChangeDate = new Date();
          await patient.save();
          patientStatusChanged = true;
          console.log(`Patient ${patient._id} status changed from inactive to active due to new appointment`);
        }
      }
    } catch (patientError) {
      console.error('Error updating patient status:', patientError);
      // Don't fail appointment creation if patient status update fails
    }

    // Populate necessary fields for the response
    const populatedAppointment = await Appointment.findById(savedAppointment._id)
      .populate('patientId', 'name email phone')
      .populate({
        path: 'doctorId',
        populate: {
          path: 'userId',
          select: 'name email'
        },
        select: 'userId specialization'
      })
      .populate('hospitalId', 'name address');

    // Log activity
    try {
      await ActivityService.logActivity({
        user: req.user._id,
        hospitalId: req.body.hospitalId,
        actorId: req.user._id,
        actorName: req.user.name || 'User',
        actorRole: req.user.role || 'user',
        patientId: req.body.patientId,
        action: 'appointment_created',
        subject: 'appointment',
        subjectId: populatedAppointment._id,
        description: `Appointment created for patient`,
        metadata: {
          appointmentDate: req.body.date,
          doctorId: req.body.doctorId,
          type: req.body.type
        }
      });
    } catch (activityError) {
      console.error('Error logging appointment activity:', activityError);
      // Don't fail the appointment creation if activity logging fails
    }

    // Include information about whether patient status was changed
    res.status(201).json({
      success: true,
      data: populatedAppointment,
      patientStatusChanged,
      message: patientStatusChanged 
        ? 'Appointment created successfully and patient status changed to active'
        : 'Appointment created successfully'
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    // Send a more specific error message
    res.status(400).json({ 
      success: false,
      message: error.message || 'Error creating appointment',
      error: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
});

const confirmAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status: 'confirmed' },
      { new: true }
    );

    // Track if patient's status changed
    let patientStatusChanged = false;

    // Update patient status if inactive
    if (appointment && appointment.patientId) {
      try {
        const patient = await Patient.findById(appointment.patientId);
        
        if (patient && patient.status === 'inactive') {
          console.log(`Changing patient ${patient._id} status from inactive to active due to confirmed appointment`);
          patient.status = 'active';
          patient.lastStatusChangeDate = new Date();
          await patient.save();
          patientStatusChanged = true;
          
          // Log activity for patient status change
          try {
            await ActivityService.logActivity({
              user: req.user._id,
              action: 'update_patient_status',
              subject: 'patient',
              subjectId: patient._id,
              details: 'Patient status changed to active due to confirmed appointment',
              metadata: {
                appointmentId: appointment._id,
                previousStatus: 'inactive',
                newStatus: 'active'
              }
            });
          } catch (activityError) {
            console.error('Error creating patient status update activity log:', activityError);
          }
        }
      } catch (patientError) {
        console.error('Error updating patient status:', patientError);
        // Don't fail the operation if patient status update fails
      }
    }

    try {
      await ActivityService.logActivity({
        user: req.user._id,
        hospitalId: appointment.hospitalId,
        actorId: req.user._id,
        actorName: req.user.name || 'User',
        actorRole: req.user.role || 'user',
        patientId: appointment.patientId,
        action: 'appointment_confirmed',
        subject: 'appointment',
        subjectId: appointment._id,
        description: `Appointment confirmed by ${req.user.name || 'User'}`,
        metadata: {
          patientStatusChanged
        }
      });
    } catch (activityError) {
      console.error('Error logging confirm appointment activity:', activityError);
      // Don't fail the operation if activity logging fails
    }

    res.json(appointment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const completeAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status: 'completed', ...req.body },
      { new: true }
    );

    try {
      await ActivityService.logActivity({
        user: req.user._id,
        hospitalId: appointment.hospitalId,
        actorId: req.user._id,
        actorName: req.user.name || 'User',
        actorRole: req.user.role || 'user',
        patientId: appointment.patientId,
        action: 'appointment_completed',
        subject: 'appointment',
        subjectId: appointment._id,
        description: `Appointment completed by ${req.user.name || 'User'}`,
        details: req.body.notes || '',
        metadata: {
          diagnosis: req.body.diagnosis,
          prescription: req.body.prescription,
          followUp: req.body.followUpDate
        }
      });
    } catch (activityError) {
      console.error('Error logging complete appointment activity:', activityError);
      // Don't fail the operation if activity logging fails
    }

    res.json(appointment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Cancel appointment
const cancelAppointment = async (req, res) => {
  try {
    const { id } = req.params;

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Check authorization
    if (
      req.user.role !== 'admin' &&
      appointment.patientId.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ message: 'Not authorized to cancel this appointment' });
    }

    appointment.status = 'cancelled';
    await appointment.save();

    // Log activity for appointment cancellation
    try {
      await ActivityService.logActivity({
        user: req.user._id,
        hospitalId: appointment.hospitalId,
        actorId: req.user._id,
        actorName: req.user.name || 'User',
        actorRole: req.user.role || 'user',
        patientId: appointment.patientId,
        action: 'appointment_cancelled',
        subject: 'appointment',
        subjectId: appointment._id,
        description: `Appointment cancelled by ${req.user.name || 'User'}`,
      });
    } catch (activityError) {
      console.error('Error logging cancel appointment activity:', activityError);
      // Don't fail the operation if activity logging fails
    }

    res.json(appointment);
  } catch (error) {
    console.error('Error cancelling appointment:', error);
    res.status(500).json({ message: 'Error cancelling appointment' });
  }
};

// @desc    Get appointment count for a doctor
// @route   GET /api/appointments/count
// @access  Private
const getAppointmentCount = asyncHandler(async (req, res) => {
  const { doctorId } = req.query;

  if (!doctorId) {
    res.status(400);
    throw new Error('Doctor ID is required');
  }

  try {
    // Get total appointments count
    const count = await Appointment.countDocuments({ doctorId });

    // Get unique patients count
    const uniquePatients = await Appointment.distinct('patientId', { doctorId }).length;

    res.json({
      count,
      uniquePatients
    });
  } catch (error) {
    console.error('Error getting appointment count:', error);
    res.status(500);
    throw new Error('Error getting appointment count');
  }
});

// @desc    Get dashboard stats for appointments
// @route   GET /api/appointments/dashboard
// @access  Private
const getDashboardStats = asyncHandler(async (req, res) => {
  try {
    const { limit = 3 } = req.query;
    
    // Get total appointments count
    const totalAppointments = await Appointment.countDocuments({
      status: { $in: ['pending', 'confirmed', 'completed'] }
    });

    // Get recent appointments
    const recentAppointments = await Appointment.find({
      status: { $in: ['pending', 'confirmed', 'completed'] }
    })
      .populate({
        path: 'doctorId',
        select: 'userId specialization',
        populate: {
          path: 'userId',
          select: 'name email'
        }
      })
      .populate('patientId', 'name email phone')
      .sort({ date: -1, time: -1 })
      .limit(Number(limit));

    res.json({
      totalAppointments,
      recentAppointments
    });
  } catch (error) {
    console.error('Error in getDashboardStats:', error);
    res.status(500);
    throw new Error('Error fetching dashboard stats: ' + error.message);
  }
});

const getPatientAppointments = asyncHandler(async (req, res) => {
  const { patientId } = req.params;

  const appointments = await Appointment.find({ patientId })
    .sort({ date: -1, time: -1 })
    .select('date time type status symptoms notes');

  res.json(appointments);
});

// @desc    Update treatment outcome for an appointment
// @route   PUT /api/appointments/:id/treatment-outcome
// @access  Private/Doctor and Staff
const updateTreatmentOutcome = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { diagnosis, disease, treatmentOutcome, treatmentEndDate } = req.body;

    console.log(`Treatment update request received for appointment ${id}`, {
      diagnosis, 
      disease, 
      treatmentOutcome, 
      treatmentEndDate
    });

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid appointment ID' });
    }

    // Find the appointment
    const appointment = await Appointment.findById(id);

    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    console.log(`Found appointment: ${appointment._id}, current status: ${appointment.status}, current treatment outcome: ${appointment.treatmentOutcome || 'none'}`);

    // Check permissions: Doctor can only update their own appointments, staff can update any
    if (req.user.role === 'doctor') {
      // Find doctor ID from user ID
      const doctor = await Doctor.findOne({ userId: req.user._id });
      if (!doctor) {
        return res.status(404).json({ message: 'Doctor not found' });
      }

      // Check if appointment belongs to this doctor
      if (String(appointment.doctorId) !== String(doctor._id)) {
        return res.status(403).json({ 
          message: 'You are not authorized to update this appointment' 
        });
      }
    } else if (req.user.role !== 'staff' && req.user.role !== 'admin') {
      return res.status(403).json({ 
        message: 'Only doctors, staff, or admins can update treatment outcomes' 
      });
    }

    // Validate treatment outcome
    const validOutcomes = ['successful', 'partial', 'unsuccessful', 'ongoing'];
    if (treatmentOutcome && !validOutcomes.includes(treatmentOutcome)) {
      return res.status(400).json({ 
        message: 'Invalid treatment outcome. Must be one of: successful, partial, unsuccessful, ongoing' 
      });
    }

    // Update appointment with treatment information
    appointment.diagnosis = diagnosis || appointment.diagnosis;
    appointment.disease = disease || appointment.disease;
    appointment.treatmentOutcome = treatmentOutcome;
    
    // Only update treatmentEndDate if provided
    if (treatmentEndDate) {
      appointment.treatmentEndDate = treatmentEndDate;
    }

    // If treatment is marked as completed (successful, partial, unsuccessful), 
    // also update appointment status to completed
    if (treatmentOutcome && treatmentOutcome !== 'ongoing') {
      appointment.status = 'completed';
    }

    console.log(`Updating appointment treatment data: treatmentOutcome=${treatmentOutcome}, status=${appointment.status}`);
    await appointment.save();
    console.log(`Appointment ${appointment._id} updated successfully`);

    // If treatment outcome is successful or unsuccessful, set patient status to inactive
    if (treatmentOutcome === 'successful' || treatmentOutcome === 'unsuccessful') {
      try {
        // Ensure we have a valid patient ID
        if (!appointment.patientId) {
          console.error('No patient ID found in appointment');
          return res.status(400).json({ 
            message: 'Cannot update patient status: No patient ID associated with this appointment' 
          });
        }

        // Find the patient
        const patientId = typeof appointment.patientId === 'string' 
          ? appointment.patientId 
          : appointment.patientId._id || appointment.patientId;
          
        console.log(`Looking for patient with ID: ${patientId}`);
        const patient = await Patient.findById(patientId);
        
        if (patient) {
          console.log(`Found patient ${patient._id}, current status: ${patient.status}`);
          
          // Calculate treatment days if the patient is currently active
          if (patient.status === 'active' && patient.lastStatusChangeDate) {
            const currentDate = new Date();
            const lastChangeDate = new Date(patient.lastStatusChangeDate);
            const daysDifference = Math.floor((currentDate - lastChangeDate) / (1000 * 60 * 60 * 24));
            
            // Add days to treatmentDays count
            patient.treatmentDays = (patient.treatmentDays || 0) + daysDifference;
            console.log(`Added ${daysDifference} days to treatment days for patient ${patient._id}`);
          }
          
          // Change patient status to inactive and update last change date
          patient.status = 'inactive';
          patient.lastStatusChangeDate = new Date();
          
          // Save the patient record with updated status and treatment days
          await patient.save();
          
          console.log(`Patient ${patient._id} status updated to inactive due to ${treatmentOutcome} treatment`);
          
          // Log activity for patient status update
          try {
            await ActivityService.logActivity({
              user: req.user._id,
              action: 'update_patient_status',
              subject: 'patient',
              subjectId: patient._id,
              details: `Patient status changed to inactive after ${treatmentOutcome} treatment`,
              metadata: {
                appointmentId: appointment._id,
                treatmentOutcome,
                previousStatus: 'active',
                newStatus: 'inactive'
              }
            });
          } catch (activityError) {
            console.error('Error creating patient status update activity log:', activityError);
          }
        } else {
          console.error(`Patient not found for ID: ${patientId}`);
          // Return a warning but don't fail the appointment update
          return res.status(200).json({
            message: 'Treatment outcome updated successfully but patient record not found to update status',
            appointment: {
              _id: appointment._id,
              diagnosis: appointment.diagnosis,
              disease: appointment.disease,
              treatmentOutcome: appointment.treatmentOutcome,
              treatmentEndDate: appointment.treatmentEndDate,
              status: appointment.status
            },
            warning: 'Patient record not found - status not updated'
          });
        }
      } catch (patientError) {
        console.error('Error updating patient status:', patientError);
        // Don't fail the overall operation if patient status update fails
        return res.status(200).json({
          message: 'Treatment outcome updated but patient status update failed',
          appointment: {
            _id: appointment._id,
            diagnosis: appointment.diagnosis,
            disease: appointment.disease,
            treatmentOutcome: appointment.treatmentOutcome,
            treatmentEndDate: appointment.treatmentEndDate,
            status: appointment.status
          },
          warning: `Patient status update failed: ${patientError.message}`
        });
      }
    } 
    // If treatment outcome is ongoing, ensure patient status is active
    else if (treatmentOutcome === 'ongoing') {
      try {
        // Ensure we have a valid patient ID
        if (!appointment.patientId) {
          console.error('No patient ID found in appointment');
          return res.status(400).json({ 
            message: 'Cannot update patient status: No patient ID associated with this appointment' 
          });
        }

        // Find the patient
        const patientId = typeof appointment.patientId === 'string' 
          ? appointment.patientId 
          : appointment.patientId._id || appointment.patientId;
          
        console.log(`Looking for patient with ID: ${patientId}`);
        const patient = await Patient.findById(patientId);
        
        if (patient) {
          console.log(`Found patient ${patient._id}, current status: ${patient.status}`);
          
          // Only update if patient is not already active
          if (patient.status !== 'active') {
            // Change patient status to active and update last change date
            patient.status = 'active';
            patient.lastStatusChangeDate = new Date();
            
            // Save the patient record with updated status
            await patient.save();
            
            console.log(`Patient ${patient._id} status updated to active due to ongoing treatment`);
            
            // Log activity for patient status update
            try {
              await ActivityService.logActivity({
                user: req.user._id,
                action: 'update_patient_status',
                subject: 'patient',
                subjectId: patient._id,
                details: 'Patient status changed to active for ongoing treatment',
                metadata: {
                  appointmentId: appointment._id,
                  treatmentOutcome,
                  previousStatus: 'inactive',
                  newStatus: 'active'
                }
              });
            } catch (activityError) {
              console.error('Error creating patient status update activity log:', activityError);
            }
          }
        } else {
          console.error(`Patient not found for ID: ${patientId}`);
          // Return a warning but don't fail the appointment update
          return res.status(200).json({
            message: 'Treatment outcome updated successfully but patient record not found to update status',
            appointment: {
              _id: appointment._id,
              diagnosis: appointment.diagnosis,
              disease: appointment.disease,
              treatmentOutcome: appointment.treatmentOutcome,
              treatmentEndDate: appointment.treatmentEndDate,
              status: appointment.status
            },
            warning: 'Patient record not found - status not updated'
          });
        }
      } catch (patientError) {
        console.error('Error updating patient status:', patientError);
        // Don't fail the overall operation if patient status update fails
        return res.status(200).json({
          message: 'Treatment outcome updated but patient status update failed',
          appointment: {
            _id: appointment._id,
            diagnosis: appointment.diagnosis,
            disease: appointment.disease,
            treatmentOutcome: appointment.treatmentOutcome,
            treatmentEndDate: appointment.treatmentEndDate,
            status: appointment.status
          },
          warning: `Patient status update failed: ${patientError.message}`
        });
      }
    }

    // Create activity log - wrapped in try/catch to prevent failure if Activity model has issues
    try {
      await ActivityService.logActivity({
        user: req.user._id,
        action: 'update_treatment',
        subject: 'appointment',
        subjectId: appointment._id,
        details: `Updated treatment outcome to ${treatmentOutcome}`,
        metadata: {
          appointmentId: appointment._id,
          patientId: appointment.patientId,
          disease,
          treatmentOutcome
        }
      });
    } catch (activityError) {
      console.error('Error creating activity log:', activityError);
      // Don't fail the overall operation if activity logging fails
    }

    res.json({
      message: 'Treatment outcome updated successfully',
      appointment: {
        _id: appointment._id,
        diagnosis: appointment.diagnosis,
        disease: appointment.disease,
        treatmentOutcome: appointment.treatmentOutcome,
        treatmentEndDate: appointment.treatmentEndDate,
        status: appointment.status
      }
    });
  } catch (error) {
    console.error('Error updating treatment outcome:', error);
    res.status(500).json({ message: 'Server error while updating treatment outcome' });
  }
});

// @desc    Update follow-up appointment time
// @route   PUT /api/appointments/:id/follow-up
// @access  Private
const updateFollowUpAppointment = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { time, timeSlotConfirmed, reminderSent } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid appointment ID' });
    }

    // Find the appointment
    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    // Verify it's a follow-up appointment
    if (!appointment.isFollowUp) {
      return res.status(400).json({ message: 'This is not a follow-up appointment' });
    }

    // Update the appointment
    const updateData = {};
    
    if (time) {
      updateData.time = time;
      updateData.needsTimeSlot = false;
    }
    
    if (timeSlotConfirmed !== undefined) {
      updateData.timeSlotConfirmed = timeSlotConfirmed;
    }
    
    if (reminderSent !== undefined) {
      updateData.reminderSent = reminderSent;
    }

    const updatedAppointment = await Appointment.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).populate([
      {
        path: 'doctorId',
        select: 'userId specialization',
        populate: {
          path: 'userId',
          select: 'name email'
        }
      },
      { path: 'patientId', select: 'name email phone' },
      { path: 'hospitalId', select: 'name address' }
    ]);

    // Log activity for follow-up update
    try {
      await ActivityService.logActivity({
        user: req.user._id,
        hospitalId: appointment.hospitalId,
        actorId: req.user._id,
        actorName: req.user.name || 'User',
        actorRole: req.user.role || 'user',
        patientId: appointment.patientId,
        action: 'followup_updated',
        subject: 'appointment',
        subjectId: appointment._id,
        description: `Follow-up appointment updated by ${req.user.name || 'User'}`,
        metadata: {
          time: time || appointment.time,
          timeSlotConfirmed: timeSlotConfirmed !== undefined ? timeSlotConfirmed : appointment.timeSlotConfirmed,
          reminderSent: reminderSent !== undefined ? reminderSent : appointment.reminderSent
        }
      });
    } catch (activityError) {
      console.error('Error logging follow-up update activity:', activityError);
    }

    res.json(updatedAppointment);
  } catch (error) {
    console.error('Error updating follow-up appointment:', error);
    res.status(500).json({ message: 'Server error while updating follow-up appointment' });
  }
});

// @desc    Get all follow-up appointments
// @route   GET /api/appointments/follow-ups
// @access  Private/Staff, Admin, Doctor
const getFollowUpAppointments = asyncHandler(async (req, res) => {
  try {
    const { status, needsTimeSlot, date, hospitalId, doctorId } = req.query;
    
    // Build query
    const query = { isFollowUp: true };
    
    if (status) {
      query.status = status;
    }
    
    if (needsTimeSlot === 'true') {
      query.needsTimeSlot = true;
    } else if (needsTimeSlot === 'false') {
      query.needsTimeSlot = false;
    }
    
    if (date) {
      query.date = date;
    }
    
    if (hospitalId) {
      query.hospitalId = hospitalId;
    }
    
    if (doctorId) {
      query.doctorId = doctorId;
    }
    
    // For today's follow-ups
    if (req.query.today === 'true') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      
      query.date = {
        $gte: todayStart,
        $lte: todayEnd
      };
    }
    
    // For upcoming follow-ups
    if (req.query.upcoming === 'true') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30); // Next 30 days
      
      query.date = {
        $gte: tomorrow,
        $lte: futureDate
      };
    }

    const followUps = await Appointment.find(query)
      .populate({
        path: 'doctorId',
        select: 'userId specialization',
        populate: {
          path: 'userId',
          select: 'name email'
        }
      })
      .populate('patientId', 'name email phone')
      .populate('hospitalId', 'name address')
      .populate('relatedReportId')
      .sort({ date: 1, time: 1 });

    res.json(followUps);
  } catch (error) {
    console.error('Error fetching follow-up appointments:', error);
    res.status(500).json({ message: 'Server error while fetching follow-up appointments' });
  }
});

// @desc    Get appointment growth metrics for dashboard
// @route   GET /api/appointments/growth
// @access  Private
const getAppointmentGrowthMetrics = asyncHandler(async (req, res) => {
  try {
    console.log('Fetching appointment growth metrics');
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const sixtyDaysAgo = new Date(today);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    
    console.log(`Date ranges: thirtyDaysAgo=${thirtyDaysAgo.toISOString()}, sixtyDaysAgo=${sixtyDaysAgo.toISOString()}`);
    
    // Format dates as ISO strings without time component for comparing with date field
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
    const sixtyDaysAgoStr = sixtyDaysAgo.toISOString().split('T')[0];
    
    console.log(`String dates for comparison: thirtyDaysAgoStr=${thirtyDaysAgoStr}, sixtyDaysAgoStr=${sixtyDaysAgoStr}`);
    
    // Create separate queries for createdAt (Date) and date (String) fields
    // to avoid MongoDB errors with mixed type comparisons
    try {
      // Recent appointments query (last 30 days)
      // We need to make two separate queries because the date field could be a string
      const recentAppointmentsByCreatedAt = await Appointment.countDocuments({
        createdAt: { $gte: thirtyDaysAgo }
      });
      
      const recentAppointmentsByDate = await Appointment.countDocuments({
        date: { $gte: thirtyDaysAgoStr }
      });
      
      // Combine counts but avoid double counting
      // This is an approximation, but better than the previous approach
      const recentAppointments = Math.max(recentAppointmentsByCreatedAt, recentAppointmentsByDate);
      console.log(`Recent appointments count: ${recentAppointments} (createdAt: ${recentAppointmentsByCreatedAt}, date: ${recentAppointmentsByDate})`);
      
      // Previous appointments query (30-60 days ago)
      const previousAppointmentsByCreatedAt = await Appointment.countDocuments({
        createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo }
      });
      
      const previousAppointmentsByDate = await Appointment.countDocuments({
        date: { $gte: sixtyDaysAgoStr, $lt: thirtyDaysAgoStr }
      });
      
      // Combine counts but avoid double counting
      const previousAppointments = Math.max(previousAppointmentsByCreatedAt, previousAppointmentsByDate);
      console.log(`Previous appointments count: ${previousAppointments} (createdAt: ${previousAppointmentsByCreatedAt}, date: ${previousAppointmentsByDate})`);
      
      // Calculate growth percentage
      const appointmentGrowth = previousAppointments === 0 
        ? 100 
        : Math.round(((recentAppointments - previousAppointments) / previousAppointments) * 100);
      console.log(`Appointment growth: ${appointmentGrowth}%`);
      
      // Get completed appointments for revenue estimation using the same approach
      const recentCompleted1 = await Appointment.countDocuments({
        status: 'completed',
        createdAt: { $gte: thirtyDaysAgo }
      });
      
      const recentCompleted2 = await Appointment.countDocuments({
        status: 'completed',
        date: { $gte: thirtyDaysAgoStr }
      });
      
      const recentCompletedAppointments = Math.max(recentCompleted1, recentCompleted2);
      console.log(`Recent completed appointments: ${recentCompletedAppointments}`);
      
      const previousCompleted1 = await Appointment.countDocuments({
        status: 'completed',
        createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo }
      });
      
      const previousCompleted2 = await Appointment.countDocuments({
        status: 'completed',
        date: { $gte: sixtyDaysAgoStr, $lt: thirtyDaysAgoStr }
      });
      
      const previousCompletedAppointments = Math.max(previousCompleted1, previousCompleted2);
      console.log(`Previous completed appointments: ${previousCompletedAppointments}`);
      
      // Estimate revenue (assuming average revenue per completed appointment)
      const avgRevenuePerAppointment = 500; // Example value
      const recentRevenue = recentCompletedAppointments * avgRevenuePerAppointment;
      const previousRevenue = previousCompletedAppointments * avgRevenuePerAppointment;
      
      // Calculate revenue growth
      const revenueGrowth = previousRevenue === 0 
        ? 100 
        : Math.round(((recentRevenue - previousRevenue) / previousRevenue) * 100);
      console.log(`Revenue growth: ${revenueGrowth}%`);
      
      // Get appointment status counts for last 30 days
      const completedCount = await Appointment.countDocuments({
        status: 'completed',
        $or: [
          { createdAt: { $gte: thirtyDaysAgo } },
          { date: { $gte: thirtyDaysAgoStr } }
        ]
      });
      
      const pendingCount = await Appointment.countDocuments({
        status: 'pending',
        $or: [
          { createdAt: { $gte: thirtyDaysAgo } },
          { date: { $gte: thirtyDaysAgoStr } }
        ]
      });
      
      const confirmedCount = await Appointment.countDocuments({
        status: 'confirmed',
        $or: [
          { createdAt: { $gte: thirtyDaysAgo } },
          { date: { $gte: thirtyDaysAgoStr } }
        ]
      });
      
      const cancelledCount = await Appointment.countDocuments({
        status: 'cancelled',
        $or: [
          { createdAt: { $gte: thirtyDaysAgo } },
          { date: { $gte: thirtyDaysAgoStr } }
        ]
      });
      
      console.log(`Status counts - completed: ${completedCount}, pending: ${pendingCount}, confirmed: ${confirmedCount}, cancelled: ${cancelledCount}`);
      
      // Get appointment daily trend for last 30 days
      const appointmentTrend = [];
      console.log('Calculating appointment trend for last 30 days...');
      
      // Generate data for the last 30 days including today
      for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        
        const dateString = date.toISOString().split('T')[0];
        
        try {
          // Query appointments for this day
          const countByCreatedAt = await Appointment.countDocuments({
            createdAt: { $gte: date, $lt: nextDate }
          });
          
          const countByDate = await Appointment.countDocuments({
            date: dateString
          });
          
          // Use the higher count from either query for this day
          const dayCount = Math.max(countByCreatedAt, countByDate);
          
          appointmentTrend.push({
            date: dateString,
            count: dayCount
          });
          
          if (i % 5 === 0) {
            console.log(`Trend data for ${dateString}: ${dayCount} actual appointments`);
          }
        } catch (trendError) {
          console.error(`Error getting trend data for ${dateString}:`, trendError);
          
          // Use 0 as fallback on error instead of generating fake data
          appointmentTrend.push({
            date: dateString,
            count: 0
          });
        }
      }
      
      console.log(`Successfully calculated trend data for ${appointmentTrend.length} days`);
      console.log('Sending response...');
      
      res.json({
        appointmentGrowth,
        revenueGrowth,
        recentAppointments,
        previousAppointments,
        recentRevenue,
        previousRevenue,
        statusDistribution: {
          completed: completedCount,
          pending: pendingCount,
          confirmed: confirmedCount,
          cancelled: cancelledCount
        },
        appointmentTrend
      });
    } catch (countError) {
      console.error('Error during MongoDB count operations:', countError);
      throw countError;
    }
  } catch (error) {
    console.error('Error getting appointment growth metrics:', error);
    // Return a more user-friendly error and detailed error message in development
    res.status(500).json({ 
      message: 'Failed to get appointment growth metrics', 
      error: error.message,
      // Create fallback data so frontend doesn't break
      fallback: {
        appointmentGrowth: 5,
        revenueGrowth: 10,
        recentAppointments: 10,
        previousAppointments: 5,
        recentRevenue: 5000,
        previousRevenue: 2500,
        statusDistribution: {
          completed: 5,
          pending: 3,
          confirmed: 2,
          cancelled: 1
        },
        appointmentTrend: Array.from({ length: 30 }, (_, i) => ({
          date: new Date(new Date().setDate(new Date().getDate() - (29 - i))).toISOString().split('T')[0],
          count: Math.floor(Math.random() * 5) + 1
        }))
      }
    });
  }
});

// @desc    Check in a patient for their appointment
// @route   PATCH /api/appointments/:id/check-in
// @access  Private (Staff/Doctor)
const checkInPatient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { checkInTime } = req.body;

  // Validate appointment ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error('Invalid appointment ID');
  }

  // Find the appointment
  const appointment = await Appointment.findById(id);
  if (!appointment) {
    res.status(404);
    throw new Error('Appointment not found');
  }

  // Update appointment with check-in time
  appointment.checkInTime = checkInTime || new Date().toISOString();
  
  // Update status to confirmed since patient has checked in
  if (appointment.status === 'pending') {
    appointment.status = 'confirmed';
  }

  await appointment.save();

  // Log activity for check-in
  try {
    const patient = await Patient.findById(appointment.patientId);
    
    await ActivityService.logActivity({
      user: req.user?._id,
      hospitalId: appointment.hospitalId,
      actorId: req.user?._id,
      actorName: req.user?.name || 'Staff',
      actorRole: req.user?.role || 'staff',
      patientId: appointment.patientId,
      action: 'patient_checked_in',
      subject: 'appointment',
      subjectId: appointment._id,
      description: `Patient checked in for appointment`,
      metadata: {
        appointmentDate: appointment.date,
        appointmentTime: appointment.time,
        checkInTime: appointment.checkInTime
      }
    });
  } catch (activityError) {
    console.error('Error logging check-in activity:', activityError);
    // Don't fail the check-in if activity logging fails
  }

  // Return the updated appointment
  res.json({
    success: true,
    appointment
  });
});

module.exports = {
  bookAppointment,
  getDoctorAvailability,
  getAppointments,
  getAppointmentById,
  updateAppointmentStatus,
  getUserAppointments,
  createAppointment,
  confirmAppointment,
  completeAppointment,
  cancelAppointment,
  getAppointmentCount,
  getAvailableSlots,
  getDashboardStats,
  getPatientAppointments,
  updateTreatmentOutcome,
  updateFollowUpAppointment,
  getFollowUpAppointments,
  getAppointmentGrowthMetrics,
  checkInPatient
};