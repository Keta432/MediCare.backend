const asyncHandler = require('express-async-handler');
const Patient = require('../models/Patient');
const User = require('../models/User');

// @desc    Create or update patient
// @route   POST /api/patients
// @access  Public
const createOrUpdatePatient = asyncHandler(async (req, res) => {
  console.log('Received patient data:', req.body);
  
  const {
    name,
    email,
    age,
    gender,
    phone,
    bloodGroup,
    allergies,
    medicalHistory,
    hospital,
    hospitalId
  } = req.body;

  try {
    // First, create or find a user
    let user = await User.findOne({ email });
    console.log('Existing user:', user);
    
    if (!user) {
      // Create a new user with a random password (they can reset it later)
      const randomPassword = Math.random().toString(36).slice(-8);
      user = await User.create({
        name,
        email,
        password: randomPassword,
        gender,
        role: 'patient'
      });
      console.log('Created new user:', user);
    } else {
      // Update existing user's name if it has changed
      if (name && user.name !== name) {
        user.name = name;
        await user.save();
      }
    }

    // Check if patient already exists
    let patient = await Patient.findOne({ user: user._id });
    console.log('Existing patient:', patient);

    if (patient) {
      // Update existing patient
      patient.name = name;
      patient.email = email;
      patient.age = age;
      patient.gender = gender;
      patient.phone = phone;
      patient.bloodGroup = bloodGroup || patient.bloodGroup;
      patient.allergies = allergies || patient.allergies;
      
      // Handle hospital field - use either hospital or hospitalId
      if (hospital !== undefined) {
        patient.hospital = hospital;
      } else if (hospitalId !== undefined) {
        patient.hospital = hospitalId;
      }
      
      if (medicalHistory && medicalHistory.length > 0) {
        patient.medicalHistory = [...patient.medicalHistory, ...medicalHistory];
      }
      await patient.save();
      console.log('Updated patient:', patient);
    } else {
      // Create new patient with appropriate hospital field
      const hospitalValue = hospital || hospitalId || null;
      
      patient = await Patient.create({
        user: user._id,
        name,
        email,
        age,
        gender,
        phone,
        bloodGroup: bloodGroup || 'Not Specified',
        allergies: allergies || [],
        medicalHistory: medicalHistory || [],
        hospital: hospitalValue,
        emergencyContact: {
          name: '',
          relationship: '',
          phone: phone || ''
        }
      });
      console.log('Created new patient:', patient);
    }

    // Populate user and hospital details
    await patient.populate([
      { path: 'user', select: 'name email' },
      { path: 'hospital', select: 'name' }
    ]);

    // Format the response to match the frontend interface
    const response = {
      _id: patient._id,
      name: patient.name || patient.user.name,
      email: patient.email || patient.user.email,
      age: patient.age,
      gender: patient.gender,
      phone: patient.phone,
      bloodGroup: patient.bloodGroup,
      allergies: patient.allergies,
      medicalHistory: patient.medicalHistory,
      hospital: patient.hospital,
      hospitalId: patient.hospital?._id,
      status: patient.status || 'active',
      emergencyContact: patient.emergencyContact
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Error in createOrUpdatePatient:', error);
    res.status(400);
    throw new Error('Error creating patient: ' + error.message);
  }
});

// @desc    Get all patients
// @route   GET /api/patients
// @access  Private
const getPatients = asyncHandler(async (req, res) => {
  // Build query object for filtering
  const query = {};
  
  // Filter by hospital if hospitalId is provided
  if (req.query.hospitalId) {
    query.hospital = req.query.hospitalId;
    console.log(`Filtering patients by hospital: ${req.query.hospitalId}`);
  }

  const patients = await Patient.find(query)
    .populate('user', 'name email')
    .populate('hospital', 'name')
    .select('user name email age gender phone bloodGroup medicalHistory appointments allergies emergencyContact status hospital dateOfBirth')
    .lean();

  console.log(`Found ${patients.length} patients${req.query.hospitalId ? ` for hospital ${req.query.hospitalId}` : ''}`);

  // Format the response to match the frontend interface
  const formattedPatients = patients.map(patient => {
    const lastAppointment = patient.appointments?.length > 0 
      ? patient.appointments.sort((a, b) => new Date(b.date) - new Date(a.date))[0]
      : null;

    const upcomingAppointment = patient.appointments?.find(apt => 
      new Date(apt.date) > new Date() && apt.status === 'scheduled'
    );

    // Get name and email either from the user object or direct patient fields
    const patientName = patient.user?.name || patient.name || 'Unknown Patient';
    const patientEmail = patient.user?.email || patient.email || 'No email provided';

    return {
      _id: patient._id,
      name: patientName,
      email: patientEmail,
      phone: patient.phone || patient.emergencyContact?.phone || 'N/A',
      age: patient.age || 0,
      gender: patient.gender || 'unknown',
      bloodGroup: patient.bloodGroup || 'Unknown',
      address: patient.emergencyContact?.address,
      medicalHistory: patient.medicalHistory?.map(history => history.condition),
      allergies: patient.allergies || [],
      lastVisit: lastAppointment ? new Date(lastAppointment.date).toISOString() : undefined,
      upcomingAppointment: upcomingAppointment 
        ? new Date(upcomingAppointment.date).toLocaleDateString()
        : undefined,
      totalVisits: patient.appointments?.filter(apt => apt.status === 'completed')?.length || 0,
      status: patient.status || 'active',
      hospital: patient.hospital,
      hospitalId: patient.hospital?._id
    };
  });

  res.json(formattedPatients);
});

// @desc    Get patient by ID
// @route   GET /api/patients/:id
// @access  Private
const getPatientById = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id)
    .populate('user', 'name email')
    .populate('hospital')
    .populate('primaryDoctor');
    
  if (patient) {
    res.json(patient);
  } else {
    res.status(404);
    throw new Error('Patient not found');
  }
});

