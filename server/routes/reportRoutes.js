const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const ctrl = require('../controllers/reportController');

// Generic report — any content type
router.post('/', auth, ctrl.reportContent);
router.post('/:type/:id', auth, (req, res) => {
  req.body.target_type = req.params.type;
  req.body.target_id = req.params.id;
  return ctrl.reportContent(req, res);
});

module.exports = router;
