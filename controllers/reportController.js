const asyncHandler = require('express-async-handler');
const Report = require('../models/Report');
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const Hospital = require('../models/Hospital');
const Doctor = require('../models/Doctor');
const User = require('../models/User');
const Activity = require('../models/Activity');
const ActivityService = require('../utils/activityService');
const { generateMedicalReportPdf } = require('../utils/pdfGenerator');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const { 
  isValidObjectId,
  validateRequired,
  validateReportType,
  validateReportStatus,
  validateDate,
  validateReportNumber
} = require('../utils/validation');
const { generateImageUrl } = require('../utils/imageUrl');
const { ensureUploadsDir, deleteFileSafely } = require('../utils/fileHelper');
const { generateSimplePdf } = require('../utils/pdfGenerator');

// @desc    Create a new medical report
// @route   POST /api/reports
// @access  Private (Doctor only)
const createReport = asyncHandler(async (req, res) => {
  try {
    const {
      appointmentId,
      patientId,
      doctorId,
      hospitalId,
      diagnosis,
      prescription,
      notes,
      followUpDate,
      type,
      status,
      reportNumber,
      conditionImages
    } = req.body;

    // Validate required fields
    if (!appointmentId || !patientId || !doctorId || !hospitalId || !type || !reportNumber) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Validate ObjectIds
    if (!isValidObjectId(appointmentId) || !isValidObjectId(patientId) || 
        !isValidObjectId(doctorId) || !isValidObjectId(hospitalId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ID format'
      });
    }

    // Check if report number already exists
    const existingReport = await Report.findOne({ reportNumber });
    if (existingReport) {
      return res.status(400).json({
        success: false,
        message: 'Report number already exists'
      });
    }

    // Validate type-specific required fields
    if (type === 'diagnosis' && !diagnosis) {
      return res.status(400).json({
        success: false,
        message: 'Diagnosis is required for diagnosis reports'
      });
    }

    if (type === 'prescription' && !prescription) {
      return res.status(400).json({
        success: false,
        message: 'Prescription is required for prescription reports'
      });
    }

    // Create new report
    const report = new Report({
      appointmentId,
      patientId,
      doctorId,
      hospitalId,
      diagnosis,
      prescription,
      notes,
      followUpDate,
      type,
      status: status || 'completed',
      reportNumber,
      conditionImages: conditionImages || [],
      createdAt: new Date()
    });

    const savedReport = await report.save();

    // Update appointment status if report is created
    await Appointment.findByIdAndUpdate(appointmentId, {
      status: 'completed'
    });

    // Get more detailed information about the user who generated the report
    const staffUser = await User.findById(req.user._id).select('name email role');

    // Create follow-up appointment if followUpDate is specified
    let followUpAppointment = null;
    if (followUpDate) {
      try {
        // Get the original appointment to copy relevant details
        const originalAppointment = await Appointment.findById(appointmentId);
        
        // Create follow-up appointment
        followUpAppointment = await Appointment.create({
          doctorId,
          patientId,
          hospitalId,
          date: followUpDate,
          time: "00:00", // Default placeholder time that will be set later
          type: 'followup',
          notes: `Follow-up for report #${reportNumber}. ${notes || ''}`,
          status: 'pending',
          isFollowUp: true,
          originalAppointmentId: appointmentId,
          relatedReportId: savedReport._id,
          needsTimeSlot: true
        });

        // Update the report with the follow-up appointment ID
        savedReport.followUpAppointmentId = followUpAppointment._id;
        await savedReport.save();

        // Log follow-up creation activity
        try {
          // Use staffUser from the outer scope if available
          await ActivityService.logActivity({
            user: req.user._id,
            hospitalId,
            actorId: req.user._id,
            actorName: staffUser ? staffUser.name : (req.user.name || 'Unknown'),
            actorEmail: staffUser ? staffUser.email : (req.user.email || 'Unknown'),
            actorRole: staffUser ? staffUser.role : (req.user.role || 'staff'),
            patientId,
            action: 'followup_scheduled',
            subject: 'appointment',
            subjectId: followUpAppointment._id,
            description: `Follow-up appointment scheduled for ${followUpDate} by ${staffUser ? staffUser.name : (req.user.name || 'Unknown Staff')}`,
            metadata: {
              reportId: savedReport._id,
              originalAppointmentId: appointmentId,
              followUpDate,
              staffId: req.user._id,
              staffName: staffUser ? staffUser.name : (req.user.name || 'Unknown'),
              staffEmail: staffUser ? staffUser.email : (req.user.email || 'Unknown'),
              generatedAt: new Date().toISOString()
            }
          });
        } catch (activityError) {
          console.error('Error logging follow-up activity:', activityError);
        }
      } catch (followUpError) {
        console.error('Error creating follow-up appointment:', followUpError);
        // Don't fail the report creation if follow-up appointment creation fails
      }
    }

    // Log activity
    try {
      await Activity.create({
        hospitalId,
        patientId,
        actorId: req.user._id,
        actorName: staffUser ? staffUser.name : (req.user.name || 'Unknown'),
        actorEmail: staffUser ? staffUser.email : (req.user.email || 'Unknown'),
        actorRole: staffUser ? staffUser.role : (req.user.role || 'staff'),
        type: 'report_generated',
        description: `${type.charAt(0).toUpperCase() + type.slice(1)} report generated by ${staffUser ? staffUser.name : (req.user.name || 'Unknown Staff')}`,
        status: 'success',
        details: `Report #${reportNumber}`
      });

      // Log activity for report creation with enhanced user details
      await ActivityService.logActivity({
        user: req.user._id,
        hospitalId: hospitalId,
        actorId: req.user._id,
        actorName: staffUser ? staffUser.name : (req.user.name || 'Unknown'),
        actorEmail: staffUser ? staffUser.email : (req.user.email || 'Unknown'),
        actorRole: staffUser ? staffUser.role : (req.user.role || 'staff'),
        patientId: patientId,
        action: 'report_generated',
        subject: 'report',
        subjectId: savedReport._id,
        description: `Report generated by ${staffUser ? staffUser.name : (req.user.name || 'Unknown Staff')}`,
        metadata: {
          reportType: savedReport.type,
          diagnosis: savedReport.diagnosis,
          patientId: savedReport.patientId,
          doctorId: savedReport.doctorId,
          staffId: req.user._id,
          staffName: staffUser ? staffUser.name : (req.user.name || 'Unknown'),
          staffEmail: staffUser ? staffUser.email : (req.user.email || 'Unknown'),
          staffRole: staffUser ? staffUser.role : (req.user.role || 'staff'),
          generatedAt: new Date().toISOString(),
          followUpScheduled: !!followUpAppointment
        }
      });
    } catch (activityError) {
      console.error('Error logging activity:', activityError);
      // Don't fail the report creation if activity logging fails
    }

    res.status(201).json({
      success: true,
      data: report,
      followUpAppointment: followUpAppointment
    });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating report',
      error: error.message
    });
  }
});

