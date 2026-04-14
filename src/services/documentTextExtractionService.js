const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const MAX_EXTRACTED_TEXT_LENGTH = 120000;

function normalizeUploadedFilename(filename) {
    const raw = String(filename || '').trim();
    if (!raw) return 'uploaded-document';

    // Multer/busboy can expose UTF-8 names as latin1-decoded strings.
    // Try to recover original UTF-8 and fallback to raw value if recovery fails.
    try {
        const recovered = Buffer.from(raw, 'latin1').toString('utf8').trim();
        if (recovered && recovered.includes('\uFFFD') === false) {
            return recovered;
        }
    } catch (error) {
        // noop: fallback below
    }

    return raw;
}

function normalizeText(text) {
    return String(text || '')
        .replace(/\u0000/g, ' ')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function trimToLimit(text, limit = MAX_EXTRACTED_TEXT_LENGTH) {
    const normalized = normalizeText(text);
    if (normalized.length <= limit) {
        return { text: normalized, truncated: false };
    }
    return {
        text: `${normalized.slice(0, limit)}\n\n[...document text truncated due to size limit...]`,
        truncated: true
    };
}

async function extractTextFromUploadedDocument(file) {
    if (!file || !file.buffer) {
        throw new Error('Uploaded file is missing');
    }

    const originalName = normalizeUploadedFilename(file.originalname);
    const extension = path.extname(originalName).toLowerCase();

    let rawText = '';
    let parserType = 'plain';

    try {
        if (file.mimetype === 'application/pdf' || extension === '.pdf') {
            const parsed = await pdfParse(file.buffer);
            rawText = parsed?.text || '';
            parserType = 'pdf';
        } else if (
            file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            extension === '.docx' ||
            extension === '.doc'
        ) {
            const parsed = await mammoth.extractRawText({ buffer: file.buffer });
            rawText = parsed?.value || '';
            parserType = 'word';
        } else {
            rawText = file.buffer.toString('utf8');
            parserType = 'text';
        }
    } catch (error) {
        throw new Error(`Failed to parse "${originalName || 'document'}": ${error.message}`);
    }

    const { text, truncated } = trimToLimit(rawText);
    return {
        text,
        truncated,
        parserType
    };
}

function formatExtractedDocumentSection(extracted, originalName) {
    const safeName = normalizeUploadedFilename(originalName);
    const truncationNote = extracted?.truncated ? '\n\n[NOTE] Extracted text was truncated to fit size limits.' : '';

    return [
        `### ДОКУМЕНТ: ${safeName}`,
        `Источник: ${extracted?.parserType || 'unknown-parser'}`,
        '',
        extracted?.text || '',
        truncationNote
    ].join('\n').trim();
}

module.exports = {
    extractTextFromUploadedDocument,
    formatExtractedDocumentSection,
    normalizeUploadedFilename
};
