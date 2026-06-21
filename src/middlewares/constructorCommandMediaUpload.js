const multer = require('multer');
const path = require('path');
const { IMAGE_MIMES, VIDEO_MIMES } = require('../utils/constructorCommandMedia');

const ALLOWED_MIMES = new Set([...IMAGE_MIMES, ...VIDEO_MIMES]);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.webm', '.mov']);

const constructorCommandMediaUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        if (ALLOWED_MIMES.has(file.mimetype) || ALLOWED_EXT.has(ext)) {
            return cb(null, true);
        }
        return cb(new Error('Допустимы изображения (jpg, png, webp, gif) и видео (mp4, webm, mov)'));
    },
});

function constructorCommandMediaUploadError(err, req, res, next) {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Файл слишком большой (макс. 50 MB)' });
    }
    if (err.message) {
        return res.status(400).json({ error: err.message });
    }
    return next(err);
}

module.exports = {
    constructorCommandMediaUpload,
    constructorCommandMediaUploadError,
};