// @desc    Get reports for a patient
// @route   GET /api/reports/patient/:patientId
// @access  Private
const getPatientReports = asyncHandler(async (req, res) => {
  try {
    const { patientId } = req.params;
    const { type, status, startDate, endDate } = req.query;

    if (!isValidObjectId(patientId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid patient ID'
      });
    }

    const query = { patientId };
    
    // Hospital access control - non-admin users can only access their hospital reports
    if (req.user.role !== 'admin') {
      const userHospital = req.user.hospital;
      
      if (!userHospital) {
        return res.status(403).json({
          success: false,
          message: 'No hospital association found for the user'
        });
      }
      
      // Add hospital filter to query
      query.hospitalId = userHospital;
    }

    // Add filters if provided
    if (type) query.type = type;
    if (status) query.status = status;
    
    // Add date range filter if provided
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const reports = await Report.find(query)
      .populate('doctorId')
      .populate('hospitalId', 'name address')
      .populate('appointmentId')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reports.length,
      data: reports
    });
  } catch (error) {
    console.error('Error fetching patient reports:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching patient reports',
      error: error.message
    });
  }
});

// @desc    Get reports by a doctor
// @route   GET /api/reports/doctor/:doctorId
// @access  Private
const getDoctorReports = asyncHandler(async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { type, status, startDate, endDate } = req.query;

    if (!isValidObjectId(doctorId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid doctor ID'
      });
    }

    const query = { doctorId };
    
    // Hospital access control - non-admin users can only access their hospital reports
    if (req.user.role !== 'admin') {
      const userHospital = req.user.hospital;
      
      if (!userHospital) {
        return res.status(403).json({
          success: false,
          message: 'No hospital association found for the user'
        });
      }
      
      // Add hospital filter to query
      query.hospitalId = userHospital;
    }

    // Add filters if provided
    if (type) query.type = type;
    if (status) query.status = status;
    
    // Add date range filter if provided
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const reports = await Report.find(query)
      .populate('patientId', 'name email phone')
      .populate('hospitalId', 'name address')
      .populate('appointmentId')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reports.length,
      data: reports
    });
  } catch (error) {
    console.error('Error fetching doctor reports:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching doctor reports',
      error: error.message
    });
  }
});

// @desc    Get report by ID
// @route   GET /api/reports/:id
// @access  Private
const getReportById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report ID'
      });
    }

    const report = await Report.findById(id)
      .populate('patientId', 'name email phone')
      .populate('doctorId')
      .populate('hospitalId', 'name address')
      .populate('appointmentId');

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Hospital access control - users can only access reports from their hospital
    if (req.user.role !== 'admin') {
      const userHospital = req.user.hospital;
      
      // Validate that user has a hospital assigned
      if (!userHospital) {
        return res.status(403).json({
          success: false,
          message: 'No hospital association found for the user'
        });
      }

      // Check if report belongs to user's hospital
      if (report.hospitalId && report.hospitalId._id.toString() !== userHospital.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access this report'
        });
      }
    }

    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching report',
      error: error.message
    });
  }
});

