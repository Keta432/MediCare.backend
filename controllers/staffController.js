const asyncHandler = require('express-async-handler');
const Task = require('../models/Task');
const Appointment = require('../models/Appointment');
const Notification = require('../models/Notification');
const Inventory = require('../models/Inventory');
const Patient = require('../models/Patient');
const Activity = require('../models/Activity');
const Doctor = require('../models/Doctor');
const Staff = require('../models/Staff');
const Hospital = require('../models/Hospital');
const User = require('../models/User');
const Expense = require('../models/Expense');
const Report = require('../models/Report');
const mongoose = require('mongoose');

// @desc    Get staff tasks
// @route   GET /api/staff/tasks
// @access  Private/Staff
const getTasks = asyncHandler(async (req, res) => {
  const tasks = await Task.find({ assignedTo: req.user._id })
    .sort({ dueDate: 1 })
    .populate('assignedBy', 'name');
  res.json(tasks);
});

// @desc    Get staff appointments
// @route   GET /api/staff/appointments
// @access  Private/Staff
const getAppointments = asyncHandler(async (req, res) => {
  // Check if staff has hospital assigned
  if (!req.user.hospital) {
    // Return empty array if no hospital assigned
    return res.json([]);
  }

  // Only fetch appointments for the staff's hospital
  const appointments = await Appointment.find({ hospitalId: req.user.hospital })
    .sort({ date: 1, time: 1 })
    .populate('patientId', 'name')
    .populate('doctorId', 'name');

  // Log activity
  await createActivityLog({
    hospitalId: req.user.hospital,
    actorId: req.user._id,
    type: 'appointment_viewed',
    description: 'Staff viewed appointments',
    status: 'success'
  });

  res.json(appointments);
});

// @desc    Get staff notifications
// @route   GET /api/staff/notifications
// @access  Private/Staff
const getNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ user: req.user._id })
    .sort({ timestamp: -1 })
    .limit(50);
  res.json(notifications);
});

// @desc    Get inventory items
// @route   GET /api/staff/inventory
// @access  Private/Staff
const getInventory = asyncHandler(async (req, res) => {
  // Check if staff has hospital assigned
  if (!req.user.hospital) {
    // Return empty array if no hospital assigned
    return res.json([]);
  }

  // Only fetch inventory for the staff's hospital
  const inventory = await Inventory.find({ hospitalId: req.user.hospital })
    .sort({ status: 1, name: 1 });
  res.json(inventory);
});

// @desc    Update task status
// @route   PATCH /api/staff/tasks/:taskId/status
// @access  Private/Staff
const updateTaskStatus = asyncHandler(async (req, res) => {
  const { taskId } = req.params;
  const { status } = req.body;

  const task = await Task.findByIdAndUpdate(
    taskId,
    { status },
    { new: true }
  ).populate('assignedBy', 'name');

  if (!task) {
    res.status(404);
    throw new Error('Task not found');
  }

  res.json(task);
});

// @desc    Mark notification as read
// @route   PATCH /api/staff/notifications/:notificationId/read
// @access  Private/Staff
const markNotificationRead = asyncHandler(async (req, res) => {
  const { notificationId } = req.params;

  const notification = await Notification.findByIdAndUpdate(
    notificationId,
    { isRead: true },
    { new: true }
  );

  if (!notification) {
    res.status(404);
    throw new Error('Notification not found');
  }

  res.json(notification);
});

// @desc    Update inventory item
// @route   PATCH /api/staff/inventory/:itemId
// @access  Private/Staff
const updateInventoryItem = asyncHandler(async (req, res) => {
  const { itemId } = req.params;
  const { quantity, status } = req.body;
  
  const item = await Inventory.findByIdAndUpdate(
    itemId,
    {
      quantity,
      status,
      lastUpdated: new Date()
    },
    { new: true }
  );

  if (!item) {
    res.status(404);
    throw new Error('Inventory item not found');
  }
  
  res.json(item);
});

