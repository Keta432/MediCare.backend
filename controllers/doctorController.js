const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Patient = require('../models/Patient');
const Report = require('../models/Report');
const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Activity = require('../models/Activity');

// Get all doctors
const getDoctors = async (req, res) => {
  try {
    const { hospitalId } = req.query;
    
    // Build query
    const query = {};
    if (hospitalId) {
      query.hospitalId = hospitalId;
    }
    
    const doctors = await Doctor.find(query)
      .populate({
        path: 'userId',
        select: 'name email status'
      })
      .populate('hospitalId', 'name address');
      
    // Filter out inactive doctors and format response
    const activeDoctors = doctors
      .filter(doctor => doctor.userId && doctor.userId.status === 'active')
      .map(doctor => ({
        _id: doctor._id,
        userId: {
          name: doctor.userId.name,
          email: doctor.userId.email
        },
        specialization: doctor.specialization,
        hospitalId: doctor.hospitalId
      }));
      
    res.json(activeDoctors);
  } catch (error) {
    console.error('Error fetching doctors:', error);
    res.status(500).json({ message: error.message });
  }
};

// Get doctor by ID
const getDoctorById = async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id).populate('user', '-password');
    if (doctor) {
      res.json(doctor);
    } else {
      res.status(404).json({ message: 'Doctor not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get doctor profile
// @route   GET /api/doctors/profile
// @access  Private/Doctor
const getDoctorProfile = asyncHandler(async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ userId: req.user._id })
      .populate('userId', 'name email phone')
      .populate('hospitalId', 'name address');

    if (!doctor) {
      res.status(404);
      throw new Error('Doctor not found');
    }

    res.json({
      _id: doctor._id,
      userId: doctor.userId._id,
      name: doctor.userId.name,
      email: doctor.userId.email,
      phone: doctor.userId.phone || '',
      mobile: doctor.mobile || '',
      title: doctor.title || 'Dr',
      surName: doctor.surName || '',
      middleName: doctor.middleName || '',
      dateOfBirth: doctor.dateOfBirth || '',
      gender: doctor.gender || '',
      city: doctor.city || '',
      localAddress: doctor.localAddress || '',
      permanentAddress: doctor.permanentAddress || '',
      specialization: doctor.specialization,
      qualification: doctor.qualification || '',
      institute: doctor.institute || '',
      passingYear: doctor.passingYear || '',
      registrationId: doctor.registrationId || '',
      aadharNumber: doctor.aadharNumber || '',
      panNumber: doctor.panNumber || '',
      joiningDate: doctor.joiningDate || '',
      experience: doctor.experience,
      hospitalId: doctor.hospitalId?._id,
      hospital: doctor.hospitalId?.name,
      qualifications: doctor.qualifications || [],
      availability: doctor.availability,
      fees: doctor.fees,
      rating: doctor.rating,
      appointments: doctor.appointments,
      patients: doctor.patients
    });
  } catch (error) {
    console.error('Error in getDoctorProfile:', error);
    res.status(500);
    throw new Error('Error fetching doctor profile');
  }
});