// @desc    Generate PDF from report
// @route   GET /api/reports/:id/pdf
// @access  Private
const generateReportPdf = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report ID'
      });
    }

    // Import required modules
    const { generateSimplePdf } = require('../utils/pdfGenerator');
    const { ensureUploadsDir } = require('../utils/fileHelper');

    const report = await Report.findById(id)
      .populate('patientId', 'name age gender blood phone email address')
      .populate({
        path: 'doctorId',
        populate: {
          path: 'userId',
          select: 'name email'
        }
      })
      .populate('hospitalId', 'name address logo phone email')
      .populate('appointmentId');

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }
    
    // Hospital access control - users can only access reports from their hospital
    if (req.user.role !== 'admin') {
      const userHospital = req.user.hospital;
      
      // Validate that user has a hospital assigned
      if (!userHospital) {
        return res.status(403).json({
          success: false,
          message: 'No hospital association found for the user'
        });
      }

      // Check if report belongs to user's hospital
      if (report.hospitalId && report.hospitalId._id.toString() !== userHospital.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access this report'
        });
      }
    }

    // Format report data for the PDF generator
    const reportData = {
      _id: report._id.toString(),
      reportNumber: report.reportNumber || `Report-${Date.now()}`,
      date: report.createdAt,
      diagnosis: report.diagnosis || 'No diagnosis provided',
      prescription: report.prescription || 'No prescription provided',
      notes: report.notes || '',
      followUpDate: report.followUpDate,
      type: report.type || 'Medical',
      images: report.conditionImages || [],
      
      // Include related data
      patient: report.patientId ? {
        name: report.patientId.name || 'Unknown Patient',
        _id: report.patientId._id.toString(),
        gender: report.patientId.gender || 'Not specified',
        age: report.patientId.age || 'Not specified',
        blood: report.patientId.blood || 'Not specified'
      } : null,
      
      doctor: report.doctorId ? {
        name: report.doctorId.userId?.name || 'Unknown Doctor',
        specialization: report.doctorId.specialization || 'Not specified'
      } : null,
      
      hospital: report.hospitalId ? {
        name: report.hospitalId.name || 'Hospital',
        address: report.hospitalId.address || 'Not specified',
        contact: report.hospitalId.phone || 'Not specified'
      } : null,
      
      appointment: report.appointmentId ? {
        date: moment(report.appointmentId.date).format('MMMM Do YYYY'),
        time: report.appointmentId.time || 'Not specified',
        type: report.appointmentId.type || 'Not specified'
      } : null
    };
    
    console.log('Preparing to generate PDF for report:', report._id.toString());
    
    // Set uploads directory and file path
    const uploadsDir = ensureUploadsDir();
    const filename = `report_${report._id}_${Date.now()}.pdf`;
    const pdfPath = path.join(uploadsDir, filename);
    
    console.log('Generating PDF at path:', pdfPath);
    
    // Generate the PDF
    const generatedPdfPath = await generateSimplePdf(reportData, pdfPath);
    
    // Log the activity AFTER successful PDF generation
    try {
      await ActivityService.logActivity({
        user: req.user._id,
        hospitalId: report.hospitalId?._id,
        actorId: req.user._id,
        actorName: req.user.name,
        actorRole: req.user.role,
        patientId: report.patientId?._id,
        action: 'download',
        subject: 'report',
        subjectId: report._id,
        description: `Report #${report.reportNumber} downloaded`,
        details: `${req.user.name} downloaded the report for patient ${report.patientId?.name || 'Unknown'}`
      });
    } catch (logError) {
      console.error('Error logging activity:', logError);
      // Don't fail the process if logging fails
    }
    
    // CRITICAL: Set content type and attachment headers BEFORE sending any data
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report_${report._id}.pdf"`);
    
    // Check if file exists before trying to stream it
    if (!fs.existsSync(generatedPdfPath)) {
      throw new Error(`Generated PDF file not found at ${generatedPdfPath}`);
    }
    
    // Get file stats to verify it's not empty
    const stats = fs.statSync(generatedPdfPath);
    if (stats.size === 0) {
      throw new Error('Generated PDF file is empty');
    }
    
    console.log(`Streaming PDF file (${stats.size} bytes) to client`);
    
    // Stream the file and handle errors properly
    const fileStream = fs.createReadStream(generatedPdfPath);
    
    // Handle stream errors
    fileStream.on('error', (err) => {
      console.error('Error streaming PDF file:', err);
      
      // Only send error response if headers haven't been sent
      if (!res.headersSent) {
        // Reset content type to JSON for error response
        res.setHeader('Content-Type', 'application/json');
        res.status(500).json({
          success: false,
          message: 'Error streaming PDF file',
          error: err.message
        });
      }
    });
    
    // Cleanup when done
    fileStream.on('close', () => {
      // Delete file after streaming
      try {
        fs.unlinkSync(generatedPdfPath);
        console.log('Temporary PDF file deleted after streaming');
      } catch (err) {
        console.error('Error deleting temporary PDF file:', err);
      }
    });
    
    // Pipe the file to the response
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Error generating report PDF:', error);
    
    // Only send error response if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Error generating PDF report',
        error: error.message
      });
    }
  }
});

// @desc    Get all reports (for staff)
// @route   GET /api/reports/staff/:hospitalId
// @access  Private (Staff only)
const getStaffReports = asyncHandler(async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    if (!isValidObjectId(hospitalId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid hospital ID'
      });
    }
    
    // Hospital access control - staff can only access their own hospital's reports
    if (req.user.role !== 'admin') {
      const userHospital = req.user.hospital;
      
      if (!userHospital) {
        return res.status(403).json({
          success: false,
          message: 'No hospital association found for the user'
        });
      }
      
      // Verify the requested hospital matches the user's hospital
      if (userHospital.toString() !== hospitalId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access reports from this hospital'
        });
      }
    }
    
    const reports = await Report.find({ hospitalId })
      .populate('patientId', 'name')
      .populate('doctorId', 'userId specialization')
      .populate({
        path: 'doctorId',
        populate: {
          path: 'userId',
          select: 'name'
        }
      })
      .sort({ createdAt: -1 });

    const formattedReports = reports.map(report => ({
      _id: report._id,
      patientName: report.patientId?.name || 'Unknown Patient',
      patientId: report.patientId?._id,
      doctorName: report.doctorId?.userId?.name || 'Unknown Doctor',
      doctorId: report.doctorId?._id,
      diagnosis: report.diagnosis,
      createdAt: report.createdAt,
      followUpDate: report.followUpDate,
      type: report.type || 'medical',
      reportNumber: report.reportNumber
    }));

    res.status(200).json({
      success: true,
      count: formattedReports.length,
      data: formattedReports
    });
  } catch (error) {
    console.error('Error fetching staff reports:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching staff reports',
      error: error.message
    });
  }
});

