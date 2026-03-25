// ═══════════════════════════════════════════════
// Upload Service — Multer + Sharp + Cloudinary
// ═══════════════════════════════════════════════
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

// Configure Cloudinary once at module load (not on every upload)
const cloudinary = require('cloudinary').v2;
if (config.cloudinary.cloudName && config.cloudinary.apiKey) {
    cloudinary.config({
        cloud_name: config.cloudinary.cloudName,
        api_key: config.cloudinary.apiKey,
        api_secret: config.cloudinary.apiSecret,
    });
}

// Ensure uploads directory exists
// ── Fix for Vercel Read-Only File System ──
const os = require('os');
const uploadsDir = process.env.VERCEL 
    ? path.join(os.tmpdir(), 'uploads') 
    : path.join(__dirname, '..', '..', 'uploads');

// Create directory only if we are NOT on Vercel or if we really need it
try {
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }
} catch (err) {
    console.warn('⚠️ Directory creation skipped or failed:', err.message);
}

// ── Multer Config ──
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed.'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB — matches UI promise
        files: 5,
    },
});

/**
 * Compress and optimize image using Sharp
 */
const compressImage = async (buffer, options = {}) => {
    const {
        width = 1200,
        quality = 80,
        format = 'webp',
    } = options;

    return sharp(buffer)
        .resize(width, null, { withoutEnlargement: true })
        .toFormat(format, { quality })
        .toBuffer();
};

/**
 * Upload to Cloudinary
 */
const uploadToCloudinary = async (buffer, folder = 'corporate-platform') => {
    if (!config.cloudinary.cloudName || !config.cloudinary.apiKey) {
        // Fallback: save locally
        return saveLocally(buffer);
    }

    try {
        return new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { folder, resource_type: 'image', format: 'webp', quality: 'auto' },
                (err, result) => {
                    if (err) reject(err);
                    else resolve({ url: result.secure_url, publicId: result.public_id });
                }
            );
            const { Readable } = require('stream');
            Readable.from(buffer).pipe(stream);
        });
    } catch (err) {
        console.error('❌ Cloudinary upload error:', err.message);
        return saveLocally(buffer);
    }
};

/**
 * Save image locally (dev fallback)
 */
const saveLocally = async (buffer) => {
    const filename = `${uuidv4()}.webp`;
    const filepath = path.join(uploadsDir, filename);
    await fs.promises.writeFile(filepath, buffer); // async — does not block the event loop
    return { url: `/uploads/${filename}`, publicId: filename };
};

/**
 * Process and upload a single image
 */
const processAndUpload = async (file, folder) => {
    const compressed = await compressImage(file.buffer);
    return uploadToCloudinary(compressed, folder);
};

/**
 * Process and upload multiple images
 */
const processAndUploadMultiple = async (files, folder) => {
    const results = [];
    for (const file of files) {
        const result = await processAndUpload(file, folder);
        results.push(result);
    }
    return results;
};

module.exports = {
    upload,
    compressImage,
    uploadToCloudinary,
    saveLocally,
    processAndUpload,
    processAndUploadMultiple,
};