// @desc    Update doctor profile
// @route   PUT /api/doctors/profile
// @access  Private/Doctor
const updateDoctorProfile = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findOne({ userId: req.user._id });

  if (doctor) {
    // Update doctor fields
    doctor.title = req.body.title || doctor.title;
    doctor.surName = req.body.surName !== undefined ? req.body.surName : doctor.surName;
    doctor.middleName = req.body.middleName !== undefined ? req.body.middleName : doctor.middleName;
    doctor.dateOfBirth = req.body.dateOfBirth || doctor.dateOfBirth;
    doctor.gender = req.body.gender || doctor.gender;
    doctor.mobile = req.body.mobile || doctor.mobile;
    doctor.city = req.body.city || doctor.city;
    doctor.localAddress = req.body.localAddress !== undefined ? req.body.localAddress : doctor.localAddress;
    doctor.permanentAddress = req.body.permanentAddress !== undefined ? req.body.permanentAddress : doctor.permanentAddress;
    doctor.specialization = req.body.specialization || doctor.specialization;
    doctor.qualification = req.body.qualification || doctor.qualification;
    doctor.institute = req.body.institute || doctor.institute;
    doctor.passingYear = req.body.passingYear || doctor.passingYear;
    doctor.registrationId = req.body.registrationId || doctor.registrationId;
    doctor.aadharNumber = req.body.aadharNumber || doctor.aadharNumber;
    doctor.panNumber = req.body.panNumber || doctor.panNumber;
    doctor.joiningDate = req.body.joiningDate || doctor.joiningDate;
    doctor.experience = req.body.experience || doctor.experience;
    doctor.qualifications = req.body.qualifications || doctor.qualifications;
    doctor.availability = req.body.availability || doctor.availability;
    doctor.fees = req.body.fees || doctor.fees;

    // Update user fields
    const user = await User.findById(req.user._id);
    if (user) {
      if (req.body.name) user.name = req.body.name;
      user.phone = req.body.phone || user.phone;
      await user.save();
    }

    const updatedDoctor = await doctor.save();

    // Return full profile data
    res.json({
      _id: updatedDoctor._id,
      userId: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      mobile: updatedDoctor.mobile,
      title: updatedDoctor.title,
      surName: updatedDoctor.surName,
      middleName: updatedDoctor.middleName,
      dateOfBirth: updatedDoctor.dateOfBirth,
      gender: updatedDoctor.gender,
      city: updatedDoctor.city,
      localAddress: updatedDoctor.localAddress,
      permanentAddress: updatedDoctor.permanentAddress,
      specialization: updatedDoctor.specialization,
      qualification: updatedDoctor.qualification,
      institute: updatedDoctor.institute,
      passingYear: updatedDoctor.passingYear,
      registrationId: updatedDoctor.registrationId,
      aadharNumber: updatedDoctor.aadharNumber,
      panNumber: updatedDoctor.panNumber,
      joiningDate: updatedDoctor.joiningDate,
      experience: updatedDoctor.experience,
      qualifications: updatedDoctor.qualifications,
      availability: updatedDoctor.availability,
      fees: updatedDoctor.fees,
      rating: updatedDoctor.rating,
      appointments: updatedDoctor.appointments,
      patients: updatedDoctor.patients
    });
  } else {
    res.status(404);
    throw new Error('Doctor not found');
  }
});

// @desc    Get doctor stats
// @route   GET /api/doctors/stats
// @access  Private/Doctor
const getDoctorStats = asyncHandler(async (req, res) => {
  try {
    // Get the doctor's ID using the user ID
    const doctor = await Doctor.findOne({ userId: req.user._id });
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentTime = new Date();

    // Get weekly dates for the past 7 days
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split('T')[0];
    }).reverse();

    // Get appointments for each day of the week
    const weeklyAppointments = await Promise.all(
      weekDates.map(async (date) => {
        const count = await Appointment.countDocuments({
          doctorId: doctor._id,
          date: date,
          status: { $in: ['pending', 'confirmed', 'completed'] }
        });
        return count;
      })
    );

    // Get today's appointments (only upcoming ones based on current time)
    const todayAppointments = await Appointment.countDocuments({
      doctorId: doctor._id,
      date: today.toISOString().split('T')[0],
      status: { $in: ['pending', 'confirmed'] }
    });

    // Get total patients
    const totalPatients = await Appointment.distinct('patientId', {
      doctorId: doctor._id
    });

    // Get weekly patients
    const weeklyPatients = await Appointment.distinct('patientId', {
      doctorId: doctor._id,
      date: {
        $gte: weekDates[0],
        $lte: weekDates[6]
      }
    });

    // Calculate appointment rate (completed vs total)
    const totalAppointments = await Appointment.countDocuments({
      doctorId: doctor._id,
      status: { $in: ['completed', 'cancelled'] }
    });

    const completedAppointments = await Appointment.countDocuments({
      doctorId: doctor._id,
      status: 'completed'
    });
    
    // Get pending appointments
    const pendingAppointments = await Appointment.countDocuments({
      doctorId: doctor._id,
      status: 'pending'
    });

    const appointmentRate = totalAppointments > 0
      ? Math.round((completedAppointments / totalAppointments) * 100)
      : 0;

    // Get patient demographics
    const patients = await Patient.find({
      _id: { $in: totalPatients }
    });

    const gender = {
      male: patients.filter(p => p.gender === 'male').length,
      female: patients.filter(p => p.gender === 'female').length,
      other: patients.filter(p => p.gender !== 'male' && p.gender !== 'female' || !p.gender).length
    };

    // Calculate age groups - making sure to match the frontend expected format
    const ageGroups = {
      '0-17': 0,
      '18-29': 0,
      '30-49': 0,
      '50+': 0
    };

    patients.forEach(patient => {
      const age = patient.age;
      if (age < 18) ageGroups['0-17']++;
      else if (age < 30) ageGroups['18-29']++;
      else if (age < 50) ageGroups['30-49']++;
      else ageGroups['50+']++;
    });

    // Get appointment types distribution
    const appointmentTypesData = await Appointment.aggregate([
      { 
        $match: { 
          doctorId: doctor._id,
          status: { $in: ['completed', 'confirmed', 'pending'] }
        } 
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);

    const appointmentTypes = appointmentTypesData.map(item => ({
      type: item._id,
      count: item.count
    }));

    // Get doctor's name
    const user = await User.findById(req.user._id);
    if (!user) {
      throw new Error('User not found');
    }

    res.json({
      totalPatients: totalPatients.length,
      todayPatients: todayAppointments,
      completedAppointments: completedAppointments,
      pendingAppointments: pendingAppointments,
      weeklyPatients: weeklyPatients.length,
      appointmentRate,
      doctorName: user.name,
      weeklyStats: {
        dates: weekDates,
        appointments: weeklyAppointments
      },
      patientDemographics: {
        gender,
        ageGroups
      },
      appointmentTypes
    });
  } catch (error) {
    console.error('Error in getDoctorStats:', error);
    res.status(500).json({ 
      message: 'Error fetching doctor stats',
      error: error.message 
    });
  }
});

