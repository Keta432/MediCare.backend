const mongoose = require('mongoose');
const path = require('path');
const User = require('../models/User');
const Staff = require('../models/Staff');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const migrateStaffUsers = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB...');

    // Find all users with role 'staff'
    const staffUsers = await User.find({ role: 'staff' });
    console.log(`Found ${staffUsers.length} staff users to migrate...`);

    // Create staff profiles for each user
    for (const user of staffUsers) {
      try {
        // Check if staff profile already exists
        const existingStaff = await Staff.findOne({ userId: user._id });
        
        if (!existingStaff) {
          // Create new staff profile
          const staffProfile = await Staff.create({
            userId: user._id,
            hospital: user.hospital,
            department: 'admin', // Default department
            shift: 'morning', // Default shift
            joiningDate: user.createdAt || new Date(),
            emergencyContact: {
              name: 'Emergency Contact',
              relationship: 'Not Specified',
              phone: 'Not Specified'
            },
            address: {
              street: '',
              city: '',
              state: '',
              postalCode: '',
              country: ''
            },
            qualifications: [],
            experience: [],
            documents: [],
            skills: [],
            status: 'active',
            leaveBalance: {
              sick: 12,
              casual: 12,
              annual: 20
            }
          });

          console.log(`Created staff profile for user: ${user.name} (${staffProfile.employeeId})`);
        } else {
          console.log(`Staff profile already exists for user: ${user.name}`);
        }
      } catch (userError) {
        console.error(`Error processing user ${user.name}:`, userError.message);
      }
    }

    console.log('Staff migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error during migration:', error);
    process.exit(1);
  }
};

migrateStaffUsers(); 