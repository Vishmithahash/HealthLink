const normalize = (role) => String(role || "").trim().toLowerCase();

const authorize = (...allowedRoles) => {
  const allowed = allowedRoles.map(normalize);

  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
        details: null
      });
    }

    if (!allowed.includes(normalize(req.user.role))) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: insufficient role",
        details: null
      });
    }

    return next();
  };
};

module.exports = { authorize };