// @desc    Get doctor's today appointments
// @route   GET /api/doctors/appointments/today
// @access  Private (Doctor only)
const getTodayAppointments = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  
  // First find the doctor document using the user ID
  const doctor = await Doctor.findOne({ userId });
  if (!doctor) {
    res.status(404);
    throw new Error('Doctor not found');
  }

  // Get today's date in YYYY-MM-DD format
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  console.log('User ID:', userId); // Debug log
  console.log('Doctor ID:', doctor._id); // Debug log
  console.log('Fetching appointments for date:', todayStr); // Debug log

  // Check if there are any appointments in the database for testing
  const allAppointments = await Appointment.find({});
  console.log('Total appointments in database:', allAppointments.length); // Debug log

  const appointments = await Appointment.find({
    doctorId: doctor._id, // Use the actual doctor ID here
    date: todayStr,
    status: { $in: ['pending', 'confirmed', 'completed'] }
  })
    .populate('patientId', 'name email phone')
    .populate('doctorId', 'name email')
    .populate('hospitalId', 'name address')
    .sort({ time: 1 });

  console.log('Found appointments:', appointments.length); // Debug log
  console.log('Raw appointments:', JSON.stringify(appointments, null, 2)); // Debug log

  const formattedAppointments = appointments.map(apt => ({
    _id: apt._id,
    patientName: apt.patientId?.name || 'N/A',
    date: apt.date,
    time: apt.time,
    type: apt.type,
    status: apt.status,
    patientId: {
      _id: apt.patientId?._id,
      name: apt.patientId?.name || 'N/A',
      email: apt.patientId?.email || 'N/A',
      phone: apt.patientId?.phone || 'N/A'
    }
  }));

  console.log('Formatted appointments:', JSON.stringify(formattedAppointments, null, 2)); // Debug log

  res.json(formattedAppointments);
});

// @desc    Get doctor's notifications
// @route   GET /api/doctors/notifications
// @access  Private (Doctor only)
const getDoctorNotifications = asyncHandler(async (req, res) => {
  const doctorId = req.user._id;

  const notifications = await Notification.find({ recipient: doctorId })
    .sort({ createdAt: -1 })
    .limit(10);

  const formattedNotifications = notifications.map(notif => ({
    _id: notif._id,
    message: notif.message,
    time: notif.createdAt.toLocaleTimeString(),
    type: notif.type || 'info',
    read: notif.read || false
  }));

  res.json(formattedNotifications);
});

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id
// @access  Private (Doctor only)
const markNotificationAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);

  if (!notification) {
    res.status(404);
    throw new Error('Notification not found');
  }

  if (notification.recipient.toString() !== req.user._id.toString()) {
    res.status(401);
    throw new Error('Not authorized');
  }

  notification.read = true;
  await notification.save();

  res.json({ message: 'Notification marked as read' });
});

