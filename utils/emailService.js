const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendAppointmentEmail = async (userEmail, appointment) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: 'Appointment Confirmation',
      html: `
        <h1>Appointment Confirmation</h1>
        <p>Your appointment has been scheduled for ${appointment.date} at ${appointment.time}.</p>
        <p>Type: ${appointment.type}</p>
        <p>Status: ${appointment.status}</p>
        <p>Notes: ${appointment.notes || 'No notes provided'}</p>
      `
    });
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

module.exports = { sendAppointmentEmail }; 