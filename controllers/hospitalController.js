const Hospital = require('../models/Hospital');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const Staff = require('../models/Staff');

// @desc    Get all hospitals
// @route   GET /api/hospitals
// @access  Public
const getHospitals = async (req, res) => {
  try {
    const hospitals = await Hospital.find({});
    res.json(hospitals);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching hospitals' });
  }
};

// @desc    Get single hospital
// @route   GET /api/hospitals/:id
// @access  Public
const getHospitalById = async (req, res) => {
  try {
    const hospital = await Hospital.findById(req.params.id);
    if (hospital) {
      res.json(hospital);
    } else {
      res.status(404).json({ message: 'Hospital not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching hospital' });
  }
};

// @desc    Create hospital
// @route   POST /api/hospitals
// @access  Private/Admin
const createHospital = async (req, res) => {
  try {
    // Extract fields from request body
    const { name, address, contact, email, specialties, description, image, logo } = req.body;
    
    // Validate required fields
    if (!name || !address || !contact || !email || !description) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }
    
    // Create hospital with all fields
    const hospital = await Hospital.create({
      name,
      address,
      contact,
      email,
      specialties: specialties || [],
      description,
      image: image || '/default-hospital.jpg',
      logo: logo || '/default-logo.png'
    });
    
    res.status(201).json(hospital);
  } catch (error) {
    console.error('Error creating hospital:', error);
    if (error.code === 11000) {
      // Duplicate key error (likely email)
      res.status(400).json({ message: 'Hospital with this email already exists' });
    } else {
      res.status(400).json({ message: 'Invalid hospital data', error: error.message });
    }
  }
};

// @desc    Update hospital
// @route   PUT /api/hospitals/:id
// @access  Private/Admin
const updateHospital = async (req, res) => {
  try {
    const hospital = await Hospital.findById(req.params.id);
    if (hospital) {
      const { name, address, contact, email, specialties, description, image, logo } = req.body;
      
      // Update fields if provided
      if (name !== undefined) hospital.name = name;
      if (address !== undefined) hospital.address = address;
      if (contact !== undefined) hospital.contact = contact;
      if (email !== undefined) hospital.email = email;
      if (specialties !== undefined) hospital.specialties = specialties;
      if (description !== undefined) hospital.description = description;
      if (image !== undefined) hospital.image = image;
      if (logo !== undefined) hospital.logo = logo;
      
      hospital.lastUpdated = Date.now();
      
      const updatedHospital = await hospital.save();
      res.json(updatedHospital);
    } else {
      res.status(404).json({ message: 'Hospital not found' });
    }
  } catch (error) {
    console.error('Error updating hospital:', error);
    if (error.code === 11000) {
      // Duplicate key error (likely email)
      res.status(400).json({ message: 'Hospital with this email already exists' });
    } else {
      res.status(400).json({ message: 'Error updating hospital', error: error.message });
    }
  }
};

// @desc    Delete hospital
// @route   DELETE /api/hospitals/:id
// @access  Private/Admin
const deleteHospital = async (req, res) => {
  try {
    const hospital = await Hospital.findById(req.params.id);
    if (hospital) {
      await hospital.deleteOne();
      res.json({ message: 'Hospital removed' });
    } else {
      res.status(404).json({ message: 'Hospital not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error deleting hospital' });
  }
};

// @desc    Get hospital patient count
// @route   GET /api/hospitals/:id/patient-count
// @access  Private
const getHospitalPatientCount = async (req, res) => {
  try {
    const hospitalId = req.params.id;
    const Patient = require('../models/Patient');
    
    const patientCount = await Patient.countDocuments({ hospital: hospitalId });
    
    res.json({ patientCount });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching patient count' });
  }
};

// @desc    Get hospital statistics
// @route   GET /api/hospitals/:id/stats
// @access  Private
const getHospitalStats = async (req, res) => {
  try {
    const hospitalId = req.params.id;
    
    // Load necessary models
    const Patient = require('../models/Patient');
    const Doctor = require('../models/Doctor');
    const Staff = require('../models/Staff');
    const Appointment = require('../models/Appointment');
    
    // Get counts
    const patientCount = await Patient.countDocuments({ hospital: hospitalId });
    const doctorCount = await Doctor.countDocuments({ hospitalId });
    const staffCount = await Staff.countDocuments({ hospital: hospitalId });
    const appointmentCount = await Appointment.countDocuments({ hospitalId });
    
    // Get appointment statistics
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayAppointments = await Appointment.countDocuments({
      hospitalId,
      date: { $gte: today, $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) }
    });
    
    // Get upcoming appointments (next 7 days)
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingAppointments = await Appointment.countDocuments({
      hospitalId,
      date: { $gt: today, $lte: nextWeek }
    });
    
    res.json({
      patientCount,
      doctorCount,
      staffCount,
      appointmentCount,
      todayAppointments,
      upcomingAppointments
    });
  } catch (error) {
    console.error('Error fetching hospital stats:', error);
    res.status(500).json({ message: 'Error fetching hospital statistics' });
  }
};

