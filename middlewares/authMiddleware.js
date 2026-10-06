const jwt = require("jsonwebtoken");

// Optional auth: populates req.user if a valid token exists, but never blocks the request.
// Use this for routes that work for both guests and logged-in users (e.g. Tabby checkout).
exports.optionalProtect = (req, res, next) => {
  let userToken = req.cookies.accessToken;
  let adminToken = req.cookies.adminToken;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer")) {
    const headerToken = authHeader.split(" ")[1];
    if (!userToken) userToken = headerToken;
    if (!adminToken) adminToken = headerToken;
  }

  if (userToken) {
    try {
      const decoded = jwt.verify(userToken, process.env.USER_ACCESS_TOKEN_SECRET);
      req.user = { userId: decoded.id, isAdmin: decoded.isAdmin };
    } catch (err) {
      req.user = null;
    }
  }

  if (adminToken) {
    try {
      const decodedAdmin = jwt.verify(adminToken, process.env.ADMIN_JWT_SECRET);
      if (decodedAdmin.isAdmin && decodedAdmin.role) {
        req.admin = {
          id: decodedAdmin.id || decodedAdmin._id,
          _id: decodedAdmin._id || decodedAdmin.id,
          username: decodedAdmin.username,
          email: decodedAdmin.email,
          role: decodedAdmin.role,
        };
      }
    } catch (err) {
      req.admin = null;
    }
  }

  return next();
};

// Existing user protection
exports.protect = (req, res, next) => {
  let token = req.cookies.accessToken;

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer")) {
      token = authHeader.split(" ")[1];
    }
  }

  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.USER_ACCESS_TOKEN_SECRET);
    req.user = { userId: decoded.id };
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// New Admin protection
exports.adminProtect = (req, res, next) => {
  let token = req.cookies.adminToken;

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer")) {
      token = authHeader.split(" ")[1];
    }
  }

  if (!token) {
    return res.status(401).json({ message: "No admin token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);

    // Check if it's an admin token and has a valid role
    if (!decoded.isAdmin || !decoded.role) {
      return res.status(403).json({ message: "Not authorized as admin" });
    }

    req.admin = {
      id: decoded.id || decoded._id,
      _id: decoded._id || decoded.id,
      username: decoded.username,
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired admin token" });
  }
};

// Optional: Role-based restriction middleware
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      return res.status(403).json({
        message: `You do not have permission to perform this action. Required roles: ${roles.join(", ")}`,
      });
    }
    next();
  };
};
