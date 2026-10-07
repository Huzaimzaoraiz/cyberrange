const nodemailer = require('nodemailer');
const settings = require('./config');

const transporter = nodemailer.createTransport({
  host: settings.smtp.host,
  port: settings.smtp.port,
  secure: settings.smtp.port === 465,
  auth: {
    user: settings.smtp.user,
    pass: settings.smtp.pass,
  },
});

async function sendRegistrationOtp(email, otp) {
  if (!settings.smtp.host || !settings.smtp.user) {
    console.warn('SMTP not configured. Skipping email to', email, 'with OTP', otp);
    return;
  }

  try {
    await transporter.sendMail({
      from: `"Cyberrange" <${settings.smtp.from}>`,
      to: email,
      subject: 'Your Registration OTP',
      text: `Your registration code is ${otp}. It will expire in 5 minutes.`,
      html: `<p>Your registration code is <b>${otp}</b>.</p><p>It will expire in 5 minutes.</p>`,
    });
    console.log(`Sent registration OTP to ${email}`);
  } catch (err) {
    console.error('Error sending OTP email:', err);
    throw new Error('Failed to send email');
  }
}

module.exports = {
  sendRegistrationOtp,
};