// @desc    Upload staff from CSV
// @route   POST /api/hospitals/staff-upload
// @access  Private/Admin
const uploadStaffFromCSV = async (req, res) => {
  try {
    const { hospitalId, replaceExisting } = req.body;
    
    if (!hospitalId) {
      return res.status(400).json({ message: 'Hospital ID is required' });
    }
    
    console.log(`Processing staff upload for hospital ID: ${hospitalId}`);
    console.log(`Replace existing users: ${replaceExisting ? 'Yes' : 'No'}`);
    
    // Check if hospital exists
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: 'Hospital not found' });
    }
    
    console.log(`Hospital found: ${hospital.name}`);
    
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a CSV file' });
    }
    
    // Parse CSV data from buffer
    const csvData = req.file.buffer.toString('utf8');
    const rows = csvData.split('\n');
    const headers = rows[0].split(',').map(header => header.trim().toLowerCase().replace(/\s+/g, ''));
    
    // Validate required headers
    const requiredHeaders = ['firstname', 'lastname', 'email', 'role'];
    const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
    
    if (missingHeaders.length > 0) {
      return res.status(400).json({
        message: `Missing required headers: ${missingHeaders.join(', ')}`,
      });
    }
    
    // Process staff data
    const staffData = rows.slice(1)
      .filter(row => row.trim() !== '')
      .map(row => {
        const values = row.split(',').map(value => value.trim());
        const staff = {};
        
        headers.forEach((header, index) => {
          staff[header] = values[index] || '';
        });
        
        return staff;
      });
    
    console.log(`Processing ${staffData.length} staff members from CSV`);
    
    // Results tracking
    const results = {
      success: [],
      failed: []
    };
    
    // Process each staff member
    for (const staff of staffData) {
      try {
        // Basic validation
        if (!staff.firstname || !staff.lastname || !staff.email || !staff.role) {
          results.failed.push({
            staff,
            reason: 'Missing required fields: firstname, lastname, email, or role'
          });
          continue;
        }
        
        // Validate role
        const validRoles = ['doctor', 'staff'];
        if (!validRoles.includes(staff.role.toLowerCase())) {
          results.failed.push({
            staff,
            reason: `Invalid role: ${staff.role}. Valid roles are: doctor, staff`
          });
          continue;
        }
        
        // Check if email already exists
        const existingUser = await User.findOne({ email: staff.email });
        
        if (existingUser) {
          // If replaceExisting flag is true, delete the existing user and related data
          if (replaceExisting) {
            console.log(`Replacing existing user with email: ${staff.email}`);
            
            // Find and delete associated doctor or staff record
            if (existingUser.role === 'doctor') {
              const doctor = await Doctor.findOne({ userId: existingUser._id });
              if (doctor) {
                console.log(`Deleting existing doctor record for user: ${existingUser._id}`);
                await Doctor.findByIdAndDelete(doctor._id);
              }
            } else if (existingUser.role === 'staff') {
              const staffRecord = await Staff.findOne({ userId: existingUser._id });
              if (staffRecord) {
                console.log(`Deleting existing staff record for user: ${existingUser._id}`);
                await Staff.findByIdAndDelete(staffRecord._id);
              }
            }
            
            // Delete the user
            await User.findByIdAndDelete(existingUser._id);
            console.log(`Deleted existing user: ${existingUser.name} (${existingUser.email})`);
          } else {
            // If replaceExisting is false, skip this user with an error
            results.failed.push({
              staff,
              reason: 'Email already exists'
            });
            continue;
          }
        }
        
        // Create random password for the user
        const password = Math.random().toString(36).slice(-8) + Math.random().toString(36).toUpperCase().slice(-4) + '!';
        
        // Create user with explicit hospital ID
        const newUser = new User({
          name: `${staff.firstname} ${staff.lastname}`,
          email: staff.email,
          password, // Random password that should be changed on first login
          role: staff.role.toLowerCase(),
          hospital: hospitalId, // Ensure this is a valid ObjectId
          isOnboarded: true,
          hasSetPassword: false,
          gender: staff.gender || 'other' // Add a default gender if not provided
        });
        
        // For doctors, set the specialization directly from the CSV
        if (staff.role.toLowerCase() === 'doctor' && staff.specialization) {
          newUser.specialization = staff.specialization;
        }
        
        const savedUser = await newUser.save();
        console.log(`Created user: ${savedUser.name} with role ${savedUser.role} and hospital: ${savedUser.hospital}`);
        
        // Create role-specific profile
        if (staff.role.toLowerCase() === 'doctor') {
          const doctor = new Doctor({
            userId: savedUser._id,
            hospitalId: hospitalId, // Ensure this is the same hospital ID
            title: 'Dr',
            surName: staff.lastname,
            middleName: '',
            dateOfBirth: staff.dateofbirth || '',
            specialization: staff.specialization || 'General Medicine', // Use any specialization provided
            qualification: staff.qualification || '',
            experience: Number(staff.experience) || 0,
            fees: Number(staff.fees) || 0,
          });
          
          const savedDoctor = await doctor.save();
          console.log(`Created doctor profile for: ${savedUser.name} with hospital: ${savedDoctor.hospitalId}`);
        }
        // Only for staff role (not doctors)
        else if (staff.role.toLowerCase() === 'staff') {
          // Validate department value (must be one of the allowed enum values)
          const validDepartments = ['Reception', 'Pharmacy', 'Administration', 'Nursing', 'Laboratory', 'Radiology'];
          let department = 'Administration'; // Default value
          
          // Try to match the specialization to a valid department, or use default
          if (staff.specialization) {
            // Check if specialization exactly matches any valid department (case insensitive)
            const matchedDept = validDepartments.find(
              dept => dept.toLowerCase() === staff.specialization.toLowerCase()
            );
            
            if (matchedDept) {
              department = matchedDept;
            }
            // Otherwise keep the default 'Administration'
          }
          
          try {
            // Create staff with required fields first
            const staffMember = new Staff({
              userId: savedUser._id,
              hospital: hospitalId, // Ensure this is the same hospital ID
              department: department,
              shift: 'Full Day (9 AM - 5 PM)',
              joiningDate: new Date(),
              // Generate a unique employeeId explicitly
              employeeId: `${department.substring(0, 3).toUpperCase()}-${hospitalId.substring(0, 4)}-${Date.now().toString().slice(-6)}`,
              emergencyContact: {
                name: staff.emergencycontactname || `${staff.firstname} Family`,
                relationship: staff.emergencycontactrelationship || 'Family',
                phone: staff.emergencycontactphone || staff.phone || '0000000000'
              }
            });
            
            // Save the staff member with the explicitly set employeeId
            const savedStaff = await staffMember.save();
            console.log(`Created staff profile for: ${savedUser.name} with hospital: ${savedStaff.hospital} and department: ${savedStaff.department}, employeeId: ${savedStaff.employeeId}`);
          } catch (staffError) {
            console.error('Error creating staff:', staffError);
            // If creating staff fails, delete the user to avoid orphaned records
            await User.findByIdAndDelete(savedUser._id);
            throw new Error(`Staff creation failed: ${staffError.message}`);
          }
        }
        
        // Double-check the user has been saved with the hospital ID
        const verifyUser = await User.findById(savedUser._id);
        if (!verifyUser.hospital) {
          console.error(`User ${savedUser._id} (${savedUser.name}) has no hospital assigned after save!`);
          // Update the user again to ensure hospital is set
          await User.findByIdAndUpdate(savedUser._id, { hospital: hospitalId });
        }
        
        results.success.push(staff);
      } catch (error) {
        console.error('Error processing staff member:', error);
        results.failed.push({
          staff,
          reason: error.message || 'Server error during processing'
        });
      }
    }
    
    console.log(`CSV processing completed. Success: ${results.success.length}, Failed: ${results.failed.length}`);
    res.status(200).json(results);
  } catch (error) {
    console.error('Error processing CSV upload:', error);
    res.status(500).json({
      message: 'Error processing staff upload',
      error: error.message
    });
  }
};

