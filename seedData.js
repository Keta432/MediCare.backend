const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import models
const User = require('./models/User');
const Doctor = require('./models/Doctor');
const Patient = require('./models/Patient');
const Hospital = require('./models/Hospital');
const Appointment = require('./models/Appointment');
const Inventory = require('./models/Inventory');
const Notification = require('./models/Notification');
const Task = require('./models/Task');
const Report = require('./models/Report');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected...');
  } catch (err) {
    console.error('Error connecting to MongoDB:', err.message);
    process.exit(1);
  }
};

const clearDatabase = async () => {
  await Promise.all([
    User.deleteMany({}),
    Doctor.deleteMany({}),
    Patient.deleteMany({}),
    Hospital.deleteMany({}),
    Appointment.deleteMany({}),
    Inventory.deleteMany({}),
    Notification.deleteMany({}),
    Task.deleteMany({}),
    Report.deleteMany({})
  ]);
  console.log('Database cleared');
};

const seedHospitals = async () => {
  const timestamp = Date.now();
  
  // Default hospital logo if image is not available
  const defaultHospitalLogo = 'https://img.freepik.com/free-vector/hospital-logo-design-vector-medical-cross_53876-136743.jpg';
  
  const hospitals = await Hospital.create([
    {
      name: 'Metro General Hospital',
      address: '789 Park Road, Metro City',
      phone: '555-123-4567',
      email: `${timestamp}_metro@hospital.com`,
      type: 'General',
      facilities: ['Emergency', 'Surgery', 'Oncology', 'Radiology'],
      description: 'Modern hospital with state-of-the-art facilities',
      contact: '555-123-4567',
      image: 'https://img.freepik.com/free-photo/modern-hospital-building-with-glass-windows_1127-3062.jpg',
      specialties: ['Emergency Medicine', 'Surgery', 'Oncology', 'Radiology']
    },
    {
      name: 'Valley Medical Center',
      address: '321 Valley Drive, Riverside',
      phone: '555-987-6543',
      email: `${timestamp}_valley@hospital.com`,
      type: 'Specialty',
      facilities: ['Cardiology', 'Neurology', 'Pediatrics', 'Rehabilitation'],
      description: 'Specialized care center with focus on cardiac and neurological treatments',
      contact: '555-987-6543',
      image: 'https://img.freepik.com/free-photo/hospital-building-modern-parking-lot_1127-3480.jpg',
      specialties: ['Cardiology', 'Neurology', 'Pediatrics', 'Rehabilitation']
    }
  ]).catch(async err => {
    if (err.code === 11000) {
      // If hospitals already exist, fetch them and ensure they have images
      const existingHospitals = await Hospital.find().limit(2);
      
      // Update hospitals without images to use the default logo
      for (const hospital of existingHospitals) {
        if (!hospital.image) {
          await Hospital.findByIdAndUpdate(hospital._id, {
            image: defaultHospitalLogo
          });
        }
      }
      
      return existingHospitals;
    }
    throw err;
  });
  
  console.log('Hospitals processed');
  return hospitals;
};

