const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Doctor = require('./Doctor');
const Staff = require('./Staff'); // Add Staff model import

const userSchema = mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name']
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  gender: {
    type: String,
    required: [true, 'Please specify gender'],
    enum: ['male', 'female', 'other']
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  hospital: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    default: null
  },
  role: {
    type: String,
    enum: ['patient', 'doctor', 'staff', 'admin'],
    default: 'staff'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  isOnboarded: {
    type: Boolean,
    default: false,
    description: 'Indicates if the user was added via CSV onboarding'
  },
  hasSetPassword: {
    type: Boolean,
    default: true,
    description: 'Indicates if the user has set their own password'
  },
  specialization: {
    type: String,
    required: function() {
      return this.role === 'doctor';
    }
  },
  phone: String,
  address: String,
  profileImage: String
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Create or update doctor entry when user role changes to doctor
userSchema.pre('save', async function(next) {
  // Check if role is being modified and new role is doctor
  if (this.isModified('role') && this.role === 'doctor') {
    try {
      // Check if doctor entry already exists
      const existingDoctor = await Doctor.findOne({ userId: this._id });
      
      // If doctor entry doesn't exist AND this is not being onboarded via CSV
      // (CSV onboarding creates doctor entry separately in the controller)
      if (!existingDoctor && (!this.isOnboarded || !this.isNew)) {
        // Create new doctor entry
        await Doctor.create({
          userId: this._id,
          specialization: this.specialization || 'General Medicine',
          hospitalId: this.hospital,
          qualifications: [],
          experience: 0,
          fees: 0,
          availability: [],
          rating: 0,
          reviews: []
        });
        console.log(`Created doctor entry for user: ${this.name}`);
      } else if (existingDoctor) {
        // Update existing doctor entry only if it exists
        existingDoctor.specialization = this.specialization || existingDoctor.specialization;
        existingDoctor.hospitalId = this.hospital;
        await existingDoctor.save();
        console.log(`Updated doctor entry for user: ${this.name}`);
      }
    } catch (error) {
      console.error('Error managing doctor entry:', error);
      // Don't throw error to prevent blocking user save
    }
  }
  next();
});

// Create or update staff entry when user role changes to staff
userSchema.pre('save', async function(next) {
  // Check if role is being modified and new role is staff
  if (this.isModified('role') && this.role === 'staff') {
    try {
      // Check if staff entry already exists
      const existingStaff = await Staff.findOne({ userId: this._id });
      
      if (!existingStaff && (!this.isOnboarded || !this.isNew)) {
        // Create new staff entry
        const staffData = {
          userId: this._id,
          hospital: this.hospital,
          department: 'Administration', // Valid department from enum
          shift: 'Full Day (9 AM - 5 PM)', // Valid shift from enum
          joiningDate: this.createdAt || new Date(),
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
        };

        const staffProfile = await Staff.create(staffData);
        console.log(`Created staff entry for user: ${this.name} (${staffProfile.employeeId})`);
      } else {
        // Update existing staff entry
        existingStaff.hospital = this.hospital;
        await existingStaff.save();
        console.log(`Updated staff entry for user: ${this.name}`);
      }
    } catch (error) {
      console.error('Error managing staff entry:', error);
      // Don't throw error to prevent blocking user save
    }
  }
  next();
});

// Method to check password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);
module.exports = User; 