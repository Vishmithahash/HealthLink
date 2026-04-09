const jwt = require("jsonwebtoken");
const env = require("../config/env");

const generateAccessToken = (user) => {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      tokenType: "access"
    },
    env.jwtAccessSecret,
    {
      expiresIn: env.accessTokenExpiresIn
    }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      tokenType: "refresh"
    },
    env.jwtRefreshSecret,
    {
      expiresIn: env.refreshTokenExpiresIn
    }
  );
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, env.jwtAccessSecret);
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.jwtRefreshSecret);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};
