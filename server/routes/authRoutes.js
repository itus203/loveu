const router = require('express').Router();
const { register, login, verifyOtp, resendOtp } = require('../controllers/authController');
router.post('/register', register);
router.post('/login', login);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
module.exports = router;
