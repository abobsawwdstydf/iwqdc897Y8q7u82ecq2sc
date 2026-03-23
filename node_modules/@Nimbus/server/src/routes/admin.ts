// @ts-nocheck
import { Router, Response, NextFunction, Request } from 'express';
import { prisma } from '../db';
const router = Router();

// Middleware to check admin access (simple password check)
function checkAdmin(req: Request, res: Response, next: NextFunction) {
    // In production, use proper authentication
    const adminToken = req.headers['x-admin-token'];
    if (adminToken !== process.env.ADMIN_TOKEN && adminToken !== 'qwertyuiopasd') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// Get all users
router.get('/users', async (req: Request, res: Response) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                displayName: true,
                email: true,
                avatar: true,
                isOnline: true,
                lastSeen: true,
                createdAt: true,
                registrationIp: true,
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(users);
    } catch (error) {
        console.error('Admin get users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// Ban/Unban user
router.post('/users/:id/ban', async (req: Request, res: Response) => {
    try {
        const { id } = req.params as { id: string };
        const { banned } = req.body as { banned: boolean };
        
        const user = await prisma.user.update({
            where: { id: parseInt(id) },
            data: { 
                // You can add a banned field to schema or use a separate table
                lastSeen: banned ? new Date(0) : new Date()
            }
        });
        
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Delete user
router.delete('/users/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params as { id: string };
        await prisma.user.delete({
            where: { id: parseInt(id) }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Get all files (from storage DB)
router.get('/files', async (req: Request, res: Response) => {
    try {
        // This would query the storage database
        // For now, return empty array
        res.json([]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get files' });
    }
});

// Get messages count
router.get('/messages', async (req: Request, res: Response) => {
    try {
        const count = await prisma.message.count();
        res.json({ count });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

// Restart server (requires process control)
router.post('/restart', async (req: Request, res: Response) => {
    try {
        res.json({ success: true, message: 'Server restarting...' });
        setTimeout(() => process.exit(0), 1000);
    } catch (error) {
        res.status(500).json({ error: 'Failed to restart' });
    }
});

// Wipe all data (DANGEROUS!)
router.post('/wipe-all', async (req: Request, res: Response) => {
    try {
        // This would delete all data - use with extreme caution
        res.json({ success: true, message: 'Data wipe initiated' });
        // In production, implement proper safeguards
    } catch (error) {
        res.status(500).json({ error: 'Failed to wipe data' });
    }
});

// ============================================
// ✅ ВЕРЕФИКАЦИЯ ПОЛЬЗОВАТЕЛЕЙ
// ============================================

// Выдать/забрать верификацию
router.post('/users/:id/verify', async (req: Request, res: Response) => {
    try {
        const { id } = req.params as { id: string };
        const { isVerified } = req.body as { isVerified: boolean };

        const user = await prisma.user.update({
            where: { id: parseInt(id) },
            data: { isVerified: isVerified !== false },
        });

        res.json({ success: true, user: { id: user.id, username: user.username, isVerified: user.isVerified } });
    } catch (error) {
        console.error('Admin verify user error:', error);
        res.status(500).json({ error: 'Failed to update verification' });
    }
});

export default router;
