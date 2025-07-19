const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  hospital: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true
  },
  department: {
    type: String,
    required: true,
    enum: [
      'Reception', 
      'Pharmacy', 
      'Administration', 
      'Nursing', 
      'Laboratory',
      'Radiology'
    ]
  },
  shift: {
    type: String,
    required: true,
    enum: [
      'Morning (6 AM - 2 PM)', 
      'Afternoon (2 PM - 10 PM)', 
      'Night (10 PM - 6 AM)',
      'Full Day (9 AM - 5 PM)'
    ]
  },
  employeeId: {
    type: String,
    required: true,
    unique: true
  },
  joiningDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  emergencyContact: {
    name: {
      type: String,
      required: true
    },
    relationship: {
      type: String,
      required: true
    },
    phone: {
      type: String,
      required: true
    }
  },
  address: {
    street: String,
    city: String,
    state: String,
    postalCode: String,
    country: String
  },
  qualifications: [{
    degree: String,
    institution: String,
    year: Number
  }],
  experience: [{
    organization: String,
    position: String,
    startDate: Date,
    endDate: Date,
    description: String
  }],
  documents: [{
    type: {
      type: String,
      enum: ['id', 'certificate', 'resume', 'other']
    },
    name: String,
    url: String,
    uploadDate: {
      type: Date,
      default: Date.now
    }
  }],
  skills: [String],
  status: {
    type: String,
    enum: ['active', 'on-leave', 'terminated'],
    default: 'active'
  },
  leaveBalance: {
    sick: {
      type: Number,
      default: 12
    },
    casual: {
      type: Number,
      default: 12
    },
    annual: {
      type: Number,
      default: 20
    }
  }
}, {
  timestamps: true
});

// Create indexes for efficient querying
staffSchema.index({ userId: 1, hospital: 1 });
staffSchema.index({ employeeId: 1 });
staffSchema.index({ department: 1 });

// Auto-generate employee ID before saving
staffSchema.pre('save', async function(next) {
  try {
    if (this.isNew && !this.employeeId) {
      const currentYear = new Date().getFullYear().toString().substr(-2);
      // Handle case where department might be missing or too short
      let departmentCode = 'ADM'; // Default code
      if (this.department && this.department.length >= 3) {
        departmentCode = this.department.substr(0, 3).toUpperCase();
      }
      
      // Get the hospital ID's last 4 characters to make the ID unique per hospital
      let hospitalIdSuffix = '0000';
      if (this.hospital) {
        hospitalIdSuffix = this.hospital.toString().substr(-4);
      }
      
      // Count staff in THIS hospital only
      let count = 0;
      try {
        count = await this.constructor.countDocuments({ hospital: this.hospital });
      } catch (countError) {
        console.error('Error counting staff:', countError);
        // Fallback to a random number if counting fails
        count = Math.floor(Math.random() * 1000);
      }
      
      // Include hospital ID suffix in the employee ID to ensure uniqueness across hospitals
      this.employeeId = `${currentYear}${departmentCode}${hospitalIdSuffix}${(count + 1).toString().padStart(4, '0')}`;
      console.log(`Generated employee ID: ${this.employeeId}`);
    }
    next();
  } catch (error) {
    console.error('Error generating employee ID:', error);
    // Fallback to a random ID if all else fails
    if (!this.employeeId) {
      const random = Math.random().toString(36).substring(2, 8).toUpperCase();
      this.employeeId = `EMP${random}`;
      console.log(`Generated fallback employee ID: ${this.employeeId}`);
    }
    next();
  }
});

module.exports = mongoose.model('Staff', staffSchema); 