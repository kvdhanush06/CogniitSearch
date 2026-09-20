import { type Request, type Response, type NextFunction } from 'express';
import { ZodError, type ZodType } from 'zod';

function sendValidationError(res: Response, message: string, error: ZodError): void {
  res.status(400).json({
    success: false,
    error: {
      message,
      code: 'VALIDATION_ERROR',
      details: error.issues.map((issue) => ({
        field: issue.path.join('.') || 'request',
        message: issue.message,
      })),
    },
  });
}

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        sendValidationError(res, 'Validation failed', error);
        return;
      }
      next(error);
    }
  };
}

export function validateParams<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params) as typeof req.params;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        sendValidationError(res, 'Invalid parameters', error);
        return;
      }
      next(error);
    }
  };
}

export function validateQuery<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query) as typeof req.query;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        sendValidationError(res, 'Invalid query parameters', error);
        return;
      }
      next(error);
    }
  };
}