// @desc    Update patient
// @route   PUT /api/patients/:id
// @access  Private
const updatePatient = asyncHandler(async (req, res) => {
  try {
    const patientId = req.params.id;
    const {
      user = {},
      age,
      gender,
      phone,
      bloodGroup,
      status,
      allergies,
      medicalHistory,
      emergencyContact = {},
      hospital,
      hospitalId
    } = req.body;

    const patient = await Patient.findById(patientId);

    if (!patient) {
      res.status(404);
      throw new Error('Patient not found');
    }

    // Update the patient information
    if (age !== undefined) patient.age = age;
    if (gender !== undefined) patient.gender = gender;
    if (bloodGroup !== undefined) patient.bloodGroup = bloodGroup;
    if (status !== undefined) patient.status = status;
    if (phone !== undefined) patient.phone = phone;
    
    // Handle hospital field - use either hospital or hospitalId
    if (hospital !== undefined) {
      patient.hospital = hospital;
    } else if (hospitalId !== undefined) {
      patient.hospital = hospitalId;
    }
    
    // Update allergies if provided
    if (allergies !== undefined) {
      patient.allergies = allergies;
    }
    
    // Update medical history if provided
    if (medicalHistory !== undefined) {
      // Convert simple strings to objects with condition field if needed
      const formattedMedicalHistory = medicalHistory.map(item => {
        if (typeof item === 'string') {
          return { condition: item };
        }
        return item;
      });
      patient.medicalHistory = formattedMedicalHistory;
    }
    
    // Update emergency contact if provided
    if (emergencyContact) {
      patient.emergencyContact = {
        ...patient.emergencyContact || {},
        ...emergencyContact
      };
    }

    // Update associated user if it exists
    if (patient.user && (user.name || user.email)) {
      const userDoc = await User.findById(patient.user);
      if (userDoc) {
        if (user.name) userDoc.name = user.name;
        if (user.email) userDoc.email = user.email;
        await userDoc.save();
      }
    }

    const updatedPatient = await patient.save();
    
    // Populate hospital details before sending response
    await updatedPatient.populate('hospital', 'name');
    
    // Return a properly formatted response
    res.json({
      _id: updatedPatient._id,
      name: user.name,
      email: user.email,
      age: updatedPatient.age,
      gender: updatedPatient.gender,
      phone: updatedPatient.phone,
      bloodGroup: updatedPatient.bloodGroup,
      status: updatedPatient.status,
      emergencyContact: updatedPatient.emergencyContact,
      allergies: updatedPatient.allergies,
      medicalHistory: updatedPatient.medicalHistory,
      hospital: updatedPatient.hospital
    });
  } catch (error) {
    console.error('Error updating patient:', error);
    res.status(500);
    throw new Error(`Failed to update patient: ${error.message}`);
  }
});

