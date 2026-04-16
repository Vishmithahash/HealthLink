const bcrypt = require("bcrypt");
const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const env = require("../config/env");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken
} = require("../utils/token");
const { DOCTOR_SPECIALTIES, resolveDoctorSpecialty } = require("../constants/doctorSpecialties");

const normalizeIdentifier = (identifier) => identifier.trim().toLowerCase();
const normalizeNic = (nic) => nic.trim().toUpperCase();
const normalizePhoneNumber = (phoneNumber) => phoneNumber.trim();

const sendWelcomeEmail = async ({ email, phoneNumber, fullName, role }) => {
  if (!email) {
    return false;
  }

  const message =
    `Hello ${fullName || "there"}, welcome to HealthLink. ` +
    `Your ${role || "user"} account is ready and you can start using the platform.`;

  try {
    const response = await fetch(`${env.notificationServiceUrl}/api/notifications/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        to: email,
        toPhone: phoneNumber || null,
        subject: "Welcome to HealthLink",
        templateType: "custom",
        message
      }),
      signal: AbortSignal.timeout(env.requestTimeoutMs)
    });

    if (!response.ok) {
      const payload = await response.text();
      console.error(`Welcome email dispatch failed: ${response.status} ${payload}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Welcome email dispatch failed: ${error.message}`);
    return false;
  }
};

const sendLoginWelcomeEmail = async ({ email, phoneNumber, fullName, role }) => {
  if (!email) {
    return false;
  }

  const message =
    `Hello ${fullName || "there"}, welcome to HealthLink. ` +
    `You have successfully logged in to your ${role || "user"} account.`;

  try {
    const response = await fetch(`${env.notificationServiceUrl}/api/notifications/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        to: email,
        toPhone: phoneNumber || null,
        subject: "Welcome to HealthLink",
        templateType: "custom",
        message
      }),
      signal: AbortSignal.timeout(env.requestTimeoutMs)
    });

    if (!response.ok) {
      const payload = await response.text();
      console.error(`Login welcome email dispatch failed: ${response.status} ${payload}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Login welcome email dispatch failed: ${error.message}`);
    return false;
  }
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
  let resolvedSpecialty = null;

  if (resolvedRole === "Doctor") {
    if (!specialty) {
      throw new ApiError(400, "specialty is required when role is Doctor");
    }

    resolvedSpecialty = resolveDoctorSpecialty(specialty);
    if (!resolvedSpecialty) {
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
    specialty: resolvedRole === "Doctor" ? resolvedSpecialty : null
  });

  const userWithSecrets = await User.findById(user._id).select("+passwordHash +refreshTokenHash");
  const tokens = await issueTokensForUser(userWithSecrets);

  const welcomeSent = await sendWelcomeEmail({
    email: user.email,
    phoneNumber: user.phoneNumber,
    fullName: user.fullName,
    role: user.role
  });

  if (welcomeSent) {
    userWithSecrets.welcomeEmailSentAt = new Date();
    await userWithSecrets.save();
  }

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

  if (!user.loginWelcomeEmailSentAt) {
    const loginWelcomeSent = await sendLoginWelcomeEmail({
      email: user.email,
      phoneNumber: user.phoneNumber,
      fullName: user.fullName,
      role: user.role
    });

    if (loginWelcomeSent) {
      user.loginWelcomeEmailSentAt = new Date();
      await user.save();
    }
  }

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

const listUsers = async ({ role }) => {
  const filter = {};

  if (role) {
    const normalized = String(role).trim().toLowerCase();
    if (normalized === "doctor") {
      filter.role = "Doctor";
    } else if (normalized === "admin") {
      filter.role = "Admin";
    } else if (normalized === "patient") {
      filter.role = "patient";
    }
  }

  const users = await User.find(filter)
    .sort({ createdAt: -1 })
    .limit(500);

  return users.map((user) => user.toSafeObject());
};

const getInternalUserById = async ({ userId }) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return {
    id: user._id.toString(),
    email: user.email,
    phoneNumber: user.phoneNumber,
    fullName: user.fullName,
    role: user.role,
    isActive: Boolean(user.isActive)
  };
};

module.exports = {
  register,
  login,
  refresh,
  logout,
  getMe,
  listUsers,
  getInternalUserById
};
