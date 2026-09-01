const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { processAi } = require('../controllers/aiController');

router.post('/process', auth, processAi);

module.exports = router;
