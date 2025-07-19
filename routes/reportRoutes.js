const express = require('express');
const router = express.Router();
const { protect, authorize, doctorOnly, staffOnly } = require('../middleware/authMiddleware');
const asyncHandler = require('express-async-handler');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const Report = require('../models/Report');
const { isValidObjectId } = require('mongoose');

const {
  createReport,
  getReports,
  getReportById,
  updateReport,
  deleteReport,
  getDoctorReports,
  getPatientReports,
  getStaffReports,
  getHospitalStats,
  getAppointmentTypes,
  getRecentActivity,
  generateReport,
  getReportTrends,
  generateReportPdf,
  getHospitalRevenueStats
} = require('../controllers/reportController');

// Import cloudinary configuration
const { upload } = require('../config/cloudinary');

// Protected routes (require authentication)
router.use(protect);

// Role-specific report routes - placing these first to ensure proper matching
router.route('/patient/:patientId')
  .get(getPatientReports);

router.route('/doctor/:doctorId')
  .get(getDoctorReports);

router.route('/staff/:hospitalId')
  .get(staffOnly, getStaffReports);

// Analytics/dashboard routes
router.route('/stats/hospital')
  .get(getHospitalRevenueStats);

router.route('/stats/appointment-types')
  .get(getAppointmentTypes);

router.route('/stats/recent-activity')
  .get(getRecentActivity);

router.route('/trends')
  .get(getReportTrends);

// Export routes
router.route('/generate-pdf')
  .post(generateReport);

router.route('/generate-excel')
  .post(generateReport);

// Base routes
router.route('/')
  .post(authorize(['doctor', 'staff']), createReport)
  .get(getReports);

// Report management routes
router.route('/:id/download-pdf')
  .get(asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const { includeImages } = req.query;
      const { generateSimplePdf } = require('../utils/pdfGenerator');
      const { ensureUploadsDir } = require('../utils/fileHelper');
      
      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid report ID'
        });
      }

      console.log(`Downloading PDF for report ${id}, includeImages=${includeImages}`);

      // Find the report with all related data
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
      
      // Create simplified data structure for PDF generator
      const reportData = {
        _id: report._id.toString(),
        reportNumber: report.reportNumber || `Report-${Date.now()}`,
        date: report.createdAt,
        diagnosis: report.diagnosis || 'No diagnosis provided',
        prescription: report.prescription || 'No prescription provided',
        notes: report.notes || '',
        followUpDate: report.followUpDate,
        type: report.type || 'Medical',
        
        // Only include images if explicitly requested
        images: includeImages === 'true' ? (report.conditionImages || []) : [],
        
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
      
      console.log('Generating PDF for download...');
      
      // Ensure uploads directory exists
      const uploadsDir = ensureUploadsDir();
      const filename = `report_${report._id}_${Date.now()}.pdf`;
      const pdfPath = path.join(uploadsDir, filename);
      
      try {
        // Generate the PDF
        const generatedPdfPath = await generateSimplePdf(reportData, pdfPath);
        console.log(`PDF generated successfully at ${generatedPdfPath}`);
        
        // Check if file exists and has content
        if (!fs.existsSync(generatedPdfPath)) {
          throw new Error('Generated PDF file not found');
        }
        
        const stats = fs.statSync(generatedPdfPath);
        if (stats.size === 0) {
          throw new Error('Generated PDF file is empty');
        }
        
        console.log(`PDF file size: ${stats.size} bytes`);
        
        // Set content type and attachment headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="report_${report._id}.pdf"`);
        
        // Stream the file
        const fileStream = fs.createReadStream(generatedPdfPath);
        
        // Handle file errors
        fileStream.on('error', (err) => {
          console.error('Error streaming PDF file:', err);
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              message: 'Error streaming PDF file',
              error: err.message
            });
          }
        });
        
        // Clean up after streaming
        fileStream.on('end', () => {
          try {
            fs.unlinkSync(generatedPdfPath);
            console.log('Temporary PDF file deleted after download');
          } catch (err) {
            console.error('Error deleting temporary PDF file:', err);
          }
        });
        
        // Pipe the file to the response
        fileStream.pipe(res);
        
      } catch (pdfError) {
        console.error('Error generating PDF for download:', pdfError);
        res.status(500).json({
          success: false,
          message: 'Error generating PDF',
          error: pdfError.message
        });
      }
    } catch (error) {
      console.error('Error in download-pdf endpoint:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating PDF report',
        error: error.message
      });
    }
  }));