const seedUsers = async (hospitals) => {
  const hashedPassword = await bcrypt.hash('password123', 10);
  const timestamp = Date.now();
  
  const userData = [
    // Admin Users
    {
      name: 'Admin User 2',
      email: `${timestamp}_admin2@example.com`,
      password: hashedPassword,
      role: 'admin',
      gender: 'male',
      hospital: hospitals[0]._id,
      status: 'active'
    },
    {
      name: 'Senior Admin 2',
      email: `${timestamp}_senior.admin2@example.com`,
      password: hashedPassword,
      role: 'admin',
      gender: 'female',
      hospital: hospitals[1]._id,
      status: 'active'
    },

    // Doctors - Hospital 1 (City General)
    {
      name: 'Dr. James Wilson',
      email: `${timestamp}_dr.wilson@example.com`,
      password: hashedPassword,
      role: 'doctor',
      gender: 'male',
      hospital: hospitals[0]._id,
      specialization: 'ENT',
      status: 'active'
    },
    {
      name: 'Dr. Maria Rodriguez',
      email: `${timestamp}_dr.rodriguez@example.com`,
      password: hashedPassword,
      role: 'doctor',
      gender: 'female',
      hospital: hospitals[0]._id,
      specialization: 'Gynecology',
      status: 'active'
    },

    // Doctors - Hospital 2
    {
      name: 'Dr. David Kim',
      email: `${timestamp}_dr.kim@example.com`,
      password: hashedPassword,
      role: 'doctor',
      gender: 'male',
      hospital: hospitals[1]._id,
      specialization: 'Urology',
      status: 'active'
    },
    {
      name: 'Dr. Rachel Green',
      email: `${timestamp}_dr.green@example.com`,
      password: hashedPassword,
      role: 'doctor',
      gender: 'female',
      hospital: hospitals[1]._id,
      specialization: 'Ophthalmology',
      status: 'active'
    },

    // Staff Members - Hospital 1
    {
      name: 'Thomas Anderson',
      email: `${timestamp}_nurse.anderson@example.com`,
      password: hashedPassword,
      role: 'staff',
      gender: 'male',
      hospital: hospitals[0]._id,
      status: 'active'
    },
    {
      name: 'Linda Martinez',
      email: `${timestamp}_lab.martinez@example.com`,
      password: hashedPassword,
      role: 'staff',
      gender: 'female',
      hospital: hospitals[0]._id,
      status: 'active'
    },

    // Staff Members - Hospital 2
    {
      name: 'Robert Clark',
      email: `${timestamp}_tech.clark@example.com`,
      password: hashedPassword,
      role: 'staff',
      gender: 'male',
      hospital: hospitals[1]._id,
      status: 'active'
    },

    // Patients (as staff) - Hospital 1
    {
      name: 'Alice Johnson',
      email: `${timestamp}_patient.alice@example.com`,
      password: hashedPassword,
      role: 'staff',  // Changed from 'patient' to 'staff'
      gender: 'female',
      hospital: hospitals[0]._id,
      status: 'active'
    },
    {
      name: 'Michael Chang',
      email: `${timestamp}_patient.chang@example.com`,
      password: hashedPassword,
      role: 'staff',  // Changed from 'patient' to 'staff'
      gender: 'male',
      hospital: hospitals[0]._id,
      status: 'active'
    },

    // Patients (as staff) - Hospital 2
    {
      name: 'Sarah Williams',
      email: `${timestamp}_patient.williams@example.com`,
      password: hashedPassword,
      role: 'staff',  // Changed from 'patient' to 'staff'
      gender: 'female',
      hospital: hospitals[1]._id,
      status: 'active'
    }
  ];
  
  const users = await User.create(userData);
  console.log('Additional users seeded');
  return users;
};

const seedDoctors = async (users) => {
  const doctorUsers = users.filter(user => user.role === 'doctor');
  
  await Promise.all(doctorUsers.map(async (doctor) => {
    await Doctor.create({
      userId: doctor._id,
      specialization: doctor.specialization,
      qualifications: [{
        degree: 'MD',
        institution: 'Medical University',
        year: 2015
      }],
      experience: 5,
      fees: 100,
      availability: [{
        day: new Date(),
        slots: ['09:00', '10:00', '11:00']
      }]
    });
  }));
  
  console.log('Doctors seeded');
};

const seedPatients = async (users) => {
  // Modified to find users that should be patients (based on email pattern)
  const patientUsers = users.filter(user => user.email.includes('patient.'));
  
  const patientData = [
    {
      medicalHistory: [{
        condition: 'Hypertension',
        diagnosis: 'Stage 1',
        treatment: 'Medication - Amlodipine'
      }],
      allergies: ['Peanuts'],
      bloodGroup: 'O+',
      age: 45
    },
    {
      medicalHistory: [{
        condition: 'Type 2 Diabetes',
        diagnosis: 'Controlled',
        treatment: 'Metformin, Diet control'
      }, {
        condition: 'Asthma',
        diagnosis: 'Mild',
        treatment: 'Inhaler as needed'
      }],
      allergies: ['Penicillin', 'Dust'],
      bloodGroup: 'A+',
      age: 52
    },
    {
      medicalHistory: [{
        condition: 'Migraine',
        diagnosis: 'Chronic',
        treatment: 'Sumatriptan'
      }],
      allergies: ['Shellfish'],
      bloodGroup: 'B-',
      age: 29
    },
    {
      medicalHistory: [{
        condition: 'Arthritis',
        diagnosis: 'Rheumatoid Arthritis',
        treatment: 'NSAIDs, Physical Therapy'
      }, {
        condition: 'Osteoporosis',
        diagnosis: 'Early stage',
        treatment: 'Calcium supplements'
      }],
      allergies: ['Sulfa drugs'],
      bloodGroup: 'AB+',
      age: 65
    },
    {
      medicalHistory: [{
        condition: 'Anxiety',
        diagnosis: 'Generalized Anxiety Disorder',
        treatment: 'Counseling, Meditation'
      }],
      allergies: [],
      bloodGroup: 'O-',
      age: 31
    }
  ];

  await Promise.all(patientUsers.map(async (patient, index) => {
    await Patient.create({
      user: patient._id,
      gender: patient.gender,
      ...patientData[index]
    });
  }));
  
  console.log('Patients seeded');
};

