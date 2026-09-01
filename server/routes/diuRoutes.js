const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const ctrl = require('../controllers/diuController');

// DIU Routine proxy
router.get('/routine', auth, ctrl.getRoutine);

// BLC Moodle - get token
router.post('/blc-token', auth, ctrl.getBLCToken);

// BLC Moodle - get courses
router.get('/blc-courses', auth, ctrl.getBLCCourses);

// Student Portal proxy
router.get('/portal-proxy', auth, ctrl.portalProxy);

module.exports = router;
