const path = require('path');

class UploadController {
    /**
     * POST /pfp/ai-b2c/avatar-upload
     *
     * Ожидает multipart/form-data с полем `image`.
     * Возвращает { url } — абсолютный URL до файла.
     */
    async uploadAiB2cAvatar(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded. Use field name "image".' });
            }

            const filePath = req.file.path;
            const relativePath = filePath.replace(path.join(__dirname, '..', '..'), '').replace(/\\/g, '/');
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const url = `${baseUrl}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;

            res.status(201).json({ url });
        } catch (error) {
            console.error('[Upload] Avatar upload error:', error);
            res.status(500).json({ error: 'Failed to upload avatar' });
        }
    }
}

module.exports = new UploadController();

