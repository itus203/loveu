const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { search } = require('../controllers/searchController');
router.get('/', auth, search);
module.exports = router;
