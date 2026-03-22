import { Request, Response, NextFunction } from 'express';
export interface AuthRequest extends Request {
    userId?: number;
}
export declare function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void;
