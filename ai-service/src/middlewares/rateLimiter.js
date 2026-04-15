const buckets = new Map();

const cleanupBucket = (timestamps, now, windowMs) => {
  return timestamps.filter((value) => now - value < windowMs);
};

const userRateLimiter = (req, res, next) => {
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
  const maxRequests = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 10);
  const key = req.user?.id || req.ip;
  const now = Date.now();

  const existing = buckets.get(key) || [];
  const active = cleanupBucket(existing, now, windowMs);

  if (active.length >= maxRequests) {
    return res.status(429).json({
      error: "Rate limit exceeded. Please try again later."
    });
  }

  active.push(now);
  buckets.set(key, active);

  res.setHeader("X-RateLimit-Limit", String(maxRequests));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(maxRequests - active.length, 0)));

  return next();
};

module.exports = { userRateLimiter };