// @desc    Get hospital statistics for reports
// @route   GET /api/reports/stats/hospital
// @access  Private (Staff, Doctor, Admin)
const getHospitalStats = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const hospital = req.user.hospital;

  if (!hospital) {
    return res.status(400).json({ message: 'No hospital assigned to user' });
  }

  console.log('Getting hospital stats:', {
    hospital,
    startDate,
    endDate,
    user: req.user._id
  });

  // Parse dates
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Previous period for comparison
  const periodLength = end.getTime() - start.getTime();
  const previousStart = new Date(start.getTime() - periodLength);
  const previousEnd = new Date(start);
  
  console.log('Date ranges:', {
    current: { start, end },
    previous: { previousStart, previousEnd }
  });

  try {
    // Get total appointments for current period
    const totalAppointments = await Appointment.countDocuments({
      hospitalId: hospital,
      date: { $gte: start, $lte: end }
    });
    
    // Get total appointments for previous period
    const previousTotalAppointments = await Appointment.countDocuments({
      hospitalId: hospital,
      date: { $gte: previousStart, $lte: previousEnd }
    });
    
    // Calculate appointment change percentage
    const appointmentChange = previousTotalAppointments > 0 
      ? Math.round(((totalAppointments - previousTotalAppointments) / previousTotalAppointments) * 100) 
      : 100;
    
    // Get new patients for current period
    const newPatients = await Patient.countDocuments({
      hospital: hospital,
      createdAt: { $gte: start, $lte: end }
    });
    
    // Get new patients for previous period
    const previousNewPatients = await Patient.countDocuments({
      hospital: hospital,
      createdAt: { $gte: previousStart, $lte: previousEnd }
    });
    
    // Calculate new patients change percentage
    const patientChange = previousNewPatients > 0 
      ? Math.round(((newPatients - previousNewPatients) / previousNewPatients) * 100) 
      : 100;
    
    // Get cancelled appointments for current period
    const cancelledAppointments = await Appointment.countDocuments({
      hospitalId: hospital,
      status: 'cancelled',
      date: { $gte: start, $lte: end }
    });
    
    // Get cancelled appointments for previous period
    const previousCancelledAppointments = await Appointment.countDocuments({
      hospitalId: hospital,
      status: 'cancelled',
      date: { $gte: previousStart, $lte: previousEnd }
    });
    
    // Calculate cancellation change percentage (negative is good)
    const cancellationChange = previousCancelledAppointments > 0 
      ? Math.round(((cancelledAppointments - previousCancelledAppointments) / previousCancelledAppointments) * 100) 
      : cancelledAppointments > 0 ? 100 : 0;
    
    // Get average wait time
    const completedAppointments = await Appointment.find({
      hospitalId: hospital,
      status: 'completed',
      checkInTime: { $exists: true },
      actualStartTime: { $exists: true },
      date: { $gte: start, $lte: end }
    });
    
    let avgWaitTime = 0;
    let previousAvgWaitTime = 0;
    
    if (completedAppointments.length > 0) {
      const totalWaitTimeMinutes = completedAppointments.reduce((acc, appointment) => {
        const waitTime = moment(appointment.actualStartTime).diff(moment(appointment.checkInTime), 'minutes');
        return acc + waitTime;
      }, 0);
      
      avgWaitTime = Math.round(totalWaitTimeMinutes / completedAppointments.length);
    }
    
    // Get previous period wait time
    const previousCompletedAppointments = await Appointment.find({
      hospitalId: hospital,
      status: 'completed',
      checkInTime: { $exists: true },
      actualStartTime: { $exists: true },
      date: { $gte: previousStart, $lte: previousEnd }
    });
    
    if (previousCompletedAppointments.length > 0) {
      const totalWaitTimeMinutes = previousCompletedAppointments.reduce((acc, appointment) => {
        const waitTime = moment(appointment.actualStartTime).diff(moment(appointment.checkInTime), 'minutes');
        return acc + waitTime;
      }, 0);
      
      previousAvgWaitTime = Math.round(totalWaitTimeMinutes / previousCompletedAppointments.length);
    }
    
    // Calculate wait time change (negative is good)
    const waitTimeChange = previousAvgWaitTime > 0 
      ? avgWaitTime - previousAvgWaitTime 
      : 0;

    // Get trend data for each metric
    const getDailyStats = async (startDate, endDate) => {
      const days = moment(endDate).diff(moment(startDate), 'days') + 1;
      const stats = [];
      
      for (let i = 0; i < days; i++) {
        const day = moment(startDate).add(i, 'days');
        const nextDay = moment(day).add(1, 'days');
        
        const dailyAppointments = await Appointment.countDocuments({
          hospitalId: hospital,
          date: {
            $gte: day.toDate(),
            $lt: nextDay.toDate()
          }
        });
        
        stats.push(dailyAppointments);
      }
      
      return stats;
    };

    const appointmentTrend = await getDailyStats(start, end);
    const patientTrend = await getDailyStats(start, end);
    const cancellationTrend = await getDailyStats(start, end);
    const waitTimeTrend = await getDailyStats(start, end);
    
    // Compile stats
    const stats = [
      {
        title: 'Total Appointments',
        value: totalAppointments.toString(),
        change: `${appointmentChange > 0 ? '+' : ''}${appointmentChange}%`,
        isPositive: appointmentChange >= 0,
        trend: appointmentTrend
      },
      {
        title: 'New Patients',
        value: newPatients.toString(),
        change: `${patientChange > 0 ? '+' : ''}${patientChange}%`,
        isPositive: patientChange >= 0,
        trend: patientTrend
      },
      {
        title: 'Cancellations',
        value: cancelledAppointments.toString(),
        change: `${cancellationChange > 0 ? '+' : ''}${cancellationChange}%`,
        isPositive: cancellationChange <= 0,
        trend: cancellationTrend
      },
      {
        title: 'Average Wait Time',
        value: `${avgWaitTime} min`,
        change: `${waitTimeChange <= 0 ? '' : '+'}${waitTimeChange} min`,
        isPositive: waitTimeChange <= 0,
        trend: waitTimeTrend
      }
    ];

    console.log('Sending stats:', stats);
    res.json(stats);
  } catch (error) {
    console.error('Error in getHospitalStats:', error);
    res.status(500).json({ 
      message: 'Error fetching hospital statistics',
      error: error.message 
    });
  }
});

