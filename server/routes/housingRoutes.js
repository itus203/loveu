const router=require('express').Router();
const auth=require('../middleware/authMiddleware');
const upload=require('../middleware/uploadMiddleware');
const ctrl=require('../controllers/housingController');
// 🌍 GLOBAL: Housing visible to all DIU students — no auth for read
router.get('/', ctrl.getHouses);
router.get('/:id/reviews', ctrl.getReviews);
router.post('/', auth, upload.single('image'), ctrl.postHouse);
router.put('/:id', auth, upload.single('image'), ctrl.updateHouse);
router.delete('/:id', auth, ctrl.deleteHouse);
router.post('/:id/reviews', auth, ctrl.addReview);
router.delete('/:id/reviews/:rid', auth, ctrl.deleteReview);
module.exports=router;
