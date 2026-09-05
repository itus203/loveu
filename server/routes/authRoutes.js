const router = require('express').Router();
const { register, login, verifyOtp, resendOtp } = require('../controllers/authController');
router.post('/register', register);
router.post('/login', login);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
// diagnostic: check if Gmail env is set (no secret exposed)
router.get('/mail-status', async (req, res) => {
  const hasUser = !!process.env.GMAIL_USER;
  const hasPass = !!process.env.GMAIL_APP_PASSWORD;
  let verifyOk = false, verifyErr = null;
  if (hasUser && hasPass) {
    try {
      const nodemailer = require('nodemailer');
      let pass = process.env.GMAIL_APP_PASSWORD.replace(/\s+/g,'');
      const t = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER, pass }});
      await t.verify();
      verifyOk = true;
    } catch(e){ verifyErr = e.message; }
  }
  res.json({ hasUser, hasPass, passLen: (process.env.GMAIL_APP_PASSWORD||'').replace(/\s+/g,'').length, verifyOk, verifyErr, user: process.env.GMAIL_USER || null });
});
module.exports = router;
