import { rateLimit, type Options as RateLimitOptions } from 'express-rate-limit';

export function asyncHandler(fn: {
  (req: Request, res: Response): Promise<void>;
  (arg0: unknown, arg1: unknown): unknown;
}) {
  return (req, res) => {
    void Promise.resolve(fn(req, res)).catch((err) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      throw new Error(err);
    });
  };
}

const rlOptions: Partial<RateLimitOptions> = {
  windowMs: 60 * 1000, // 1 minute
  max: 60 // 60 requests per minute
};

export const limiter: RateLimitRequestHandler = rateLimit(rlOptions);
