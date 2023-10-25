import { rateLimit, type Options as RateLimitOptions, RateLimitRequestHandler } from 'express-rate-limit';


const rlOptions: Partial<RateLimitOptions> = {
  windowMs: 60 * 1000, // 1 minute
  max: 60 // 60 requests per minute
};

export const limiter: RateLimitRequestHandler = rateLimit(rlOptions);
