const path = require("path");
const multer = require("multer");
const {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  ensureUploadDir,
  isAllowedSlipMimeType
} = require("../services/uploadService");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = ensureUploadDir();
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    const safeExtension = [".jpg", ".jpeg", ".png"].includes(extension) ? extension : ".jpg";
    cb(null, `slip-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExtension}`);
  }
});

const uploader = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES
  },
  fileFilter: (req, file, cb) => {
    if (!isAllowedSlipMimeType(file.mimetype)) {
      return cb(new Error(`Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`));
    }

    return cb(null, true);
  }
});

const uploadSlipMiddleware = (req, res, next) => {
  uploader.single("slip")(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.message || "Failed to upload slip",
        details: null
      });
    }

    return next();
  });
};

module.exports = {
  uploadSlipMiddleware
};
