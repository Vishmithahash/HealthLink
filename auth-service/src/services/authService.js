const bcrypt = require("bcrypt");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const env = require("../config/env");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken
} = require("../utils/token");

const normalizeIdentifier = (identifier) => identifier.trim().toLowerCase();
const normalizeNic = (nic) => nic.trim().toUpperCase();
const normalizePhoneNumber = (phoneNumber) => phoneNumber.trim();

const DOCTOR_SPECIALTIES = [
  "General Physician",
  "Cardiologist",
  "Dermatologist",
  "Neurologist",
  "Orthopedic",
  "Pediatrician",
  "Gynecologist",
  "Psychiatrist",
  "ENT Specialist",
  "Ophthalmologist"
];

const parseJsonSafely = async (response) => {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
};

const callProfileService = async ({ serviceName, url, payload }) => {
  let response;

  if (typeof globalThis.fetch !== "function") {
    throw new ApiError(500, "Server runtime does not support fetch API");
  }

  const timeoutSignal =
    globalThis.AbortSignal && typeof globalThis.AbortSignal.timeout === "function"
      ? globalThis.AbortSignal.timeout(env.requestTimeoutMs)
      : undefined;

  try {
    response = await globalThis.fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-api-key": env.internalServiceApiKey
      },
      body: JSON.stringify(payload),
      signal: timeoutSignal
    });
  } catch (error) {
    throw new ApiError(502, `${serviceName} service is not reachable`);
  }

  const body = await parseJsonSafely(response);

  if (!response.ok) {
    const message = body?.message || `Failed to create ${serviceName} profile`;
    throw new ApiError(response.status >= 500 ? 502 : response.status, message);
  }

  return body?.data || body;
};

const provisionProfileForUser = async (user) => {
  const userId = user._id.toString();

  if (user.role === "Doctor") {
    await callProfileService({
      serviceName: "Doctor",
      url: `${env.doctorServiceUrl}/api/doctors/register`,
      payload: {
        userId,
        fullName: user.fullName,
        specialization: user.specialty,
        nic: user.nic,
        phoneNumber: user.phoneNumber,
        username: user.username,
        email: user.email
      }
    });
  }

  if (user.role === "patient") {
    await callProfileService({
      serviceName: "Patient",
      url: `${env.patientServiceUrl}/api/patients/register`,
      payload: {
        userId,
        fullName: user.fullName,
        nic: user.nic,
        phone: user.phoneNumber,
        username: user.username,
        email: user.email
      }
    });
  }
};

const getDuplicateIdentityField = (existingUser, normalized) => {
  if (normalized.username && existingUser.username === normalized.username) {
    return "username";
  }

  if (normalized.email && existingUser.email === normalized.email) {
    return "email";
  }

  if (normalized.nic && existingUser.nic === normalized.nic) {
    return "NIC";
  }

  if (normalized.phoneNumber && existingUser.phoneNumber === normalized.phoneNumber) {
    return "phone number";
  }

  return "identity field";
};

const issueTokensForUser = async (user) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

  user.refreshTokenHash = refreshTokenHash;
  await user.save();

  return {
    accessToken,
    refreshToken
  };
};

const register = async ({ fullName, nic, phoneNumber, username, email, password, role, specialty }) => {
  const resolvedRole = role || "patient";

  if (resolvedRole === "Doctor") {
    if (!specialty) {
      throw new ApiError(400, "specialty is required when role is Doctor");
    }

    if (!DOCTOR_SPECIALTIES.includes(specialty.trim())) {
      throw new ApiError(400, `specialty must be one of: ${DOCTOR_SPECIALTIES.join(", ")}`);
    }
  }

  if (resolvedRole !== "Doctor" && specialty) {
    throw new ApiError(400, "specialty can only be provided when role is Doctor");
  }

  const normalizedUsername = normalizeIdentifier(username);
  const normalizedEmail = normalizeIdentifier(email);
  const normalizedNic = normalizeNic(nic);
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

  const existingUser = await User.findOne({
    $or: [
      { username: normalizedUsername },
      { email: normalizedEmail },
      { nic: normalizedNic },
      { phoneNumber: normalizedPhoneNumber }
    ]
  });

  if (existingUser) {
    let duplicateField = "provided details";

    if (existingUser.username === normalizedUsername) {
      duplicateField = "username";
    } else if (existingUser.email === normalizedEmail) {
      duplicateField = "email";
    } else if (existingUser.nic === normalizedNic) {
      duplicateField = "NIC";
    } else if (existingUser.phoneNumber === normalizedPhoneNumber) {
      duplicateField = "phone number";
    }

    throw new ApiError(409, `A user with this ${duplicateField} already exists`);
  }

  const user = await User.create({
    fullName: fullName.trim(),
    nic: normalizedNic,
    phoneNumber: normalizedPhoneNumber,
    username: normalizedUsername,
    email: normalizedEmail,
    passwordHash: password,
    role: resolvedRole,
    specialty: resolvedRole === "Doctor" ? specialty.trim() : null
  });

  try {
    await provisionProfileForUser(user);
  } catch (error) {
    await User.deleteOne({ _id: user._id });
    throw error;
  }

  const userWithSecrets = await User.findById(user._id).select("+passwordHash +refreshTokenHash");
  const tokens = await issueTokensForUser(userWithSecrets);

  return {
    user: user.toSafeObject(),
    ...tokens
  };
};

