/**
 * Process-Local In-Memory Rate Limiting Middleware
 *
 * ARCHITECTURAL NOTICE:
 * This rate limiter is process-local and stores request counters in memory.
 * - Single-instance / single-worker deployment: provides fast, robust abuse prevention with zero latency.
 * - Multi-instance / cluster deployment: each PM2 or container instance maintains its own counters.
 *   If clustered across N workers without sticky sessions, effective rate limit is (max * N).
 *   For multi-node distributed enforcement, a shared store (e.g. Redis) would be required,
 *   but is avoided here per architectural directive to keep dependencies minimal.
 *
 * PROXY & IP HANDLING:
 * Express 'trust proxy' (configured in server.js) ensures req.ip reliably reflects the client IP
 * provided by Nginx rather than trusting forged client headers.
 */

function createRateLimiter(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes default
    max = 10, // 10 requests default
    message = "Too many requests, please try again later.",
    keyGenerator = (req) => req.ip || req.socket?.remoteAddress || "127.0.0.1",
  } = options;

  const hits = new Map();

  // Periodic sweeper to evict expired records and prevent memory leaks
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now >= record.resetTime) {
        hits.delete(key);
      }
    }
  }, Math.min(windowMs, 60000));

  // Do not keep the Node.js event loop active just for cleanup
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  const limiterMiddleware = (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();

    let record = hits.get(key);

    if (!record || now >= record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      hits.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const retryAfterSec = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
    const resetTimeSec = Math.ceil(record.resetTime / 1000);

    // Standard RFC RateLimit headers
    res.setHeader("RateLimit-Limit", max);
    res.setHeader("RateLimit-Remaining", remaining);
    res.setHeader("RateLimit-Reset", resetTimeSec);

    if (record.count > max) {
      res.setHeader("Retry-After", retryAfterSec);
      return res.status(429).json({
        success: false,
        message,
        retryAfter: retryAfterSec,
      });
    }

    next();
  };

  // Helper method for testing/resetting state
  limiterMiddleware.reset = () => {
    hits.clear();
  };

  return limiterMiddleware;
}

// 1. Customer login: 10 requests per 15 minutes
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many login attempts. Please try again after 15 minutes.",
});

// 2. Customer registration: 10 requests per 1 hour
const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Too many registration attempts. Please try again after 1 hour.",
});

// 3. Admin login: 5 requests per 15 minutes (stricter for privileged access)
const adminLoginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many admin login attempts. Please try again after 15 minutes.",
});

// 4. Password reset (forgot-password & reset-password): 5 requests per 15 minutes
const passwordResetLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many password reset requests. Please try again after 15 minutes.",
});

// 5. Contact form submissions: 10 requests per 15 minutes
const contactLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many contact form submissions. Please try again after 15 minutes.",
});

module.exports = {
  createRateLimiter,
  loginLimiter,
  registerLimiter,
  adminLoginLimiter,
  passwordResetLimiter,
  contactLimiter,
};
