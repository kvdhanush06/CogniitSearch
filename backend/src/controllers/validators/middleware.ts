import { type Request, type Response, type NextFunction } from 'express';
import type { ZodSchema } from 'zod';

/**
 * Create validation middleware for request body
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error: any) {
      if (error.errors) {
        res.status(400).json({
          success: false,
          error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: error.errors.map((e: any) => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          },
        });
      } else {
        next(error);
      }
    }
  };
}

/**
 * Create validation middleware for request params
 */
export function validateParams(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.params);
      req.params = validated;
      next();
    } catch (error: any) {
      if (error.errors) {
        res.status(400).json({
          success: false,
          error: {
            message: 'Invalid parameters',
            code: 'VALIDATION_ERROR',
            details: error.errors.map((e: any) => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          },
        });
      } else {
        next(error);
      }
    }
  };
}

/**
 * Create validation middleware for query string
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.query);
      req.query = validated;
      next();
    } catch (error: any) {
      if (error.errors) {
        res.status(400).json({
          success: false,
          error: {
            message: 'Invalid query parameters',
            code: 'VALIDATION_ERROR',
            details: error.errors.map((e: any) => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          },
        });
      } else {
        next(error);
      }
    }
  };
}