// @desc    Delete patient
// @route   DELETE /api/patients/:id
// @access  Private/Admin
const deletePatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id);

  if (!patient) {
    res.status(404);
    throw new Error('Patient not found');
  }

  // Delete associated user if exists
  if (patient.user) {
    await User.findByIdAndDelete(patient.user);
  }

  // Delete the patient
  await patient.deleteOne();

  res.json({ message: 'Patient removed' });
});

// @desc    Get patients by hospital
// @route   GET /api/patients/hospital/:hospitalId
// @access  Private
const getPatientsByHospital = asyncHandler(async (req, res) => {
  const hospitalId = req.params.hospitalId;
  
  try {
    console.log('Fetching patients for hospital:', hospitalId);
    
    // Method 1: Get patients directly assigned to hospital
    let patients = await Patient.find({ hospital: hospitalId })
      .populate('primaryDoctor')
      .populate('hospital')
      .lean();
    
    console.log('Patients directly assigned to hospital:', patients.length);
    
    // Method 2: Also find patients who have appointments in this hospital
    const Appointment = require('../models/Appointment');
    
    // Find appointments at this hospital
    const hospitalAppointments = await Appointment.find({ hospitalId })
      .populate('patientId')
      .lean();
    
    console.log('Appointments at this hospital:', hospitalAppointments.length);
    
    // Extract unique patient IDs from appointments
    const patientIdsFromAppointments = hospitalAppointments
      .filter(apt => apt.patientId) // Filter out null/undefined patientIds
      .map(apt => {
        // Handle both string and object format
        return typeof apt.patientId === 'string' ? apt.patientId : apt.patientId._id;
      })
      .filter(id => id); // Filter out any undefined/null values
    
    // Remove duplicates using Set
    const uniquePatientIds = [...new Set(patientIdsFromAppointments)];
    
    console.log('Unique patients from appointments:', uniquePatientIds.length);
    
    // Get these patients excluding those already fetched
    const existingPatientIds = patients.map(p => p._id.toString());
    const newPatientIds = uniquePatientIds.filter(
      id => id && !existingPatientIds.includes(id.toString())
    );
    
    console.log('New patients to add:', newPatientIds.length);
    
    if (newPatientIds.length > 0) {
      const additionalPatients = await Patient.find({
        _id: { $in: newPatientIds }
      })
        .populate('primaryDoctor')
        .populate('hospital')
        .lean();
      
      console.log('Additional patients fetched:', additionalPatients.length);
      patients = [...patients, ...additionalPatients];
    }
    
    // If we still have no patients, try a fallback approach - get all patients and filter by hospital
    if (patients.length === 0) {
      console.log('No patients found. Trying fallback approach...');
      
      // Get all patients and check if any have this hospital ID in any way
      const allPatients = await Patient.find({})
        .populate('primaryDoctor')
        .lean();
      
      console.log(`Found ${allPatients.length} total patients in the system`);
      
      // Get all doctors in this hospital for filtering
      const Doctor = require('../models/Doctor');
      const doctorsInHospital = await Doctor.find({ hospitalId }).lean();
      const doctorIds = doctorsInHospital.map(d => d._id.toString());
      
      console.log(`Found ${doctorsInHospital.length} doctors in this hospital`);
      
      // Filter patients that might be associated with this hospital
      const filteredPatients = allPatients.filter(patient => {
        // Check if the patient has a primaryDoctor that works at this hospital
        if (patient.primaryDoctor) {
          const primaryDoctorId = typeof patient.primaryDoctor === 'string' 
            ? patient.primaryDoctor 
            : patient.primaryDoctor._id?.toString();
          
          if (doctorIds.includes(primaryDoctorId)) {
            return true;
          }
        }
        
        // Check patient's appointments for doctors from this hospital
        if (patient.appointments && patient.appointments.length > 0) {
          return patient.appointments.some(apt => {
            if (apt.doctor) {
              const doctorId = typeof apt.doctor === 'string' 
                ? apt.doctor 
                : apt.doctor._id?.toString();
              
              return doctorIds.includes(doctorId);
            }
            
            if (apt.doctorId) {
              const doctorId = typeof apt.doctorId === 'string' 
                ? apt.doctorId 
                : apt.doctorId._id?.toString();
              
              return doctorIds.includes(doctorId);
            }
            
            return false;
          });
        }
        
        return false;
      });
      
      console.log(`Found ${filteredPatients.length} patients in fallback approach`);
      
      if (filteredPatients.length > 0) {
        patients = filteredPatients;
        
        // Update these patients to have the correct hospital
        for (const patient of filteredPatients) {
          await Patient.updateOne(
            { _id: patient._id },
            { $set: { hospital: hospitalId } }
          );
        }
        
        console.log(`Updated ${filteredPatients.length} patients with hospital information`);
      }
    }
    
    // Get all doctors in this hospital for reference
    const Doctor = require('../models/Doctor');
    const doctorsInHospital = await Doctor.find({ hospitalId })
      .populate('userId')
      .lean();
    
    const doctorMap = new Map();
    doctorsInHospital.forEach(doc => {
      doctorMap.set(doc._id.toString(), {
        _id: doc._id,
        name: doc.userId?.name || 'Unknown Doctor',
        specialization: doc.specialization || 'Specialist'
      });
    });
    
    // Format the response to match the frontend interface
    const formattedPatients = patients.map(patient => {
      // Find appointments for this patient from the appointments we fetched
      const patientAppointments = hospitalAppointments
        .filter(apt => {
          const aptPatientId = typeof apt.patientId === 'string' 
            ? apt.patientId 
            : apt.patientId?._id?.toString();
          return aptPatientId === patient._id.toString();
        })
        .map(apt => {
          // Get doctor details from our map
          let doctorDetails = null;
          if (apt.doctorId) {
            const doctorId = typeof apt.doctorId === 'string' 
              ? apt.doctorId 
              : apt.doctorId._id?.toString();
            doctorDetails = doctorMap.get(doctorId) || null;
          }
          
          return {
            _id: apt._id,
            date: apt.date,
            time: apt.time,
            status: apt.status,
            doctor: doctorDetails,
            doctorId: doctorDetails
          };
        });
      
      // Combine with any existing appointments in the patient record
      const combinedAppointments = [
        ...(patient.appointments || []),
        ...patientAppointments
      ];
      
      // Remove duplicates by appointment ID
      const uniqueAppointments = [];
      const appointmentIds = new Set();
      
      combinedAppointments.forEach(apt => {
        const aptId = apt._id?.toString();
        if (aptId && !appointmentIds.has(aptId)) {
          appointmentIds.add(aptId);
          uniqueAppointments.push(apt);
        }
      });
      
      // Get primary doctor information if available
      let primaryDoctorInfo = patient.primaryDoctor || null;
      if (patient.primaryDoctor) {
        const primaryDoctorId = typeof patient.primaryDoctor === 'string' 
          ? patient.primaryDoctor 
          : patient.primaryDoctor._id?.toString();
        
        const doctorDetails = doctorMap.get(primaryDoctorId);
        if (doctorDetails) {
          primaryDoctorInfo = doctorDetails;
        }
      }
      
      return {
        _id: patient._id,
        name: patient.name,
        email: patient.email,
        phone: patient.phone || patient.emergencyContact?.phone || 'N/A',
        age: patient.age || 0,
        gender: patient.gender || 'unknown',
        bloodGroup: patient.bloodGroup || 'Unknown',
        medicalHistory: patient.medicalHistory || [],
        appointments: uniqueAppointments,
        allergies: patient.allergies || [],
        emergencyContact: patient.emergencyContact || {
          name: '',
          relationship: '',
          phone: patient.phone || ''
        },
        status: patient.status || 'active',
        hospital: patient.hospital,
        hospitalId: patient.hospital?._id,
        dateOfBirth: patient.dateOfBirth || ''
      };
    });
    
    console.log('Total formatted patients:', formattedPatients.length);
    res.json(formattedPatients);
  } catch (error) {
    console.error('Error fetching patients by hospital:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: error.message 
    });
  }
});