// @desc    Get staff by hospital ID
// @route   GET /api/hospitals/:id/staff
// @access  Private
const getStaffByHospital = async (req, res) => {
  try {
    const hospitalId = req.params.id;
    
    if (!hospitalId) {
      return res.status(400).json({ message: 'Hospital ID is required' });
    }
    
    console.log(`Fetching staff for hospital ID: ${hospitalId}`);
    
    // Find all staff members for this hospital
    const staffMembers = await Staff.find({ hospital: hospitalId })
      .populate('userId', 'name email status');
    
    console.log(`Found ${staffMembers.length} staff members for hospital ID: ${hospitalId}`);
    
    // Format the staff data for the frontend
    const formattedStaff = staffMembers.map(staff => {
      return {
        _id: staff._id,
        userId: staff.userId ? {
          _id: staff.userId._id,
          name: staff.userId.name || 'Unknown Staff',
          email: staff.userId.email || 'N/A'
        } : {
          _id: null,
          name: 'Unknown Staff',
          email: 'N/A'
        },
        department: staff.department || 'General',
        employeeId: staff.employeeId || 'N/A',
        joiningDate: staff.joiningDate || 'N/A',
        shift: staff.shift || 'Not specified'
      };
    });
    
    res.json(formattedStaff);
  } catch (error) {
    console.error('Error fetching staff by hospital:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getHospitals,
  getHospitalById,
  createHospital,
  updateHospital,
  deleteHospital,
  getHospitalPatientCount,
  getHospitalStats,
  uploadStaffFromCSV,
  getStaffByHospital
}; 