// @desc    Get dashboard stats
// @route   GET /api/staff/dashboard/stats
// @access  Private/Staff
const getDashboardStats = asyncHandler(async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get staff's hospital ID
    const staffHospitalId = req.user.hospital;
    
    if (!staffHospitalId) {
      return res.status(400).json({ 
        message: 'Staff hospital not found' 
      });
    }

    // Get today's appointments for this hospital
    const todayAppointments = await Appointment.countDocuments({
      hospitalId: staffHospitalId,
      date: today.toISOString().split('T')[0],
      status: { $ne: 'cancelled' }
    });

    // Get pending check-ins for this hospital
    const pendingCheckIns = await Appointment.countDocuments({
      hospitalId: staffHospitalId,
      date: today.toISOString().split('T')[0],
      status: 'pending'
    });

    // Get doctors on duty
    const doctorsOnDuty = await Doctor.countDocuments({
      hospitalId: staffHospitalId,
      status: 'active'
    });

    // Get bed occupancy (mock data for now, implement actual logic based on your system)
    const occupiedBeds = 45;
    const totalBeds = 100;

    // Get emergency cases
    const emergencyCases = await Appointment.countDocuments({
      hospitalId: staffHospitalId,
      date: today.toISOString().split('T')[0],
      type: 'emergency',
      status: { $in: ['pending', 'in-progress'] }
    });

    // Calculate average waiting time
    const waitingTimeAgg = await Appointment.aggregate([
      {
        $match: {
          hospitalId: new mongoose.Types.ObjectId(staffHospitalId),
          date: today.toISOString().split('T')[0],
          checkInTime: { $exists: true },
          consultationStartTime: { $exists: true }
        }
      },
      {
        $project: {
          waitingTime: {
            $divide: [
              { $subtract: ['$consultationStartTime', '$checkInTime'] },
              60000 // Convert milliseconds to minutes
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          averageWaitingTime: { $avg: '$waitingTime' }
        }
      }
    ]);

    const averageWaitingTime = waitingTimeAgg.length > 0 
      ? Math.round(waitingTimeAgg[0].averageWaitingTime) 
      : 0;

    // Get total patients
    const totalPatients = await Patient.countDocuments({
      hospitalId: staffHospitalId
    });

    // Get recent activities
    const activities = await Activity.find({
      hospitalId: staffHospitalId,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('patientId', 'name')
    .populate('actorId', 'name role');

    const formattedActivities = activities.map(activity => ({
      _id: activity._id,
      patient: activity.patientId?.name || 'Unknown Patient',
      action: activity.description,
      time: activity.createdAt,
      status: activity.status,
      actor: activity.actorId?.name || 'System',
      actorEmail: activity.actorId?.email || '',
      details: activity.details
    }));

    res.json({
      stats: {
        todayAppointments,
        pendingCheckIns,
        averageWaitingTime,
        totalPatients,
        doctorsOnDuty,
        occupiedBeds,
        totalBeds,
        emergencyCases
      },
      activities: formattedActivities
    });
  } catch (error) {
    console.error('Error in getDashboardStats:', error);
    res.status(500).json({ 
      message: 'Error fetching dashboard stats',
      error: error.message 
    });
  }
});

// @desc    Get today's summary
// @route   GET /api/staff/dashboard/today-summary
// @access  Private/Staff
const getTodaySummary = asyncHandler(async (req, res) => {
  try {
    const { startDate, endDate, hospitalId } = req.query;

    if (!hospitalId) {
      return res.status(400).json({ message: 'Hospital ID is required' });
    }

    // Get completed appointments
    const completedAppointments = await Appointment.countDocuments({
      hospitalId,
      date: {
        $gte: new Date(startDate).toISOString().split('T')[0],
        $lte: new Date(endDate).toISOString().split('T')[0]
      },
      status: 'completed'
    });

    // Get new patients registered today
    const newPatients = await Patient.countDocuments({
      hospitalId,
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    });

    // Get total check-ins
    const totalCheckIns = await Appointment.countDocuments({
      hospitalId,
      date: {
        $gte: new Date(startDate).toISOString().split('T')[0],
        $lte: new Date(endDate).toISOString().split('T')[0]
      },
      checkInTime: { $exists: true }
    });

    // Calculate today's revenue (mock data for now, implement actual logic based on your system)
    const revenue = completedAppointments * 500; // Example: ₹500 per appointment

    res.json({
      completedAppointments,
      newPatients,
      totalCheckIns,
      revenue
    });
  } catch (error) {
    console.error('Error in getTodaySummary:', error);
    res.status(500).json({ 
      message: 'Error fetching today\'s summary',
      error: error.message 
    });
  }
});

// @desc    Get recent activities
// @route   GET /api/staff/dashboard/activities
// @access  Private/Staff
const getDashboardActivities = asyncHandler(async (req, res) => {
  try {
    const staffHospitalId = req.user.hospital;
    const { includeAll, limit, includeMetadata } = req.query;
    
    const query = { hospitalId: staffHospitalId };
    
    if (includeAll !== 'true') {
      query.createdAt = {
        $gte: new Date(new Date().setDate(new Date().getDate() - 1))
      };
    }

    const activityLimit = Math.min(parseInt(limit) || 10, 100);

    const activities = await Activity.find(query)
      .sort({ createdAt: -1 })
      .limit(activityLimit)
      .populate('patientId', 'name')
      .populate('actorId', 'name role')
      .lean();

    const formattedActivities = await Promise.all(activities.map(async activity => {
      const baseActivity = {
        _id: activity._id,
        patient: activity.patientId?.name || 'System',
        action: getActivityDescription(activity),
        time: activity.createdAt,
        status: activity.status || 'success',
        actor: activity.actorName || activity.actorId?.name || 'System',
        actorEmail: activity.actorEmail || activity.actorId?.email || '',
        subject: activity.subject || 'system',
        details: activity.description || activity.details || ''
      };

      if (includeMetadata === 'true' && activity.metadata) {
        baseActivity.metadata = { ...activity.metadata };
        
        // Get additional context based on subject type
        if (activity.subjectId) {
          try {
            switch (activity.subject) {
              case 'appointment': {
                const appointment = await Appointment.findById(activity.subjectId)
                  .select('date time type status')
                  .lean();
                if (appointment) {
                  baseActivity.metadata = {
                    ...baseActivity.metadata,
                    appointmentDate: appointment.date,
                    appointmentTime: appointment.time,
                    appointmentType: appointment.type,
                    appointmentStatus: appointment.status
                  };
                }
                break;
              }
              case 'expense': {
                const expense = await Expense.findById(activity.subjectId)
                  .select('amount category description date')
                  .lean();
                if (expense) {
                  baseActivity.metadata = {
                    ...baseActivity.metadata,
                    amount: expense.amount,
                    category: expense.category,
                    description: expense.description,
                    date: expense.date
                  };
                }
                break;
              }
              case 'report': {
                const report = await Report.findById(activity.subjectId)
                  .select('type diagnosis prescription')
                  .lean();
                if (report) {
                  baseActivity.metadata = {
                    ...baseActivity.metadata,
                    reportType: report.type,
                    diagnosis: report.diagnosis,
                    hasPrescription: !!report.prescription
                  };
                }
                break;
              }
            }
          } catch (error) {
            console.error(`Error fetching metadata for activity ${activity._id}:`, error);
            // Don't fail the entire request, just continue with base metadata
          }
        }
      }

      return baseActivity;
    }));

    res.json(formattedActivities);
  } catch (error) {
    console.error('Error in getDashboardActivities:', error);
    res.status(500).json({ message: 'Server error fetching activities' });
  }
});

const getActivityDescription = (activity) => {
  if (!activity || !activity.action) {
    return 'Activity recorded';
  }
  
  switch (activity.action) {
    case 'appointment_created':
      return 'New appointment scheduled';
    case 'appointment_confirmed':
      return 'Appointment confirmed';
    case 'appointment_cancelled':
      return 'Appointment cancelled';
    case 'appointment_completed':
      return 'Appointment completed';
    case 'appointment_not_appeared':
      return 'Patient did not appear';
    case 'patient_checked_in':
      return 'Patient checked in';
    case 'patient_completed':
      return 'Visit completed';
    case 'patient_registered':
      return 'New patient registered';
    case 'prescription_added':
      return 'Prescription added';
    case 'report_generated':
      return 'Medical report generated';
    case 'report_updated':
      return 'Medical report updated';
    case 'expense_added':
      return 'New expense recorded';
    case 'expense_updated':
      return 'Expense updated';
    case 'expense_deleted':
      return 'Expense deleted';
    case 'update_treatment':
      return 'Treatment updated';
    default:
      return activity.description || 'Activity recorded';
  }
};

// Helper function to get activity description
const getActivityDescriptionLegacy = (activity) => {
  switch (activity.type) {
    case 'appointment_created':
      return 'New appointment scheduled';
    case 'appointment_confirmed':
      return 'Appointment confirmed';
    case 'appointment_cancelled':
      return 'Appointment cancelled';
    case 'patient_checked_in':
      return 'Patient checked in';
    case 'patient_completed':
      return 'Visit completed';
    case 'patient_registered':
      return 'New patient registered';
    case 'prescription_added':
      return 'Prescription added';
    case 'report_generated':
      return 'Medical report generated';
    default:
      return activity.description;
  }
};

// Function to create activity log
const createActivityLog = async (data) => {
  try {
    await Activity.create(data);
  } catch (error) {
    console.error('Error creating activity log:', error);
  }
};

// @desc    Get staff's assigned hospital
// @route   GET /api/staff/hospital
// @access  Private/Staff
const getStaffHospital = asyncHandler(async (req, res) => {
  // Find the staff record for the current user
  const staff = await Staff.findOne({ userId: req.user._id });
  
  if (!staff) {
    res.status(404);
    throw new Error('Staff record not found');
  }

  // Get the hospital details
  const hospital = await Hospital.findById(staff.hospital);
  
  if (!hospital) {
    res.status(404);
    throw new Error('Hospital not found');
  }

  // Return the hospital information
  res.json({ 
    hospital: {
      _id: hospital._id,
      name: hospital.name,
      address: hospital.address
    }
  });
});

// @desc    Get staff profile
// @route   GET /api/staff/profile
// @access  Private/Staff
const getStaffProfile = asyncHandler(async (req, res) => {
  try {
    const staffProfile = await Staff.findOne({ userId: req.user._id })
      .populate('userId', 'name email gender');

    if (!staffProfile) {
      res.status(404);
      throw new Error('Staff profile not found');
    }

    // Do NOT modify and save the staffProfile here - just send it as is
    // The frontend will handle the display mapping

    res.json(staffProfile);
  } catch (error) {
    res.status(500);
    throw new Error(`Error retrieving staff profile: ${error.message}`);
  }
});

// @desc    Update staff profile
// @route   PUT /api/staff/profile
// @access  Private/Staff
const updateStaffProfile = asyncHandler(async (req, res) => {
  try {
    const {
      name,
      email,
      gender,
      department,
      shift,
      emergencyContact,
      address,
      skills
    } = req.body;

    // Find the staff profile
    const staffProfile = await Staff.findOne({ userId: req.user._id });

    if (!staffProfile) {
      res.status(404);
      throw new Error('Staff profile not found');
    }

    // Get the staff model schema to check enum values
    const Staff = mongoose.model('Staff');
    const staffSchema = Staff.schema;
    
    // Get valid enum values for department and shift
    const validDepartments = staffSchema.path('department').enumValues;
    const validShifts = staffSchema.path('shift').enumValues;

    // Update user details if provided
    if (name || email || gender) {
      await User.findByIdAndUpdate(req.user._id, {
        ...(name && { name }),
        ...(email && { email }),
        ...(gender && { gender })
      });
    }

    // Update staff profile with validation
    if (department) {
      // Check if department is valid
      if (!validDepartments.includes(department)) {
        console.warn(`Invalid department value: ${department}. Valid values: ${validDepartments.join(', ')}`);
      } else {
        staffProfile.department = department;
      }
    }
    
    if (shift) {
      // Check if shift is valid
      if (!validShifts.includes(shift)) {
        console.warn(`Invalid shift value: ${shift}. Valid values: ${validShifts.join(', ')}`);
      } else {
        staffProfile.shift = shift;
      }
    }
    
    // Update emergency contact
    if (emergencyContact) {
      staffProfile.emergencyContact = {
        name: emergencyContact.name || staffProfile.emergencyContact?.name || 'N/A',
        relationship: emergencyContact.relationship || staffProfile.emergencyContact?.relationship || 'N/A',
        phone: emergencyContact.phone || staffProfile.emergencyContact?.phone || 'N/A'
      };
    }

    // Update address
    if (address) {
      staffProfile.address = {
        street: address.street || staffProfile.address?.street || 'N/A',
        city: address.city || staffProfile.address?.city || 'N/A',
        state: address.state || staffProfile.address?.state || 'N/A',
        postalCode: address.postalCode || staffProfile.address?.postalCode || 'N/A',
        country: address.country || staffProfile.address?.country || 'N/A'
      };
    }

    // Update skills
    if (skills && Array.isArray(skills)) {
      staffProfile.skills = skills;
    }

    await staffProfile.save();

    // Return updated profile with populated user data
    const updatedProfile = await Staff.findOne({ userId: req.user._id })
      .populate('userId', 'name email gender');

    res.json(updatedProfile);
  } catch (error) {
    res.status(500);
    throw new Error(`Error updating staff profile: ${error.message}`);
  }
});

// @desc    Get treatment success rates by disease for the staff's hospital
// @route   GET /api/staff/analytics/success-rates
// @access  Private/Staff
const getStaffAnalytics = asyncHandler(async (req, res) => {
  try {
    const { timeFrame } = req.query;
    console.log('Staff analytics requested with timeFrame:', timeFrame);
    
    // Get the staff's hospital
    const staff = await User.findById(req.user._id);
    if (!staff || !staff.hospital) {
      console.log('Staff or hospital not found for user ID:', req.user._id);
      return res.status(404).json({ message: 'Staff or hospital not found' });
    }

    const hospitalId = staff.hospital;
    console.log('Staff hospital ID:', hospitalId);

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
    console.log('Date filter:', dateFilter);

    // Get all doctors from this hospital
    const hospitalDoctors = await Doctor.find({ hospitalId: hospitalId });
    console.log('Found hospital doctors:', hospitalDoctors.length);
    if (!hospitalDoctors.length) {
      console.log('No doctors found for hospital ID:', hospitalId);
      return res.json([]);
    }

    const doctorIds = hospitalDoctors.map(doc => doc._id);
    console.log('Doctor IDs:', doctorIds);

    // Get completed appointments with diagnosis info for all doctors in this hospital
    const completedAppointments = await Appointment.find({
      doctorId: { $in: doctorIds },
      status: 'completed',
      diagnosis: { $exists: true, $ne: null },
      disease: { $exists: true, $ne: null },
      ...dateFilter
    }).populate('patientId', 'name');
    
    console.log('Found completed appointments:', completedAppointments.length);
    if (completedAppointments.length === 0) {
      console.log('No completed appointments found with diagnosis and disease information');
      
      // For testing purposes: return dummy data if no real data found
      if (process.env.NODE_ENV !== 'production') {
        console.log('Returning dummy analytics data for testing');
        const dummyData = [
          {
            _id: new mongoose.Types.ObjectId().toString(),
            disease: 'Hypertension',
            totalPatients: 15,
            successfulTreatments: 12,
            successRate: 80.0,
            averageTreatmentDuration: 14,
            trend: [
              { period: '2023-1', rate: 75 },
              { period: '2023-2', rate: 80 }
            ],
            recentPatients: [
              { name: 'Test Patient 1' },
              { name: 'Test Patient 2' }
            ]
          },
          {
            _id: new mongoose.Types.ObjectId().toString(),
            disease: 'Diabetes',
            totalPatients: 10,
            successfulTreatments: 7,
            successRate: 70.0,
            averageTreatmentDuration: 30,
            trend: [
              { period: '2023-1', rate: 65 },
              { period: '2023-2', rate: 70 }
            ],
            recentPatients: [
              { name: 'Test Patient 3' }
            ]
          },
          {
            _id: new mongoose.Types.ObjectId().toString(),
            disease: 'Common Cold',
            totalPatients: 25,
            successfulTreatments: 25,
            successRate: 100.0,
            averageTreatmentDuration: 5,
            trend: [
              { period: '2023-1', rate: 98 },
              { period: '2023-2', rate: 100 }
            ],
            recentPatients: [
              { name: 'Test Patient 4' },
              { name: 'Test Patient 5' },
              { name: 'Test Patient 6' }
            ]
          }
        ];
        return res.json(dummyData);
      }
      
      return res.json([]);
    }

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
          periodData: new Map(), // For tracking trends over time
          recentPatients: []
        });
      }
      
      const diseaseData = diseaseMap.get(disease);
      diseaseData.totalPatients++;
      
      if (isSuccessful) {
        diseaseData.successfulTreatments++;
      }
      
      // Add patient to recent patients list if available
      if (appointment.patientId && appointment.patientId.name) {
        // Only keep up to 3 recent patients to avoid the list getting too large
        if (diseaseData.recentPatients.length < 3) {
          diseaseData.recentPatients.push({
            name: appointment.patientId.name
          });
        }
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
        trend,
        recentPatients: data.recentPatients
      };
    });
    
    res.json(successRates);
  } catch (error) {
    console.error('Error fetching treatment success rates:', error);
    res.status(500).json({ message: 'Server error while fetching treatment analytics' });
  }
});

