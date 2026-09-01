const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { getDepartments, getDepartmentFeed, getDepartmentMembers } = require('../controllers/departmentController');
router.get('/', auth, getDepartments);
router.get('/:department/members', auth, getDepartmentMembers);
router.get('/:department/feed', auth, getDepartmentFeed);
module.exports = router;