// @desc    Get appointment types distribution
// @route   GET /api/reports/stats/appointment-types
// @access  Private (Staff, Doctor, Admin)
const getAppointmentTypes = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const hospital = req.user.hospital;

  if (!hospital) {
    return res.status(400).json({ message: 'No hospital assigned to user' });
  }

  console.log('Getting appointment types:', {
    hospital,
    startDate,
    endDate
  });
  
  try {
    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Get appointments by type
    const appointments = await Appointment.find({
      hospitalId: hospital,
      date: { $gte: start, $lte: end }
    });
    
    // Count appointments by type
    const typeCount = {};
    appointments.forEach(appointment => {
      const type = appointment.type || 'Other';
      typeCount[type] = (typeCount[type] || 0) + 1;
    });
    
    // Get trend data for each type
    const getDailyTypeStats = async (type, startDate, endDate) => {
      const days = moment(endDate).diff(moment(startDate), 'days') + 1;
      const stats = [];
      
      for (let i = 0; i < days; i++) {
        const day = moment(startDate).add(i, 'days');
        const nextDay = moment(day).add(1, 'days');
        
        const count = await Appointment.countDocuments({
          hospitalId: hospital,
          type: type,
          date: {
            $gte: day.toDate(),
            $lt: nextDay.toDate()
          }
        });
        
        stats.push(count);
      }
      
      return stats;
    };
    
    // Format for frontend with trends
    const appointmentsByType = await Promise.all(
      Object.keys(typeCount).map(async type => ({
        type,
        count: typeCount[type],
        trend: await getDailyTypeStats(type, start, end)
      }))
    );
    
    // Sort by count descending
    appointmentsByType.sort((a, b) => b.count - a.count);
    
    console.log('Sending appointment types:', appointmentsByType);
    res.json(appointmentsByType);
  } catch (error) {
    console.error('Error in getAppointmentTypes:', error);
    res.status(500).json({ 
      message: 'Error fetching appointment types',
      error: error.message 
    });
  }
});

// @desc    Get recent activity
// @route   GET /api/reports/stats/recent-activity
// @access  Private (Staff, Doctor, Admin)
const getRecentActivity = asyncHandler(async (req, res) => {
  const hospital = req.user.hospital;

  if (!hospital) {
    return res.status(400).json({ message: 'No hospital assigned to user' });
  }

  console.log('Getting recent activity for hospital:', hospital);

  try {
    // Get recent appointments (created, completed, cancelled)
    const recentAppointments = await Appointment.find({
      hospitalId: hospital
    })
    .sort({ updatedAt: -1 })
    .limit(10)
    .populate('patientId', 'name')
    .populate('doctorId', 'userId')
    .populate('doctorId.userId', 'name');

    // Get recent new patients
    const recentPatients = await Patient.find({
      hospital: hospital
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('name createdAt');

    // Get recent doctor assignments
    const recentDoctorAssignments = await Doctor.find({
      hospital: hospital
    })
    .sort({ updatedAt: -1 })
    .limit(5)
    .populate('userId', 'name');

    // Combine and format activities
    const activities = [
      ...recentAppointments.map(appointment => {
        let action = 'Appointment Updated';
        let status = 'success';
        
        switch(appointment.status) {
          case 'scheduled':
            action = 'Appointment Scheduled';
            status = 'success';
            break;
          case 'completed':
            action = 'Appointment Completed';
            status = 'success';
            break;
          case 'cancelled':
            action = 'Appointment Cancelled';
            status = 'error';
            break;
          case 'checked-in':
            action = 'Patient Checked In';
            status = 'success';
            break;
          case 'no-show':
            action = 'Patient No-Show';
            status = 'error';
            break;
          case 'rescheduled':
            action = 'Appointment Rescheduled';
            status = 'warning';
            break;
          default:
            action = 'Appointment Updated';
            status = 'success';
        }
        
        const doctorName = appointment.doctorId?.userId?.name || 'Unknown Doctor';
        const patientName = appointment.patientId?.name || 'Unknown Patient';
        
        return {
          id: `apt-${appointment._id}`,
          type: 'appointment',
          action,
          details: `${patientName} with Dr. ${doctorName}`,
          time: moment(appointment.updatedAt).fromNow(),
          timestamp: appointment.updatedAt,
          status
        };
      }),
      
      ...recentPatients.map(patient => ({
        id: `pat-${patient._id}`,
        type: 'patient',
        action: 'New Patient Registered',
        details: patient.name,
        time: moment(patient.createdAt).fromNow(),
        timestamp: patient.createdAt,
        status: 'success'
      })),

      ...recentDoctorAssignments.map(doctor => ({
        id: `doc-${doctor._id}`,
        type: 'doctor',
        action: 'Doctor Assignment Updated',
        details: `Dr. ${doctor.userId?.name || 'Unknown'}`,
        time: moment(doctor.updatedAt).fromNow(),
        timestamp: doctor.updatedAt,
        status: 'success'
      }))
    ];
    
    // Sort by timestamp and limit to 10
    const sortedActivities = activities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);
    
    console.log('Sending recent activities:', sortedActivities);
    res.json(sortedActivities);
  } catch (error) {
    console.error('Error in getRecentActivity:', error);
    res.status(500).json({ 
      message: 'Error fetching recent activity',
      error: error.message 
    });
  }
});

// @desc    Generate PDF report
// @route   POST /api/reports/generate-pdf
// @access  Private (Staff, Doctor, Admin)
const generateReport = asyncHandler(async (req, res) => {
  // In a real implementation, this would use a PDF generation library
  // and return a downloadable PDF file with the aggregated data
  res.status(200).json({ message: 'PDF generation not implemented in this version' });
});

// @desc    Get all reports
// @route   GET /api/reports
// @access  Private
const getReports = asyncHandler(async (req, res) => {
  try {
    const { doctorId, patientId, type, status, startDate, endDate } = req.query;
    const query = {};

    // Hospital access control - users can only access reports from their hospital
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access reports'
      });
    }
    
    // If user is not an admin, restrict to their hospital only
    if (req.user.role !== 'admin') {
      // Get user's hospital
      const userHospital = req.user.hospital;
      
      if (!userHospital) {
        // Return empty result set instead of error for users with no hospital
        console.log('User with no hospital assignment requesting reports. Returning empty result set.');
        return res.status(200).json({
          success: true,
          count: 0,
          data: []
        });
      }
      
      // Add hospital filter to query
      query.hospitalId = userHospital;
    }

    // Add filters if provided
    if (doctorId) query.doctorId = doctorId;
    if (patientId) query.patientId = patientId;
    if (type) query.type = type;
    if (status) query.status = status;
    
    // Add date range filter if provided
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const reports = await Report.find(query)
      .populate('patientId', 'name email phone')
      .populate({
        path: 'doctorId',
        select: 'userId specialization',
        populate: {
          path: 'userId',
          select: 'name'
        }
      })
      .populate('hospitalId', 'name address')
      .populate('appointmentId')
      .sort({ createdAt: -1 });

    // Transform the data to match the frontend interface
    const transformedReports = reports.map(report => ({
      ...report.toObject(),
      doctor: report.doctorId ? {
        _id: report.doctorId._id,
        name: report.doctorId.userId.name,
        specialization: report.doctorId.specialization
      } : null
    }));

    res.status(200).json({
      success: true,
      count: transformedReports.length,
      data: transformedReports
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reports',
      error: error.message
    });
  }
});