// @desc    Get staff statistics
// @route   GET /api/staff/stats
// @access  Private/Staff
const getStaffStats = asyncHandler(async (req, res) => {
  try {
    // Get the staff's hospital
    const staff = await Staff.findOne({ userId: req.user._id });
    
    if (!staff) {
      return res.status(404).json({ message: 'Staff not found' });
    }
    
    const hospitalId = staff.hospital;
    
    // Get today's date for filtering
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    // Get basic statistics
    const totalAppointments = await Appointment.countDocuments({
      hospitalId: hospitalId
    });
    
    const completedAppointments = await Appointment.countDocuments({
      hospitalId: hospitalId,
      status: 'completed'
    });
    
    const pendingAppointments = await Appointment.countDocuments({
      hospitalId: hospitalId,
      status: 'pending'
    });
    
    const todayAppointments = await Appointment.countDocuments({
      hospitalId: hospitalId,
      date: todayStr
    });
    
    const totalPatients = await Patient.countDocuments({
      hospital: hospitalId
    });
    
    const totalDoctors = await Doctor.countDocuments({
      hospitalId: hospitalId
    });
    
    const recentActivities = await Activity.find({
      hospitalId: hospitalId,
      actorId: req.user._id
    })
    .sort({ createdAt: -1 })
    .limit(10);
    
    res.json({
      totalAppointments,
      completedAppointments,
      pendingAppointments,
      todayAppointments,
      totalPatients,
      totalDoctors,
      recentActivities
    });
  } catch (error) {
    console.error('Error fetching staff statistics:', error);
    res.status(500);
    throw new Error('Error fetching staff statistics');
  }
});

