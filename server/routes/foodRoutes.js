const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { getVendors, getVendorMenu, reviewVendor, deleteReview, voteReview, addVendor, updateVendor, deleteVendor, addMenuItem, updateMenuItem, deleteMenuItem } = require('../controllers/foodController');
// 🌍 GLOBAL: Food vendors visible to all DIU students — no auth for read
router.get('/vendors', getVendors);
router.get('/vendors/:id', getVendorMenu);
router.post('/vendors/:id/review', auth, reviewVendor);
router.post('/vendors/:id/vote', auth, voteReview);
router.delete('/vendors/:id/review', auth, deleteReview);
router.delete('/vendors/:id/review/:uid', auth, deleteReview);
router.post('/vendors', auth, require('../middleware/uploadMiddleware').single('image'), addVendor);
router.put('/vendors/:id', auth, require('../middleware/uploadMiddleware').single('image'), updateVendor);
router.delete('/vendors/:id', auth, deleteVendor);
router.post('/items', auth, addMenuItem);
router.put('/items/:id', auth, updateMenuItem);
router.delete('/items/:id', auth, deleteMenuItem);
module.exports = router;
