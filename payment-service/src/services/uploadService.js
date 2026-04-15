const fs = require("fs");
const path = require("path");
const env = require("../config/env");

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png"];
const MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024;

const getAbsoluteUploadPath = () => {
  return path.resolve(process.cwd(), env.uploadPath);
};

const ensureUploadDir = () => {
  const absolutePath = getAbsoluteUploadPath();
  if (!fs.existsSync(absolutePath)) {
    fs.mkdirSync(absolutePath, { recursive: true });
  }

  return absolutePath;
};

const isAllowedSlipMimeType = (mimeType) => {
  return ALLOWED_MIME_TYPES.includes(String(mimeType || "").toLowerCase());
};

const buildSlipUrl = (filename) => {
  const uploadDir = String(env.uploadPath || "uploads").replace(/\\/g, "/").replace(/\/$/, "");
  return `${uploadDir}/${filename}`;
};

const removeFileIfExists = (filePath) => {
  if (!filePath) {
    return;
  }

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

module.exports = {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  ensureUploadDir,
  getAbsoluteUploadPath,
  isAllowedSlipMimeType,
  buildSlipUrl,
  removeFileIfExists
};