// @desc    Get report trends data
// @route   GET /api/reports/trends
// @access  Private (Staff, Doctor, Admin)
const getReportTrends = asyncHandler(async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const hospital = req.user?.hospital;

    // If no hospital, check if we need to fetch it
    let hospitalId = hospital;
    if (!hospitalId && req.user?._id) {
      const user = await User.findById(req.user._id).populate('hospital');
      hospitalId = user?.hospital;
    }

    // If still no hospital, return empty dataset
    if (!hospitalId) {
      return res.json({
        labels: [],
        datasets: [
          {
            label: 'Appointments',
            data: [],
            borderColor: '#3B82F6',
            backgroundColor: '#93C5FD',
            fill: false,
            tension: 0.4
          },
          {
            label: 'New Patients',
            data: [],
            borderColor: '#10B981',
            backgroundColor: '#6EE7B7',
            fill: false,
            tension: 0.4
          },
          {
            label: 'Reports',
            data: [],
            borderColor: '#F59E0B',
            backgroundColor: '#FCD34D',
            fill: false,
            tension: 0.4
          }
        ]
      });
    }

    // Parse dates safely
    const start = moment(startDate).startOf('day');
    const end = moment(endDate).endOf('day');
    const days = end.diff(start, 'days') + 1;

    // Initialize arrays
    const labels = [];
    const appointmentData = [];
    const patientData = [];
    const reportData = [];

    // Generate data for each day
    for (let i = 0; i < days; i++) {
      const currentDate = moment(start).add(i, 'days');
      const dateStr = currentDate.format('YYYY-MM-DD');
      const dayStart = currentDate.clone().startOf('day').toDate();
      const dayEnd = currentDate.clone().endOf('day').toDate();

      try {
        // Get appointments for this day
        const appointments = await Appointment.countDocuments({
          hospitalId: hospitalId,
          date: dateStr,
          status: { $ne: 'cancelled' } // Exclude cancelled appointments
        });

        // Get new patients for this day
        const patients = await Patient.countDocuments({
          hospital: hospitalId,
          createdAt: {
            $gte: dayStart,
            $lte: dayEnd
          }
        });

        // Get reports for this day's appointments
        const dayAppointments = await Appointment.find({
          hospitalId: hospitalId,
          date: dateStr,
          status: 'completed' // Only count reports for completed appointments
        }).select('_id');

        const reports = dayAppointments.length > 0 
          ? await Report.countDocuments({
              appointmentId: { $in: dayAppointments.map(a => a._id) }
            })
          : 0;

        // Add the data points
        labels.push(currentDate.format('MMM DD'));
        appointmentData.push(appointments || 0);
        patientData.push(patients || 0);
        reportData.push(reports || 0);

      } catch (err) {
        // If there's an error for this day, use 0
        labels.push(currentDate.format('MMM DD'));
        appointmentData.push(0);
        patientData.push(0);
        reportData.push(0);
      }
    }

    // Return the chart data
    return res.json({
      labels,
      datasets: [
        {
          label: 'Appointments',
          data: appointmentData,
          borderColor: '#3B82F6',
          backgroundColor: '#93C5FD',
          fill: false,
          tension: 0.4
        },
        {
          label: 'New Patients',
          data: patientData,
          borderColor: '#10B981',
          backgroundColor: '#6EE7B7',
          fill: false,
          tension: 0.4
        },
        {
          label: 'Reports',
          data: reportData,
          borderColor: '#F59E0B',
          backgroundColor: '#FCD34D',
          fill: false,
          tension: 0.4
        }
      ]
    });

  } catch (error) {
    // Return empty datasets with dates instead of error
    const start = moment(req.query.startDate);
    const end = moment(req.query.endDate);
    const days = end.diff(start, 'days') + 1;
    const labels = Array.from({ length: days }, (_, i) => 
      moment(start).add(i, 'days').format('MMM DD')
    );

    return res.json({
      labels,
      datasets: [
        {
          label: 'Appointments',
          data: Array(days).fill(0),
          borderColor: '#3B82F6',
          backgroundColor: '#93C5FD',
          fill: false,
          tension: 0.4
        },
        {
          label: 'New Patients',
          data: Array(days).fill(0),
          borderColor: '#10B981',
          backgroundColor: '#6EE7B7',
          fill: false,
          tension: 0.4
        },
        {
          label: 'Reports',
          data: Array(days).fill(0),
          borderColor: '#F59E0B',
          backgroundColor: '#FCD34D',
          fill: false,
          tension: 0.4
        }
      ]
    });
  }
});