const seedAppointments = async (users) => {
  const doctors = users.filter(user => user.role === 'doctor');
  const patients = users.filter(user => user.role === 'patient');
  
  // Only create appointments if we have both doctors and patients
  if (doctors.length === 0 || patients.length === 0) {
    console.log('Skipping appointments - insufficient users');
    return;
  }

  const appointmentData = [
    {
      doctorId: doctors[0]._id,
      patientId: patients[0]._id,
      date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
      time: '10:00',
      type: 'consultation',
      status: 'pending',
      notes: 'Initial consultation'
    }
  ];

  if (doctors.length > 1 && patients.length > 1) {
    appointmentData.push({
      doctorId: doctors[1]._id,
      patientId: patients[1]._id,
      date: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000), // 6 days from now
      time: '14:30',
      type: 'followup',
      status: 'confirmed',
      notes: 'Follow-up appointment'
    });
  }

  await Appointment.create(appointmentData);
  console.log('Additional appointments seeded');
};

const seedInventory = async (hospitals) => {
  await Inventory.create([
    {
      hospital: hospitals[0]._id,
      name: 'Surgical Masks',
      category: 'PPE',
      quantity: 5000,
      unit: 'pieces',
      minQuantity: 1000,
      supplier: 'MedSupply Co',
      expiryDate: new Date('2025-12-31'),
      location: 'Storage Room B - Section 1'
    },
    {
      hospital: hospitals[0]._id,
      name: 'Blood Pressure Monitor',
      category: 'Equipment',
      quantity: 20,
      unit: 'units',
      minQuantity: 5,
      supplier: 'MedTech Inc',
      expiryDate: null,
      location: 'Equipment Storage - Floor 2'
    }
  ]);
  
  console.log('Additional inventory items seeded');
};

const seedNotifications = async (users) => {
  const staffUsers = users.filter(user => user.role === 'staff');
  const doctorUsers = users.filter(user => user.role === 'doctor');

  const notifications = [];

  if (staffUsers.length > 0) {
    notifications.push({
      user: staffUsers[0]._id,
      title: 'Inventory Alert',
      message: 'Low stock alert for surgical masks',
      type: 'warning',
      isRead: false
    });
  }

  if (doctorUsers.length > 0) {
    notifications.push({
      user: doctorUsers[0]._id,
      title: 'New Appointment',
      message: 'You have a new appointment scheduled',
      type: 'info',
      isRead: false
    });
  }

  if (notifications.length > 0) {
    await Notification.create(notifications);
  }
  
  console.log('Additional notifications seeded');
};

const seedTasks = async (users) => {
  const adminUser = users.find(user => user.role === 'admin');
  const staffUser = users.find(user => user.role === 'staff');

  await Task.create([
    {
      assignedTo: staffUser._id,
      assignedBy: adminUser._id,
      department: 'Pharmacy',
      title: 'Update inventory',
      description: 'Perform monthly inventory check',
      priority: 'medium',
      status: 'pending',
      dueDate: new Date('2024-03-01')
    }
  ]);
  
  console.log('Tasks seeded');
};

const seedDatabase = async () => {
  try {
    await connectDB();
    // Remove the clearDatabase call to preserve existing data
    
    // Add timestamp to emails to avoid duplicates
    const timestamp = Date.now();
    const hospitals = await seedHospitals();
    
    // Modify user emails to avoid conflicts
    const users = await seedUsers(hospitals).catch(err => {
      if (err.code === 11000) {
        // If duplicate email error, retry with timestamped emails
        const modifiedUsers = users.map(user => ({
          ...user,
          email: `${timestamp}_${user.email}`
        }));
        return User.create(modifiedUsers);
      }
      throw err;
    });

    await seedDoctors(users);
    await seedPatients(users);
    await seedAppointments(users);
    await seedInventory(hospitals);
    await seedNotifications(users);
    await seedTasks(users);
    
    console.log('Additional data seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding additional data:', error);
    process.exit(1);
  }
};

seedDatabase(); 