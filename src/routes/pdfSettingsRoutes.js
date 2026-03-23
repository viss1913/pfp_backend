const express = require('express');
const multer = require('multer');
const pdfSettingsController = require('../controllers/pdfSettingsController');

const router = express.Router();

const pdfCoverUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter(req, file, cb) {
        const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
        if (ok) return cb(null, true);
        cb(new Error('Only image/jpeg, image/png, image/webp are allowed'));
    },
});

function pdfCoverUploadError(err, req, res, next) {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large (max 8MB)' });
    }
    if (err.message) {
        return res.status(400).json({ error: err.message });
    }
    return next(err);
}

router.get('/cover-image', (req, res) => pdfSettingsController.getCoverImageAccess(req, res));
router.get('/summary-background-image', (req, res) =>
    pdfSettingsController.getSummaryBackgroundImageAccess(req, res)
);
router.get('/summary-logo-image', (req, res) => pdfSettingsController.getSummaryLogoImageAccess(req, res));
router.get('/summary-preview-html', (req, res) => pdfSettingsController.getSummaryPreviewHtml(req, res));
router.get('/', (req, res) => pdfSettingsController.getMy(req, res));
router.patch('/', (req, res) => pdfSettingsController.patchMy(req, res));
router.post(
    '/cover-background',
    pdfCoverUpload.single('image'),
    pdfCoverUploadError,
    (req, res) => pdfSettingsController.uploadCoverBackground(req, res)
);
router.post(
    '/summary-background',
    pdfCoverUpload.single('image'),
    pdfCoverUploadError,
    (req, res) => pdfSettingsController.uploadSummaryBackground(req, res)
);
router.post(
    '/summary-logo',
    pdfCoverUpload.single('image'),
    pdfCoverUploadError,
    (req, res) => pdfSettingsController.uploadSummaryLogo(req, res)
);

module.exports = router;
