const jwt = require('jsonwebtoken')

module.exports = function verifyToken(req, res, next) {
    let token = req.headers["authorization"] || req.cookies?.accessToken;

    if (!token) {
        return res.status(403).json({ error: "No token Provided 🙆🏻‍♂️" });
    }

    if (typeof token === "string" && token.startsWith("Bearer ")) {
        token = token.slice(7).trim();
    }

    jwt.verify(token, process.env.USER_ACCESS_TOKEN_SECRET, (err, decode) => {
        if (err) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        req.username = decode.username;
        req.user = {
            userId: decode.id || decode.userId || decode._id,
            username: decode.username,
            isAdmin: !!decode.isAdmin,
        };
        next();
    });
};