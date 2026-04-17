const { allowRoles } = require("./authMiddleware");

const adminMiddleware = allowRoles("admin");

module.exports = adminMiddleware;