// @desc    Get doctor appointments
// @route   GET /api/doctors/appointments
// @access  Private/Doctor
const getDoctorAppointments = asyncHandler(async (req, res) => {
  const doctorId = req.user._id;
  const { startDate, endDate } = req.query;

  const query = {
    'doctorId.userId': doctorId
  };

  if (startDate && endDate) {
    query.date = {
      $gte: startDate,
      $lte: endDate
    };
  }

  const appointments = await Appointment.find(query)
    .populate('patientId', 'name email phone')
    .populate({
      path: 'doctorId',
      populate: {
        path: 'userId',
        select: 'name email'
      }
    })
    .populate('hospitalId', 'name address')
    .sort({ date: 1, time: 1 });

  const formattedAppointments = appointments.map(apt => ({
    _id: apt._id,
    patientName: apt.patientId?.name || 'N/A',
    date: apt.date,
    time: apt.time,
    type: apt.type,
    status: apt.status,
    patientId: {
      _id: apt.patientId?._id,
      name: apt.patientId?.name || 'N/A',
      email: apt.patientId?.email || 'N/A',
      phone: apt.patientId?.phone || 'N/A'
    }
  }));

  res.json(formattedAppointments);
});

// @desc    Get doctor patients
// @route   GET /api/doctors/patients
// @access  Private/Doctor
const getDoctorPatients = asyncHandler(async (req, res) => {
  const patients = await Patient.find({
    'appointments.doctor': req.user._id
  }).select('-password');
  res.json(patients);
});

// @desc    Get doctor reports
// @route   GET /api/doctors/reports
// @access  Private/Doctor
const getDoctorReports = asyncHandler(async (req, res) => {
  const reports = await Report.find({ doctor: req.user._id })
    .populate('patient', 'name')
    .sort({ date: -1 });
  res.json(reports);
});

// @desc    Get all doctors
// @route   GET /api/doctors
// @access  Public
const getAllDoctors = asyncHandler(async (req, res) => {
  try {
    console.log('Fetching all doctors');
    
    const doctors = await Doctor.find()
      .populate('userId', 'name email status')
      .populate('hospitalId', 'name address');
    
    console.log(`Found ${doctors.length} doctors in total`);
    
    // Format the doctor data for the frontend, handling null cases
    const formattedDoctors = doctors.map(doctor => {
      // Handle missing userId
      if (!doctor.userId) {
        return {
          _id: doctor._id,
          name: 'Unknown Doctor',
          email: 'N/A',
          specialization: doctor.specialization || 'Not specified',
          experience: doctor.experience || 0,
          hospital: doctor.hospitalId?.name || 'Unknown Hospital',
          hospitalId: doctor.hospitalId?._id,
          rating: doctor.rating || 0
        };
      }
      
      return {
        _id: doctor._id,
        name: doctor.userId.name || 'Unknown Doctor',
        email: doctor.userId.email || 'N/A',
        specialization: doctor.specialization || 'Not specified',
        experience: doctor.experience || 0,
        hospital: doctor.hospitalId?.name || 'Unknown Hospital',
        hospitalId: doctor.hospitalId?._id,
        rating: doctor.rating || 0,
        userId: doctor.userId._id
      };
    });
    
    console.log(`Returning ${formattedDoctors.length} formatted doctors`);
    res.json(formattedDoctors);
  } catch (error) {
    console.error('Error fetching all doctors:', error);
    // Return empty array to prevent frontend errors
    res.json([]);
  }
});

