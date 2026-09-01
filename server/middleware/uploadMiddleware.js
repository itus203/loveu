const multer = require('multer');
const path = require('path');
const fs = require('fs');

let storage;
let cloudinary = null;

// ☁️ Cloudinary if configured, fallback to local disk (server/uploads)
if (process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME) {
    try {
        cloudinary = require('cloudinary').v2;
        if (process.env.CLOUDINARY_URL) {
            // cloudinary://api_key:api_secret@cloud_name auto-parsed
        } else {
            cloudinary.config({
                cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
                api_key: process.env.CLOUDINARY_API_KEY,
                api_secret: process.env.CLOUDINARY_API_SECRET,
                secure: true
            });
        }
        const { CloudinaryStorage } = require('multer-storage-cloudinary');
        storage = new CloudinaryStorage({
            cloudinary,
            params: async (req, file) => {
                const ext = path.extname(file.originalname).toLowerCase();
                const isVideo = ['.mp4','.mov','.avi','.webm','.mkv'].includes(ext);
                const isRaw = ['.pdf','.doc','.docx','.ppt','.pptx','.xls','.xlsx','.zip','.rar','.7z'].includes(ext);
                return {
                    folder: 'diu-nexus',
                    resource_type: isRaw ? 'raw' : isVideo ? 'video' : 'image',
                    public_id: Date.now() + '-' + Math.round(Math.random()*1e9),
                    format: undefined // keep original
                };
            }
        });
        console.log('☁️ Cloudinary storage enabled:', process.env.CLOUDINARY_CLOUD_NAME || 'via CLOUDINARY_URL');
    } catch(e) {
        console.warn('⚠️ Cloudinary init failed, falling back to local:', e.message);
        cloudinary = null;
    }
}
if (!storage) {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadDir),
        filename: (req, file, cb) => {
            const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
            cb(null, unique + path.extname(file.originalname));
        }
    });
    console.log('💾 Local disk storage (server/uploads)');
}

const fileFilter = (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|svg|mp4|mov|avi|webm|mkv|pdf|doc|docx|ppt|pptx|xls|xlsx|zip|rar|7z|tar|gz|mp3|wav|ogg/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.test(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Unsupported file type'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 * 1024 } // 5GB High-Capacity Limit for 4K video, lecture recordings & large datasets
});

module.exports = upload;