// @desc    Update report
// @route   PUT /api/reports/:id
// @access  Private (Doctor only)
const updateReport = asyncHandler(async (req, res) => {
  try {
    console.log('Update report request received:', {
      id: req.params.id,
      body: req.body,
      files: req.files ? req.files.length : 'No files'
    });

    const { id } = req.params;
    const updateData = { ...req.body };
    
    // Handle imagesToRemove if it's passed as a string (from form data)
    if (updateData.imagesToRemove && typeof updateData.imagesToRemove === 'string') {
      try {
        console.log('Raw imagesToRemove string:', updateData.imagesToRemove);
        updateData.imagesToRemove = JSON.parse(updateData.imagesToRemove);
        console.log('Parsed imagesToRemove:', updateData.imagesToRemove);
      } catch (e) {
        console.error('Error parsing imagesToRemove:', e);
        updateData.imagesToRemove = [];
      }
    }

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report ID'
      });
    }

    // Ensure all ID fields are valid ObjectIds
    const idFields = ['patientId', 'doctorId', 'hospitalId', 'appointmentId'];
    
    for (const field of idFields) {
      if (updateData[field]) {
        if (!isValidObjectId(updateData[field])) {
          return res.status(400).json({
            success: false,
            message: `Invalid ${field} format: ${updateData[field]}`
          });
        }
      }
    }

    // Prevent updating reportNumber
    delete updateData.reportNumber;
    
    // First get the existing report
    const existingReport = await Report.findById(id);
    console.log('Existing report:', existingReport ? 'Found' : 'Not found');
    
    if (!existingReport) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }
    
    // Hospital access control - users can only update reports from their hospital
    if (req.user.role !== 'admin') {
      const userHospital = req.user.hospital;
      
      // Validate that user has a hospital assigned
      if (!userHospital) {
        return res.status(403).json({
          success: false,
          message: 'No hospital association found for the user'
        });
      }

      // Check if report belongs to user's hospital
      if (existingReport.hospitalId.toString() !== userHospital.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this report'
        });
      }
    }
    
    // Handle image removal if specified
    if (updateData.imagesToRemove && Array.isArray(updateData.imagesToRemove) && updateData.imagesToRemove.length > 0) {
      console.log('Images to remove:', updateData.imagesToRemove);
      // Filter out the images that are marked for removal
      const updatedImages = existingReport.conditionImages.filter(
        imgUrl => !updateData.imagesToRemove.includes(imgUrl)
      );
      updateData.conditionImages = updatedImages;
      
      // Delete the files from the filesystem (optional, can be done in a separate cleanup process)
      updateData.imagesToRemove.forEach(imgUrl => {
        try {
          const imgPath = imgUrl.split('/uploads/')[1];
          if (imgPath) {
            deleteFileSafely(imgPath).then(success => {
              if (success) {
                console.log(`Deleted image file: ${imgPath}`);
              }
            });
          }
        } catch (error) {
          console.error(`Error deleting image file: ${error.message}`);
          // Continue with the report update even if image deletion fails
        }
      });
    } else {
      // If no images to remove, keep the existing images
      updateData.conditionImages = existingReport.conditionImages || [];
    }

    // Remove imagesToRemove field as it's not part of the Report schema
    delete updateData.imagesToRemove;
    
    // Handle new uploaded images
    if (req.files && req.files.length > 0) {
      console.log('New files uploaded:', req.files.length);
      // Use Cloudinary URLs directly from the uploaded files
      const newImageUrls = req.files.map(file => file.path);
      
      // Combine with existing images (that weren't removed)
      updateData.conditionImages = [
        ...(updateData.conditionImages || []),
        ...newImageUrls
      ];
    }

    // Convert string fields to appropriate types
    if (updateData.followUpDate) {
      try {
        // Check if it's already a Date object
        if (updateData.followUpDate instanceof Date) {
          // Already a Date, no conversion needed
        } else if (typeof updateData.followUpDate === 'string') {
          // Try to parse the date string
          const parsedDate = new Date(updateData.followUpDate);
          
          // Check if the parsed date is valid
          if (isNaN(parsedDate.getTime())) {
            console.error('Invalid date string:', updateData.followUpDate);
            delete updateData.followUpDate; // Remove invalid date
          } else {
            updateData.followUpDate = parsedDate;
          }
        } else {
          // Not a string or Date, remove it
          console.error('followUpDate is neither a string nor a Date:', typeof updateData.followUpDate);
          delete updateData.followUpDate;
        }
      } catch (e) {
        console.error('Error parsing followUpDate:', e);
        delete updateData.followUpDate; // Remove invalid date
      }
    }

    // Build a sanitized update object with only valid fields
    const sanitizedUpdate = {};
    
    // Schema fields that can be updated
    const allowedFields = [
      'type', 'status', 'description', 'diagnosis', 'prescription', 
      'notes', 'followUpDate', 'conditionImages', 'patientId', 
      'doctorId', 'hospitalId', 'appointmentId'
    ];
    
    // Copy only allowed fields to the sanitized update object
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        sanitizedUpdate[field] = updateData[field];
      }
    });
    
    // Add updatedAt field
    sanitizedUpdate.updatedAt = new Date();

    console.log('Final sanitized update data:', sanitizedUpdate);

    try {
      const report = await Report.findByIdAndUpdate(
        id,
        sanitizedUpdate,
        { new: true, runValidators: true }
      );
      
      console.log('Report updated:', report ? 'Success' : 'Failed');

      // Log activity for report update
      await ActivityService.logActivity({
        user: req.user._id,
        hospitalId: report.hospitalId,
        actorId: req.user._id,
        actorName: req.user.name,
        actorRole: req.user.role,
        patientId: report.patientId,
        action: 'report_updated',
        subject: 'report',
        subjectId: report._id,
        description: `Report updated by ${req.user.name}`,
        metadata: {
          reportType: report.type,
          diagnosis: report.diagnosis,
          patientId: report.patientId,
          doctorId: report.doctorId,
          changes: req.body
        }
      });
      
      res.status(200).json({
        success: true,
        data: report
      });
    } catch (dbError) {
      console.error('Database error updating report:', dbError);
      
      // Check for Mongoose validation errors
      if (dbError.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: Object.keys(dbError.errors).reduce((acc, key) => {
            acc[key] = dbError.errors[key].message;
            return acc;
          }, {})
        });
      }
      
      // Handle CastError (invalid ObjectId, etc)
      if (dbError.name === 'CastError') {
        return res.status(400).json({
          success: false,
          message: `Invalid ${dbError.path}: ${dbError.value}`,
          error: dbError.message
        });
      }
      
      throw dbError; // Re-throw to be caught by outer catch
    }
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating report',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @desc    Delete report
// @route   DELETE /api/reports/:id
// @access  Private (Doctor only)
const deleteReport = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report ID'
      });
    }

    const report = await Report.findById(id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }
    
    // Hospital access control - users can only delete reports from their hospital
    if (req.user.role !== 'admin') {
      const userHospital = req.user.hospital;
      
      // Validate that user has a hospital assigned
      if (!userHospital) {
        return res.status(403).json({
          success: false,
          message: 'No hospital association found for the user'
        });
      }

      // Check if report belongs to user's hospital
      if (report.hospitalId.toString() !== userHospital.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this report'
        });
      }
    }
    
    // Store report details before deletion for logging
    const reportNumber = report.reportNumber;
    const patientId = report.patientId;
    const hospitalId = report.hospitalId;
    const reportId = report._id;
    
    // Delete the report using findByIdAndDelete instead of .remove()
    await Report.findByIdAndDelete(id);
    
    // Log the activity
    await ActivityService.logActivity({
      user: req.user._id,
      hospitalId: hospitalId,
      actorId: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      patientId: patientId,
      action: 'delete',
      subject: 'report',
      subjectId: reportId,
      description: `Report #${reportNumber} deleted`,
      details: `${req.user.name} deleted a report for patient ID: ${patientId}`
    });

    res.status(200).json({
      success: true,
      message: 'Report deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting report',
      error: error.message
    });
  }
});