// @desc    Get doctors by hospital
// @route   GET /api/doctors/hospital/:hospitalId
// @access  Public
const getDoctorsByHospital = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;
  
  if (!hospitalId) {
    console.log('Hospital ID is missing in request');
    return res.status(400).json({ message: 'Hospital ID is required' });
  }
  
  try {
    console.log(`Fetching doctors for hospital ID: ${hospitalId}`);
    
    // Validate that hospitalId is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(hospitalId)) {
      console.log(`Invalid hospital ID format: ${hospitalId}`);
      return res.json([]);
    }
    
    // First check if the hospital exists
    const Hospital = mongoose.model('Hospital');
    const hospital = await Hospital.findById(hospitalId);
    
    if (!hospital) {
      console.log(`Hospital with ID ${hospitalId} not found`);
      return res.json([]);
    }
    
    console.log(`Found hospital: ${hospital.name}`);
    
    // Get all doctors from this hospital with full doctor details
    const doctors = await Doctor.find({ hospitalId })
      .populate('userId', 'name email')
      .populate('hospitalId', 'name address');
    
    console.log(`Found ${doctors.length} doctors for hospital ID: ${hospitalId}`);
    
    if (!doctors || doctors.length === 0) {
      console.log(`No doctors found for hospital: ${hospitalId}`);
      return res.json([]);
    }
    
    // Format the doctor data for the frontend with all needed fields
    const formattedDoctors = doctors.map(doctor => {
      // Handle case where userId might be null
      if (!doctor.userId) {
        console.log(`Doctor with ID ${doctor._id} has no linked user`);
        return {
          _id: doctor._id,
          name: 'Unknown Doctor',
          email: 'N/A',
          specialization: doctor.specialization || 'Specialist',
          qualification: doctor.qualification || 'N/A',
          experience: doctor.experience || 0,
          hospital: hospital.name || 'N/A',
          hospitalId: hospitalId,
          rating: doctor.rating || 0,
          userId: null
        };
      }
      
      return {
        _id: doctor._id,
        name: doctor.userId.name || 'Unknown Doctor',
        email: doctor.userId.email || 'N/A',
        specialization: doctor.specialization || 'Specialist',
        qualification: doctor.qualification || 'N/A',
        experience: doctor.experience || 0,
        hospital: hospital.name || 'N/A',
        hospitalId: hospitalId,
        rating: doctor.rating || 0,
        userId: doctor.userId._id
      };
    });
    
    console.log(`Returning ${formattedDoctors.length} formatted doctors`);
    res.json(formattedDoctors);
  } catch (error) {
    console.error('Error fetching doctors by hospital:', error);
    // Return empty array instead of error to make frontend resilient
    res.json([]);
  }
});

// @desc    Get doctor's upcoming appointments
// @route   GET /api/doctors/appointments/upcoming
// @access  Private (Doctor only)
const getUpcomingAppointments = asyncHandler(async (req, res) => {
  try {
    // Find the doctor document using the user ID
    const doctor = await Doctor.findOne({ userId: req.user._id });
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Use doctor._id instead of req.user._id
    const appointments = await Appointment.find({
      doctorId: doctor._id,
      date: { $gte: today.toISOString().split('T')[0] },
      status: { $in: ['pending', 'confirmed'] }
    })
      .populate('patientId', 'name email phone')
      .sort({ date: 1, time: 1 })
      .limit(5);

    console.log(`Found ${appointments.length} upcoming appointments for doctor ${doctor._id}`);

    const formattedAppointments = appointments.map(apt => ({
      _id: apt._id,
      patientName: apt.patientId?.name || 'N/A',
      date: apt.date,
      time: apt.time,
      type: apt.type,
      status: apt.status,
      patientId: {
        name: apt.patientId?.name || 'N/A',
        email: apt.patientId?.email || 'N/A',
        phone: apt.patientId?.phone || 'N/A'
      }
    }));

    res.json(formattedAppointments);
  } catch (error) {
    console.error('Error fetching upcoming appointments:', error);
    res.status(500).json({ message: 'Server error while fetching upcoming appointments' });
  }
});