const login = async ({ username, password }) => {
  const normalizedUsername = normalizeIdentifier(username);
  const normalizedNic = normalizeNic(username);

  const user = await User.findOne({
    $or: [
      { email: normalizedUsername },
      { username: normalizedUsername },
      { nic: normalizedNic }
    ]
  }).select("+passwordHash +refreshTokenHash");

  if (!user) {
    throw new ApiError(401, "Invalid credentials");
  }

  if (!user.isActive) {
    throw new ApiError(403, "Account is inactive. Please contact support.");
  }

  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid credentials");
  }

  const tokens = await issueTokensForUser(user);

  return {
    user: user.toSafeObject(),
    ...tokens
  };
};

const refresh = async ({ refreshToken }) => {
  let decoded;

  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (error) {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const user = await User.findById(decoded.sub).select("+refreshTokenHash +passwordHash");

  if (!user || !user.isActive || !user.refreshTokenHash) {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const isRefreshTokenValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);

  if (!isRefreshTokenValid) {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const tokens = await issueTokensForUser(user);

  return {
    user: user.toSafeObject(),
    ...tokens
  };
};

const logout = async ({ userId }) => {
  const user = await User.findById(userId).select("+refreshTokenHash +passwordHash");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  user.refreshTokenHash = null;
  await user.save();
};

const getMe = async ({ userId }) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!user.isActive) {
    throw new ApiError(403, "Account is inactive. Please contact support.");
  }

  return user.toSafeObject();
};

const updateInternalUserProfile = async ({ userId, payload }) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const normalized = {};

  if (Object.prototype.hasOwnProperty.call(payload, "username")) {
    normalized.username = normalizeIdentifier(payload.username);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "email")) {
    normalized.email = normalizeIdentifier(payload.email);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "nic")) {
    normalized.nic = normalizeNic(payload.nic);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "phoneNumber")) {
    normalized.phoneNumber = normalizePhoneNumber(payload.phoneNumber);
  }

  const duplicateFilters = [];
  if (normalized.username) duplicateFilters.push({ username: normalized.username });
  if (normalized.email) duplicateFilters.push({ email: normalized.email });
  if (normalized.nic) duplicateFilters.push({ nic: normalized.nic });
  if (normalized.phoneNumber) duplicateFilters.push({ phoneNumber: normalized.phoneNumber });

  if (duplicateFilters.length > 0) {
    const existingUser = await User.findOne({
      _id: { $ne: user._id },
      $or: duplicateFilters
    });

    if (existingUser) {
      const duplicateField = getDuplicateIdentityField(existingUser, normalized);
      throw new ApiError(409, `A user with this ${duplicateField} already exists`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "fullName")) {
    user.fullName = payload.fullName.trim();
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "username")) {
    user.username = normalized.username;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "email")) {
    user.email = normalized.email;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "nic")) {
    user.nic = normalized.nic;
  }

  if (Object.prototype.hasOwnProperty.call(normalized, "phoneNumber")) {
    user.phoneNumber = normalized.phoneNumber;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "specialty")) {
    if (user.role !== "Doctor") {
      throw new ApiError(400, "specialty can only be updated for doctor users");
    }

    const trimmedSpecialty = payload.specialty.trim();
    if (!DOCTOR_SPECIALTIES.includes(trimmedSpecialty)) {
      throw new ApiError(400, `specialty must be one of: ${DOCTOR_SPECIALTIES.join(", ")}`);
    }

    user.specialty = trimmedSpecialty;
  }

  await user.save();
  return user.toSafeObject();
};

module.exports = {
  register,
  login,
  refresh,
  logout,
  getMe,
  updateInternalUserProfile
};
