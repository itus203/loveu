const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { createInternship, getInternships, deleteInternship, verifyInternship, updateInternship } = require('../controllers/internshipController');
// 🌍 GLOBAL: Internships visible to all DIU students — no auth for browse
router.get('/', getInternships);
router.post('/', auth, createInternship);
router.put('/:id', auth, updateInternship);
router.delete('/:id', auth, deleteInternship);
router.put('/:id/verify', auth, verifyInternship);
module.exports = router;