// @desc    Get staff notifications
// @route   GET /api/staff/notifications
// @access  Private/Staff
const getStaffNotifications = asyncHandler(async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipient: req.user._id
    })
    .sort({ createdAt: -1 })
    .limit(20);
    
    res.json(notifications);
  } catch (error) {
    res.status(500);
    throw new Error('Error fetching staff notifications');
  }
});

// @desc    Mark notification as read
// @route   PUT /api/staff/notifications/:id/read
// @access  Private/Staff
const markNotificationAsRead = asyncHandler(async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    if (notification.recipient.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to access this notification' });
    }
    
    notification.read = true;
    await notification.save();
    
    res.json(notification);
  } catch (error) {
    res.status(500);
    throw new Error('Error marking notification as read');
  }
});

// @desc    Get patient demographics data for analytics
// @route   GET /api/staff/analytics/patient-demographics
// @access  Private/Staff
const getPatientDemographics = asyncHandler(async (req, res) => {
  try {
    const staff = await User.findById(req.user._id);
    if (!staff || !staff.hospital) {
      return res.status(404).json({ message: 'Staff or hospital not found' });
    }

    const hospitalId = staff.hospital;

    // Get all patients from this hospital
    const patients = await Patient.find({ hospital: hospitalId });
    
    if (patients.length === 0) {
      return res.status(404).json({ message: 'No patients found for this hospital' });
    }

    // Calculate gender distribution
    const genderDistribution = [
      { gender: 'Male', count: 0 },
      { gender: 'Female', count: 0 },
      { gender: 'Other', count: 0 }
    ];

    // Calculate age groups
    const ageGroups = [
      { range: '0-18', count: 0 },
      { range: '19-35', count: 0 },
      { range: '36-50', count: 0 },
      { range: '51-65', count: 0 },
      { range: '65+', count: 0 }
    ];

    // Calculate patient status distribution
    const patientStatus = [
      { status: 'Active', count: 0 },
      { status: 'Inactive', count: 0 }
    ];

    // Calculate treatment days
    let totalTreatmentDays = 0;
    let patientsWithTreatmentDays = 0;
    let activePatientDays = 0;
    let countActivePatients = 0;

    // Process each patient
    patients.forEach(patient => {
      // Gender distribution
      if (patient.gender === 'male') {
        genderDistribution[0].count++;
      } else if (patient.gender === 'female') {
        genderDistribution[1].count++;
      } else {
        genderDistribution[2].count++;
      }

      // Age groups
      if (patient.age) {
        if (patient.age <= 18) {
          ageGroups[0].count++;
        } else if (patient.age <= 35) {
          ageGroups[1].count++;
        } else if (patient.age <= 50) {
          ageGroups[2].count++;
        } else if (patient.age <= 65) {
          ageGroups[3].count++;
        } else {
          ageGroups[4].count++;
        }
      }

      // Patient status
      if (patient.status === 'active') {
        patientStatus[0].count++;
        countActivePatients++;
      } else if (patient.status === 'inactive') {
        patientStatus[1].count++;
      }

      // Treatment days
      if (patient.treatmentDays && patient.treatmentDays > 0) {
        totalTreatmentDays += patient.treatmentDays;
        patientsWithTreatmentDays++;
      }

      // For active patients, also add their current active treatment days
      if (patient.status === 'active' && patient.lastStatusChangeDate) {
        const currentDate = new Date();
        const lastChangeDate = new Date(patient.lastStatusChangeDate);
        const currentActiveDays = Math.floor((currentDate - lastChangeDate) / (1000 * 60 * 60 * 24));
        if (currentActiveDays > 0) {
          totalTreatmentDays += currentActiveDays;
          activePatientDays += currentActiveDays;
        }
      }
    });

    // Calculate average treatment days
    const averageTreatmentDays = patientsWithTreatmentDays > 0 
      ? Math.round((totalTreatmentDays / patientsWithTreatmentDays) * 10) / 10 
      : 0;

    // Get top diagnoses - count occurrences of each disease in completed appointments
    const diagnosesCounts = {};
    const appointments = await Appointment.find({
      hospitalId: hospitalId,
      status: 'completed',
      disease: { $exists: true, $ne: null }
    });

    appointments.forEach(appointment => {
      if (appointment.disease) {
        diagnosesCounts[appointment.disease] = (diagnosesCounts[appointment.disease] || 0) + 1;
      }
    });

    // Convert to array and sort by count
    const topDiagnoses = Object.entries(diagnosesCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Get admission trends by month for the last 6 months
    const admissionTrend = [];
    const today = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const month = new Date(today);
      month.setMonth(today.getMonth() - i);
      
      const monthName = month.toLocaleString('default', { month: 'short' });
      const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
      const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);
      
      const count = await Appointment.countDocuments({
        hospitalId: hospitalId,
        createdAt: {
          $gte: startOfMonth,
          $lte: endOfMonth
        }
      });
      
      admissionTrend.push({ month: monthName, count });
    }

    // Return the demographics data
    res.json({
      ageGroups,
      genderDistribution,
      topDiagnoses,
      admissionTrend,
      patientStatus,
      averageTreatmentDays,
      totalTreatmentDays,
      activePatientDays,
      countActivePatients
    });
  } catch (error) {
    console.error('Error fetching patient demographics:', error);
    res.status(500).json({ message: 'Server error while fetching patient demographics' });
  }
});