// @desc    Get treatment success rates by disease
// @route   GET /api/doctors/analytics/success-rates
// @access  Private/Doctor
const getTreatmentSuccessRates = asyncHandler(async (req, res) => {
  try {
    const { timeFrame } = req.query;
    
    // Get the doctor's ID using the user ID
    const doctor = await Doctor.findOne({ userId: req.user._id });
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    // Define time frame filters
    let dateFilter = {};
    const today = new Date();
    
    if (timeFrame === '6months') {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(today.getMonth() - 6);
      dateFilter = { createdAt: { $gte: sixMonthsAgo } };
    } else if (timeFrame === '1year') {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(today.getFullYear() - 1);
      dateFilter = { createdAt: { $gte: oneYearAgo } };
    }

    // Get completed appointments with diagnosis info for this doctor
    const completedAppointments = await Appointment.find({
      doctorId: doctor._id,
      status: 'completed',
      diagnosis: { $exists: true, $ne: null },
      disease: { $exists: true, $ne: null },
      ...dateFilter
    }).populate('patientId', 'name');

    // Group appointments by disease and calculate success rates
    const diseaseMap = new Map();
    
    completedAppointments.forEach(appointment => {
      const disease = appointment.disease;
      const isSuccessful = appointment.treatmentOutcome === 'successful';
      
      if (!diseaseMap.has(disease)) {
        diseaseMap.set(disease, {
          disease,
          totalPatients: 0,
          successfulTreatments: 0,
          treatmentDurations: [],
          periodData: new Map() // For tracking trends over time
        });
      }
      
      const diseaseData = diseaseMap.get(disease);
      diseaseData.totalPatients++;
      
      if (isSuccessful) {
        diseaseData.successfulTreatments++;
      }
      
      // Calculate treatment duration if end date exists
      if (appointment.treatmentEndDate && appointment.createdAt) {
        const startDate = new Date(appointment.createdAt);
        const endDate = new Date(appointment.treatmentEndDate);
        const durationDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
        diseaseData.treatmentDurations.push(durationDays);
      }
      
      // Track data by period (month and year) for trends
      const appointmentDate = new Date(appointment.createdAt);
      const period = `${appointmentDate.getFullYear()}-${appointmentDate.getMonth() + 1}`;
      
      if (!diseaseData.periodData.has(period)) {
        diseaseData.periodData.set(period, {
          successful: 0,
          total: 0
        });
      }
      
      const periodData = diseaseData.periodData.get(period);
      periodData.total++;
      if (isSuccessful) {
        periodData.successful++;
      }
    });
    
    // Convert the map to an array and calculate final statistics
    const successRates = Array.from(diseaseMap.values()).map(data => {
      // Calculate success rate
      const successRate = data.totalPatients > 0 
        ? (data.successfulTreatments / data.totalPatients) * 100 
        : 0;
        
      // Calculate average treatment duration
      const averageTreatmentDuration = data.treatmentDurations.length > 0
        ? Math.round(data.treatmentDurations.reduce((sum, duration) => sum + duration, 0) / data.treatmentDurations.length)
        : 0;
        
      // Generate trend data (sorted by chronological order)
      const sortedPeriods = Array.from(data.periodData.keys()).sort();
      const trend = sortedPeriods.map(period => {
        const { successful, total } = data.periodData.get(period);
        const rate = total > 0 ? (successful / total) * 100 : 0;
        return {
          period,
          rate
        };
      });
      
      return {
        _id: new mongoose.Types.ObjectId().toString(), // Generate a unique ID
        disease: data.disease,
        totalPatients: data.totalPatients,
        successfulTreatments: data.successfulTreatments,
        successRate: parseFloat(successRate.toFixed(2)),
        averageTreatmentDuration,
        trend
      };
    });
    
    res.json(successRates);
  } catch (error) {
    console.error('Error fetching treatment success rates:', error);
    res.status(500).json({ message: 'Server error while fetching treatment analytics' });
  }
});

