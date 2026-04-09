const User = require("../models/User");
const ApiError = require("../utils/ApiError");
const { verifyAccessToken } = require("../utils/token");

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ApiError(401, "Access token is required");
    }

    const token = authHeader.split(" ")[1];
    const payload = verifyAccessToken(token);

    if (payload.tokenType !== "access") {
      throw new ApiError(401, "Invalid access token");
    }

    const user = await User.findById(payload.sub);

    if (!user) {
      throw new ApiError(401, "User not found for this token");
    }

    if (!user.isActive) {
      throw new ApiError(403, "Account is inactive. Please contact support.");
    }

    req.auth = {
      userId: user._id.toString(),
      role: user.role
    };

    return next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return next(new ApiError(401, "Invalid or expired access token"));
    }

    return next(error);
  }
};

module.exports = authMiddleware;
