const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    required: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  hospitalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: true
  },
  type: {
    type: String,
    enum: ['lab', 'diagnosis', 'prescription', 'invoice'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'processing'],
    default: 'completed'
  },
  reportNumber: {
    type: String,
    required: true,
    unique: true
  },
  diagnosis: {
    type: String,
    required: function() {
      return this.type === 'diagnosis';
    }
  },
  prescription: {
    type: String,
    required: function() {
      return this.type === 'prescription';
    }
  },
  notes: String,
  followUpDate: Date,
  followUpAppointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment'
  },
  conditionImages: {
    type: [String],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Add indexes for better query performance
reportSchema.index({ reportNumber: 1 });
reportSchema.index({ patientId: 1, createdAt: -1 });
reportSchema.index({ doctorId: 1, createdAt: -1 });
reportSchema.index({ type: 1, createdAt: -1 });
reportSchema.index({ status: 1 });
reportSchema.index({ followUpDate: 1 });
reportSchema.index({ followUpAppointmentId: 1 });

const Report = mongoose.model('Report', reportSchema);

module.exports = Report; 