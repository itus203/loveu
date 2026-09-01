const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { registerDonor, getDonors, toggleAvailability, getMyDonorProfile, getRequests, postRequest, deleteRequest, updateRequest } = require('../controllers/bloodController');
router.post('/register', auth, registerDonor);
// 🌍 GLOBAL: Blood donors & requests visible to all DIU students — no auth for read
router.get('/donors', getDonors);
router.get('/requests', getRequests);
router.get('/my-profile', auth, getMyDonorProfile);
router.put('/toggle-availability', auth, toggleAvailability);
router.post('/requests', auth, postRequest);
router.put('/requests/:id', auth, updateRequest);
router.delete('/requests/:id', auth, deleteRequest);
module.exports = router;
