const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { getAlumni, updateAlumniProfile } = require('../controllers/alumniController');
router.get('/', auth, getAlumni);
router.put('/profile', auth, updateAlumniProfile);
module.exports = router;
