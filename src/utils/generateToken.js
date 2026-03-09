// utils/generateToken.js
const jwt = require("jsonwebtoken");

exports.generateAccessToken = (userId, email) => {
  return jwt.sign({ id: userId, email }, process.env.USER_ACCESS_TOKEN_SECRET, {
    expiresIn: "15m",
  });
};

exports.generateRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.USER_REFRESH_TOKEN_SECRET, {
    expiresIn: "7d"
  });
};
