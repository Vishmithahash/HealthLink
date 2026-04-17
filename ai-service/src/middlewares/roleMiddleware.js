const normalizeRole = (value) => String(value || "").trim().toLowerCase();

const allowRoles = (...roles) => {
  const allowed = new Set(roles.map((role) => normalizeRole(role)));

  return (req, res, next) => {
    const role = normalizeRole(req.user?.role);

    if (!allowed.has(role)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: insufficient role permissions",
        details: null
      });
    }

    return next();
  };
};

module.exports = { allowRoles };