const authService = require("../services/authService");

const register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);

    return res.status(201).json({
      success: true,
      message: "Registration successful",
      data: result
    });
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: result
    });
  } catch (error) {
    return next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const result = await authService.refresh(req.body);

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      data: result
    });
  } catch (error) {
    return next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    await authService.logout({ userId: req.auth.userId });

    return res.status(200).json({
      success: true,
      message: "Logout successful"
    });
  } catch (error) {
    return next(error);
  }
};

const me = async (req, res, next) => {
  try {
    const user = await authService.getMe({ userId: req.auth.userId });

    return res.status(200).json({
      success: true,
      message: "Current user fetched successfully",
      data: user
    });
  } catch (error) {
    return next(error);
  }
};

const validateToken = async (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Access token is valid",
    data: {
      userId: req.auth.userId,
      role: req.auth.role
    }
  });
};

const listUsers = async (req, res, next) => {
  try {
    const users = await authService.listUsers({ role: req.query.role });

    return res.status(200).json({
      success: true,
      message: "Users fetched successfully",
      data: users
    });
  } catch (error) {
    return next(error);
  }
};

const getInternalUserById = async (req, res, next) => {
  try {
    const user = await authService.getInternalUserById({ userId: req.params.id });

    return res.status(200).json({
      success: true,
      message: "Internal user lookup successful",
      data: user
    });
  } catch (error) {
    return next(error);
  }
};

const updateInternalUserById = async (req, res, next) => {
  try {
    const user = await authService.updateInternalUserById({
      userId: req.params.id,
      payload: req.body || {}
    });

    return res.status(200).json({
      success: true,
      message: "Internal user update successful",
      data: user
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  register,
  login,
  refresh,
  logout,
  me,
  validateToken,
  listUsers,
  getInternalUserById,
  updateInternalUserById
};