// @desc    Get inventory analytics data
// @route   GET /api/staff/analytics/inventory
// @access  Private/Staff
const getInventoryAnalytics = asyncHandler(async (req, res) => {
  try {
    const staff = await User.findById(req.user._id);
    if (!staff || !staff.hospital) {
      return res.status(404).json({ message: 'Staff or hospital not found' });
    }

    const hospitalId = staff.hospital;

    // Get all inventory items for this hospital
    const inventoryItems = await Inventory.find({ hospitalId: hospitalId });
    
    if (inventoryItems.length === 0) {
      return res.status(404).json({ message: 'No inventory items found for this hospital' });
    }

    // Calculate inventory status counts
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;
    
    // Track categories
    const categoryCounts = {};
    
    inventoryItems.forEach(item => {
      // Update counts based on status
      if (item.status === 'in-stock') {
        inStock++;
      } else if (item.status === 'low-stock') {
        lowStock++;
      } else if (item.status === 'out-of-stock') {
        outOfStock++;
      }
      
      // Update category counts
      if (item.category) {
        categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
      }
    });
    
    // Convert categories to array format
    const categories = Object.entries(categoryCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      inStock,
      lowStock,
      outOfStock,
      totalItems: inventoryItems.length,
      categories
    });
  } catch (error) {
    console.error('Error fetching inventory analytics:', error);
    res.status(500).json({ message: 'Server error while fetching inventory analytics' });
  }
});

module.exports = {
  getTasks,
  getAppointments,
  getNotifications,
  getInventory,
  updateTaskStatus,
  markNotificationRead,
  updateInventoryItem,
  getDashboardStats,
  getDashboardActivities,
  getTodaySummary,
  getStaffHospital,
  getStaffProfile,
  updateStaffProfile,
  getStaffStats,
  getStaffNotifications,
  markNotificationAsRead,
  getStaffAnalytics,
  getPatientDemographics,
  getInventoryAnalytics
};