// @desc    Get appointment analytics for a doctor
// @route   GET /api/doctors/analytics/appointments
// @access  Private/Doctor
const getDoctorAppointmentAnalytics = asyncHandler(async (req, res) => {
  try {
    const { timeFrame } = req.query;
    
    // Get the doctor's ID using the user ID
    const doctor = await Doctor.findOne({ userId: req.user._id });
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    // Define time frame filters
    let dateFilter = {};
    const today = new Date();
    
    if (timeFrame === '6months') {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(today.getMonth() - 6);
      dateFilter = { createdAt: { $gte: sixMonthsAgo } };
    } else if (timeFrame === '1year') {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(today.getFullYear() - 1);
      dateFilter = { createdAt: { $gte: oneYearAgo } };
    }

    // Get all appointments for this doctor
    const appointments = await Appointment.find({
      doctorId: doctor._id,
      ...dateFilter
    });

    // Calculate appointment types
    const typeMap = new Map();
    appointments.forEach(appointment => {
      const type = appointment.type || 'Consultation';
      if (!typeMap.has(type)) {
        typeMap.set(type, 0);
      }
      typeMap.set(type, typeMap.get(type) + 1);
    });

    const appointmentTypes = Array.from(typeMap.entries()).map(([type, count]) => ({
      type,
      count
    }));

    // Calculate appointments by month
    const monthMap = new Map();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Initialize all months for the past year
    const pastMonths = [];
    for (let i = 0; i < 12; i++) {
      const monthIndex = (today.getMonth() - i + 12) % 12;
      pastMonths.unshift(months[monthIndex]);
    }
    
    // Only keep last 6 months for better readability
    const displayMonths = pastMonths.slice(-6);
    
    displayMonths.forEach(month => {
      monthMap.set(month, { total: 0, completed: 0, cancelled: 0 });
    });

    // Populate appointments by month
    appointments.forEach(appointment => {
      const date = new Date(appointment.createdAt);
      const month = months[date.getMonth()];
      
      if (monthMap.has(month)) {
        const monthData = monthMap.get(month);
        monthData.total++;
        
        if (appointment.status === 'completed') {
          monthData.completed++;
        } else if (appointment.status === 'cancelled') {
          monthData.cancelled++;
        }
      }
    });

    const appointmentsByMonth = Array.from(monthMap.entries()).map(([month, data]) => ({
      month,
      ...data
    }));

    // Calculate follow-up rate
    const followUps = appointments.filter(apt => apt.type === 'Follow-up').length;
    const followUpRate = appointments.length > 0 ? followUps / appointments.length : 0;

    // Calculate average appointment duration (in minutes)
    const appointmentsWithDuration = appointments.filter(apt => apt.duration);
    const averageAppointmentDuration = appointmentsWithDuration.length > 0
      ? Math.round(appointmentsWithDuration.reduce((sum, apt) => sum + (apt.duration || 0), 0) / appointmentsWithDuration.length)
      : 25; // Default value if no durations available

    res.json({
      appointmentTypes,
      appointmentsByMonth,
      followUpRate,
      averageAppointmentDuration
    });
  } catch (error) {
    console.error('Error fetching appointment analytics:', error);
    res.status(500).json({ message: 'Server error while fetching appointment analytics' });
  }
});

// @desc    Get patient analytics for a doctor
// @route   GET /api/doctors/analytics/patients
// @access  Private/Doctor
const getDoctorPatientAnalytics = asyncHandler(async (req, res) => {
  try {
    const { timeFrame } = req.query;
    
    // Get the doctor's ID using the user ID
    const doctor = await Doctor.findOne({ userId: req.user._id });
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    // Define time frame filters
    let dateFilter = {};
    const today = new Date();
    
    if (timeFrame === '6months') {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(today.getMonth() - 6);
      dateFilter = { createdAt: { $gte: sixMonthsAgo } };
    } else if (timeFrame === '1year') {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(today.getFullYear() - 1);
      dateFilter = { createdAt: { $gte: oneYearAgo } };
    }

    // Get unique patient IDs from appointments
    const patientIds = await Appointment.distinct('patientId', {
      doctorId: doctor._id,
      ...dateFilter
    });

    // Get patient data for these IDs
    const patients = await Patient.find({
      _id: { $in: patientIds }
    });

    // Calculate age groups
    const ageGroups = [
      { range: '0-18', count: 0 },
      { range: '19-35', count: 0 },
      { range: '36-50', count: 0 },
      { range: '51-65', count: 0 },
      { range: '65+', count: 0 }
    ];

    patients.forEach(patient => {
      const age = patient.age || 30; // Default age if missing
      
      if (age <= 18) ageGroups[0].count++;
      else if (age <= 35) ageGroups[1].count++;
      else if (age <= 50) ageGroups[2].count++;
      else if (age <= 65) ageGroups[3].count++;
      else ageGroups[4].count++;
    });

    // Calculate gender distribution
    const genderMap = new Map([
      ['Male', 0],
      ['Female', 0],
      ['Other', 0]
    ]);

    patients.forEach(patient => {
      const gender = patient.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : 'Other';
      if (genderMap.has(gender)) {
        genderMap.set(gender, genderMap.get(gender) + 1);
      } else {
        genderMap.set('Other', genderMap.get('Other') + 1);
      }
    });

    const genderDistribution = Array.from(genderMap.entries()).map(([gender, count]) => ({
      gender,
      count
    }));

    // Calculate new vs returning patients
    // Get appointments for each patient to determine if they are new or returning
    const patientAppointments = await Appointment.aggregate([
      { $match: { doctorId: doctor._id, ...dateFilter } },
      { $group: { _id: '$patientId', count: { $sum: 1 } } }
    ]);

    const newPatients = patientAppointments.filter(p => p.count === 1).length;
    const returningPatients = patientAppointments.filter(p => p.count > 1).length;

    const newVsReturning = [
      { type: 'New', count: newPatients },
      { type: 'Returning', count: returningPatients }
    ];

    // Calculate patient satisfaction
    // This would ideally come from reviews/ratings, for now using a placeholder
    // In a real app, you might get this from a reviews collection
    const patientSatisfaction = 0.87; // 87% satisfaction rate as placeholder

    res.json({
      ageGroups,
      genderDistribution,
      newVsReturning,
      patientSatisfaction
    });
  } catch (error) {
    console.error('Error fetching patient analytics:', error);
    res.status(500).json({ message: 'Server error while fetching patient analytics' });
  }
});

