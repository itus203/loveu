const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { uploadFile, getMyFiles, deleteFile } = require('../controllers/cloudFileController');

router.post('/', auth, upload.single('file'), uploadFile);
router.get('/', auth, getMyFiles);
router.delete('/:id', auth, deleteFile);

module.exports = router;
