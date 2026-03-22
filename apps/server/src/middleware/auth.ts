import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { config } from '../config';

// Multer file interface
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  destination: string;
  filename: string;
  path: string;
  size: number;
}

export interface AuthRequest extends Request {
  userId?: number;
  query?: Record<string, string | undefined>;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  file?: MulterFile;
  files?: MulterFile[];
  headers?: Record<string, string | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = (req.headers as Record<string, string | undefined>)['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: number };
    (req as any).userId = decoded.userId;
    next();
  } catch {
    res.status(403).json({ error: 'Недействительный токен' });
    return;
  }
}