// @desc    Delete doctor
// @route   DELETE /api/doctors/:id
// @access  Private/Admin
const deleteDoctor = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`Attempting to delete doctor with ID: ${id}`);
    
    // Validate the ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.log(`Invalid doctor ID format: ${id}`);
      return res.status(400).json({ message: 'Invalid doctor ID format' });
    }
    
    // Find the doctor first to get the userId
    const doctor = await Doctor.findById(id);
    
    if (!doctor) {
      console.log(`Doctor with ID ${id} not found`);
      return res.status(404).json({ message: 'Doctor not found' });
    }
    
    console.log(`Found doctor to delete: ${JSON.stringify(doctor)}`);
    
    // Check if there are any pending appointments for this doctor
    const pendingAppointments = await Appointment.countDocuments({
      doctorId: id,
      status: { $in: ['pending', 'confirmed'] }
    });
    
    if (pendingAppointments > 0) {
      console.log(`Doctor has ${pendingAppointments} pending appointments`);
      return res.status(400).json({
        message: `Cannot delete doctor with ${pendingAppointments} pending appointments`
      });
    }
    
    // Delete the doctor
    const deletedDoctor = await Doctor.findByIdAndDelete(id);
    
    if (!deletedDoctor) {
      console.log(`Failed to delete doctor with ID ${id}`);
      return res.status(500).json({ message: 'Failed to delete doctor' });
    }
    
    console.log(`Successfully deleted doctor with ID ${id}`);
    
    // Optionally update related user role if needed
    if (doctor.userId) {
      console.log(`Updating user role for userId: ${doctor.userId}`);
      
      try {
        // Only change the role if the user exists and is still a doctor
        const user = await User.findById(doctor.userId);
        
        if (user && user.role === 'doctor') {
          user.role = 'inactive';
          await user.save();
          console.log(`Updated user ${user._id} role to inactive`);
        }
      } catch (userError) {
        console.error(`Error updating user role: ${userError.message}`);
        // Continue with the deletion even if updating the user fails
      }
    }
    
    // Return success message
    res.json({
      success: true,
      message: 'Doctor deleted successfully',
      data: {
        _id: deletedDoctor._id
      }
    });
    
  } catch (error) {
    console.error(`Error deleting doctor: ${error.message}`);
    res.status(500).json({
      message: 'Server error while deleting doctor',
      error: error.message
    });
  }
});

module.exports = { 
  getDoctors, 
  getDoctorById, 
  updateDoctorProfile, 
  getDoctorStats, 
  getTodayAppointments, 
  getDoctorNotifications, 
  markNotificationAsRead,
  getDoctorProfile,
  getDoctorAppointments,
  getDoctorPatients,
  getDoctorReports,
  getDoctorsByHospital,
  getUpcomingAppointments,
  getAllDoctors,
  getTreatmentSuccessRates,
  getDoctorAppointmentAnalytics,
  getDoctorPatientAnalytics,
  deleteDoctor
}; 