// @desc    Search patients by name, email, or phone
// @route   GET /api/patients/search
// @access  Private
const searchPatients = asyncHandler(async (req, res) => {
  try {
    const { query, hospitalId } = req.query;
    
    console.log('Searching patients with query:', query, 'hospitalId:', hospitalId);
    
    if (!query) {
      return res.status(400).json({ message: 'Search query is required' });
    }
    
    // Create a query object to search by name, email or phone
    const searchQuery = {
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
        { phone: { $regex: query, $options: 'i' } }
      ]
    };
    
    // If hospitalId is provided, add it to the query
    if (hospitalId) {
      searchQuery.hospital = hospitalId;
    }
    
    // Find patients matching the search criteria
    const patients = await Patient.find(searchQuery)
      .select('_id name email phone age gender bloodGroup allergies medicalHistory dateOfBirth')
      .limit(10)
      .lean();
    
    console.log(`Found ${patients.length} patients matching query`);
    
    res.json(patients);
  } catch (error) {
    console.error('Error searching patients:', error);
    res.status(500).json({ 
      message: 'Error searching patients',
      error: error.message 
    });
  }
});

// @desc    Get patients by doctor
// @route   GET /api/patients/doctor/:doctorId
// @access  Private
const getPatientsByDoctor = asyncHandler(async (req, res) => {
  try {
    const doctorId = req.params.doctorId;
    
    if (!doctorId) {
      return res.status(400).json({ message: 'Doctor ID is required' });
    }
    
    console.log('Fetching patients for doctor:', doctorId);
    
    // Method 1: Get patients who have the doctor as primaryDoctor
    let patients = await Patient.find({ primaryDoctor: doctorId })
      .populate('hospital')
      .lean();
    
    console.log('Patients with primary doctor:', patients.length);
    
    // Method 2: Find patients who have appointments with this doctor
    const Appointment = require('../models/Appointment');
    
    // Get all appointments for this doctor
    const doctorAppointments = await Appointment.find({ doctorId })
      .populate('patientId')
      .lean();
    
    console.log('Appointments for this doctor:', doctorAppointments.length);
    
    // Extract unique patient IDs from appointments
    const patientIdsFromAppointments = doctorAppointments
      .filter(apt => apt.patientId) // Filter out null patientIds
      .map(apt => {
        // Handle both string and object format
        return typeof apt.patientId === 'string' ? apt.patientId : apt.patientId._id;
      })
      .filter(id => id); // Filter out undefined/null values
    
    // Remove duplicates
    const uniquePatientIds = [...new Set(patientIdsFromAppointments)];
    console.log('Unique patients from appointments:', uniquePatientIds.length);
    
    // Get these patients excluding those already fetched
    const existingPatientIds = patients.map(p => p._id.toString());
    const newPatientIds = uniquePatientIds.filter(
      id => id && !existingPatientIds.includes(id.toString())
    );
    
    console.log('New patients to add:', newPatientIds.length);
    
    if (newPatientIds.length > 0) {
      // Fetch the additional patients
      const additionalPatients = await Patient.find({
        _id: { $in: newPatientIds }
      })
        .populate('hospital')
        .lean();
      
      console.log('Additional patients fetched:', additionalPatients.length);
      patients = [...patients, ...additionalPatients];
    }
    
    // Get the doctor's details and hospital
    const Doctor = require('../models/Doctor');
    const doctor = await Doctor.findById(doctorId)
      .populate('userId')
      .populate('hospitalId')
      .lean();
    
    if (!doctor) {
      console.log('Doctor not found:', doctorId);
      return res.status(404).json({ message: 'Doctor not found' });
    }
    
    const doctorInfo = {
      _id: doctor._id,
      name: doctor.userId?.name || 'Unknown Doctor',
      specialization: doctor.specialization || 'Specialist',
      hospitalId: doctor.hospitalId || null
    };
    
    const hospitalId = doctor.hospitalId?._id;
    const hospitalName = doctor.hospitalId?.name || 'Unknown Hospital';
    
    // Format the response to match the frontend interface
    const formattedPatients = patients.map(patient => {
      // Find appointments for this patient with this doctor
      const patientAppointments = doctorAppointments
        .filter(apt => {
          const aptPatientId = typeof apt.patientId === 'string' 
            ? apt.patientId 
            : apt.patientId?._id?.toString();
          return aptPatientId === patient._id.toString();
        })
        .map(apt => ({
          _id: apt._id,
          date: apt.date,
          time: apt.time,
          status: apt.status,
          doctor: doctorInfo,
          doctorId: doctorInfo
        }));
      
      // Combine with existing appointments
      const combinedAppointments = [
        ...(patient.appointments || []),
        ...patientAppointments
      ];
      
      // Remove duplicate appointments
      const uniqueAppointments = [];
      const appointmentIds = new Set();
      
      combinedAppointments.forEach(apt => {
        const aptId = apt._id?.toString();
        if (aptId && !appointmentIds.has(aptId)) {
          appointmentIds.add(aptId);
          uniqueAppointments.push(apt);
        }
      });
      
      // Get primary doctor information if available
      let primaryDoctorInfo = patient.primaryDoctor === doctorId ? doctorInfo : null;
      
      return {
        _id: patient._id,
        name: patient.name,
        email: patient.email,
        phone: patient.phone || patient.emergencyContact?.phone || 'N/A',
        age: patient.age || 0,
        gender: patient.gender || 'unknown',
        bloodGroup: patient.bloodGroup || 'Unknown',
        medicalHistory: patient.medicalHistory || [],
        appointments: uniqueAppointments,
        allergies: patient.allergies || [],
        emergencyContact: patient.emergencyContact || {
          name: '',
          relationship: '',
          phone: patient.phone || ''
        },
        status: patient.status || 'active',
        hospital: patient.hospital,
        hospitalId: patient.hospital?._id,
        dateOfBirth: patient.dateOfBirth || ''
      };
    });
    
    console.log('Total formatted patients for doctor:', formattedPatients.length);
    res.json(formattedPatients);
  } catch (error) {
    console.error('Error fetching patients by doctor:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: error.message 
    });
  }
});

// @desc    Get total patients count
// @route   GET /api/patients/count
// @access  Private
const getTotalPatientsCount = asyncHandler(async (req, res) => {
  try {
    // Count all patients
    const totalCount = await Patient.countDocuments();
    
    // Get all patients for debugging
    const allPatients = await Patient.find().lean();
    
    console.log(`Total patients count from countDocuments: ${totalCount}`);
    console.log(`Total patients from find().lean(): ${allPatients.length}`);
    console.log(`Patient IDs: ${allPatients.map(p => p._id).join(', ')}`);
    
    res.json({ count: totalCount });
  } catch (error) {
    console.error('Error fetching total patients count:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: error.message 
    });
  }
});

// Export all controller functions
module.exports = {
  createOrUpdatePatient,
  getPatients,
  getPatientById,
  updatePatient,
  deletePatient,
  getPatientsByHospital,
  searchPatients,
  getPatientsByDoctor,
  getTotalPatientsCount
}; 