// @desc    Get hospital revenue statistics
// @route   GET /api/reports/stats/hospital
// @access  Private (Staff, Doctor, Admin)
const getHospitalRevenueStats = asyncHandler(async (req, res) => {
  try {
    const hospital = req.user.hospital;

    if (!hospital) {
      return res.status(400).json({ message: 'No hospital assigned to user' });
    }

    console.log('Getting hospital revenue stats for:', hospital);

    // Load necessary models
    const Patient = require('../models/Patient');
    const Doctor = require('../models/Doctor');
    const Appointment = require('../models/Appointment');
    const Report = require('../models/Report');
    
    // Get current date for calculations
    const now = new Date();
    
    // Calculate date ranges
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    
    // Constants for revenue calculation
    const AVG_APPOINTMENT_REVENUE = 500; // Average revenue per completed appointment
    
    // Get total doctors
    const totalDoctors = await Doctor.countDocuments({ hospitalId: hospital });
    
    // Get total patients
    const totalPatients = await Patient.countDocuments({ hospital });
    
    // Get total appointments and completed appointments
    const totalAppointments = await Appointment.countDocuments({ hospitalId: hospital });
    const completedAppointments = await Appointment.countDocuments({ 
      hospitalId: hospital,
      status: 'completed'
    });
    
    // Calculate monthly revenue (completed appointments in current month)
    const monthlyCompletedAppointments = await Appointment.countDocuments({
      hospitalId: hospital,
      status: 'completed',
      date: { $gte: monthStart.toISOString().split('T')[0] }
    });
    
    // Calculate quarterly revenue (completed appointments in current quarter)
    const quarterlyCompletedAppointments = await Appointment.countDocuments({
      hospitalId: hospital,
      status: 'completed',
      date: { $gte: quarterStart.toISOString().split('T')[0] }
    });
    
    // Calculate annual revenue (completed appointments in current year)
    const annualCompletedAppointments = await Appointment.countDocuments({
      hospitalId: hospital,
      status: 'completed',
      date: { $gte: yearStart.toISOString().split('T')[0] }
    });
    
    // Calculate revenue figures
    const monthlyRevenue = monthlyCompletedAppointments * AVG_APPOINTMENT_REVENUE;
    const quarterlyRevenue = quarterlyCompletedAppointments * AVG_APPOINTMENT_REVENUE;
    const annualRevenue = annualCompletedAppointments * AVG_APPOINTMENT_REVENUE;
    
    // Get total reports
    const totalReports = await Report.countDocuments({ hospitalId: hospital });
    
    // Prepare response
    const statistics = {
      totalDoctors,
      totalPatients,
      totalAppointments,
      completedAppointments,
      revenue: {
        monthly: monthlyRevenue,
        quarterly: quarterlyRevenue,
        annual: annualRevenue
      },
      totalReports
    };
    
    console.log('Sending hospital revenue stats:', statistics);
    res.json(statistics);
  } catch (error) {
    console.error('Error in getHospitalRevenueStats:', error);
    res.status(500).json({ 
      message: 'Error fetching hospital revenue statistics',
      error: error.message 
    });
  }
});

module.exports = {
  createReport,
  getPatientReports,
  getDoctorReports,
  getReportById,
  generateReportPdf,
  getStaffReports,
  getHospitalStats,
  getAppointmentTypes,
  getRecentActivity,
  generateReport,
  getReports,
  getReportTrends,
  updateReport,
  deleteReport,
  getHospitalRevenueStats
};