const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true
  },
  title: {
    type: String,
    enum: ['Dr', 'Mr', 'Mrs', 'Ms'],
    default: 'Dr'
  },
  surName: {
    type: String,
    default: ''
  },
  middleName: {
    type: String,
    default: ''
  },
  dateOfBirth: {
    type: String,
    default: ''
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', ''],
    default: ''
  },
  mobile: {
    type: String,
    default: ''
  },
  city: {
    type: String,
    default: ''
  },
  localAddress: {
    type: String,
    default: ''
  },
  permanentAddress: {
    type: String,
    default: ''
  },
  specialization: {
    type: String,
    required: true
  },
  qualification: {
    type: String,
    default: ''
  },
  institute: {
    type: String,
    default: ''
  },
  passingYear: {
    type: String,
    default: ''
  },
  registrationId: {
    type: String,
    default: ''
  },
  aadharNumber: {
    type: String,
    default: ''
  },
  panNumber: {
    type: String,
    default: ''
  },
  joiningDate: {
    type: String,
    default: ''
  },
  qualifications: [{
    degree: String,
    institution: String,
    year: Number
  }],
  experience: {
    type: Number,
    required: true,
    default: 0
  },
  fees: {
    type: Number,
    required: true,
    default: 0
  },
  availability: {
    days: {
      type: [String],
      default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    },
    hours: {
      type: String,
      default: '09:00 AM - 05:00 PM'
    }
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  appointments: {
    type: Number,
    default: 0
  },
  patients: {
    type: Number,
    default: 0
  },
  reviews: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: String,
    date: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Add a method to update appointment and patient counts
doctorSchema.methods.updateCounts = async function() {
  const Appointment = mongoose.model('Appointment');
  
  // Get appointment count
  const appointmentCount = await Appointment.countDocuments({
    doctorId: this._id,
    status: { $in: ['completed', 'confirmed'] }
  });

  // Get unique patients count
  const uniquePatients = await Appointment.distinct('patientId', {
    doctorId: this._id,
    status: { $in: ['completed', 'confirmed'] }
  });

  // Update counts
  this.appointments = appointmentCount;
  this.patients = uniquePatients.length;
  
  await this.save();
};

// Add a method to update rating
doctorSchema.methods.updateRating = async function() {
  if (this.reviews && this.reviews.length > 0) {
    const totalRating = this.reviews.reduce((sum, review) => sum + review.rating, 0);
    this.rating = (totalRating / this.reviews.length).toFixed(1);
    await this.save();
  }
};

module.exports = mongoose.model('Doctor', doctorSchema); 