router.route('/:id/pdf')
  .get(generateReportPdf);

// Place the general ID route last to avoid capturing other routes
router.route('/:id')
  .get(getReportById)
  .put(authorize(['doctor', 'staff']), upload.array('images', 10), updateReport)
  .delete(authorize('doctor'), deleteReport);

// Add a simple test endpoint for direct PDF generation
router.get('/generate-pdf-test/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { generateSimplePdf } = require('../utils/pdfGenerator');
    const { ensureUploadsDir } = require('../utils/fileHelper');
    
    // Find the report with all related data
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
    
    // Create a simple test structure for PDF generation
    const testData = {
      _id: report._id.toString(),
      reportNumber: report.reportNumber || `Test-${Date.now()}`,
      date: report.createdAt,
      diagnosis: report.diagnosis || 'Test diagnosis',
      prescription: report.prescription || 'Test prescription',
      notes: report.notes || 'Test notes',
      followUpDate: report.followUpDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      type: report.type || 'Test Medical Report',
      
      patient: report.patientId ? {
        name: report.patientId.name || 'Test Patient',
        _id: report.patientId._id.toString(),
        gender: report.patientId.gender || 'Not specified',
        age: report.patientId.age || 30,
        blood: report.patientId.blood || 'O+'
      } : {
        name: 'Test Patient',
        _id: 'test123',
        gender: 'Male',
        age: 30,
        blood: 'O+'
      },
      
      doctor: report.doctorId ? {
        name: report.doctorId.userId?.name || 'Test Doctor',
        specialization: report.doctorId.specialization || 'General Medicine'
      } : {
        name: 'Test Doctor',
        specialization: 'General Medicine'
      },
      
      hospital: report.hospitalId ? {
        name: report.hospitalId.name || 'Test Hospital',
        address: report.hospitalId.address || 'Test Address, Test City',
        contact: report.hospitalId.phone || '123-456-7890'
      } : {
        name: 'Test Hospital',
        address: 'Test Address, Test City',
        contact: '123-456-7890'
      },
      
      appointment: report.appointmentId ? {
        date: report.appointmentId.date ? moment(report.appointmentId.date).format('MMMM Do YYYY') : moment().format('MMMM Do YYYY'),
        time: report.appointmentId.time || '10:00 AM',
        type: report.appointmentId.type || 'Check-up'
      } : {
        date: moment().format('MMMM Do YYYY'),
        time: '10:00 AM',
        type: 'Check-up'
      }
    };
    
    console.log('TEST: Preparing to generate PDF with test data');
    
    // Ensure uploads directory exists
    const ensuredDir = ensureUploadsDir();
    const pdfPath = path.join(ensuredDir, `test_report_${report._id}.pdf`);
    
    // Generate the PDF
    const generatedPdfPath = await generateSimplePdf(testData, pdfPath);
    
    console.log('TEST: PDF generation completed', generatedPdfPath);
    
    // Set headers and send the file
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="test_report_${report._id}.pdf"`);
    
    // Create and send the file stream
    const fileStream = fs.createReadStream(generatedPdfPath);
    fileStream.pipe(res);
    
    // Handle errors in the stream
    fileStream.on('error', (err) => {
      console.error('TEST: Error streaming PDF file:', err);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error streaming PDF file',
          error: err.message,
          stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
      }
    });
    
    // Clean up the file after sending
    fileStream.on('end', () => {
      try {
        fs.unlinkSync(generatedPdfPath);
        console.log('TEST: Temporary PDF file deleted');
      } catch (unlinkErr) {
        console.error('TEST: Error deleting temporary PDF file:', unlinkErr);
      }
    });
    
  } catch (error) {
    console.error('TEST: Error generating test PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating test PDF',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

module.exports = router; 