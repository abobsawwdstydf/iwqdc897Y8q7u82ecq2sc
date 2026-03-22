import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
/** Standard user fields to include in API responses (excludes password) */
export declare const USER_SELECT: {
    readonly id: true;
    readonly username: true;
    readonly displayName: true;
    readonly avatar: true;
    readonly bio: true;
    readonly birthday: true;
    readonly isOnline: true;
    readonly lastSeen: true;
    readonly createdAt: true;
    readonly hideStoryViews: true;
};
/** Compact user fields for message sender / forwarded-from */
export declare const SENDER_SELECT: {
    readonly id: true;
    readonly username: true;
    readonly displayName: true;
    readonly avatar: true;
};
/** Full message include for API responses */
export declare const MESSAGE_INCLUDE: {
    readonly sender: {
        readonly select: {
            readonly id: true;
            readonly username: true;
            readonly displayName: true;
            readonly avatar: true;
        };
    };
    readonly forwardedFrom: {
        readonly select: {
            readonly id: true;
            readonly username: true;
            readonly displayName: true;
            readonly avatar: true;
        };
    };
    readonly replyTo: {
        readonly include: {
            readonly sender: {
                readonly select: {
                    readonly id: true;
                    readonly username: true;
                    readonly displayName: true;
                };
            };
        };
    };
    readonly media: true;
    readonly reactions: {
        readonly include: {
            readonly user: {
                readonly select: {
                    readonly id: true;
                    readonly username: true;
                    readonly displayName: true;
                };
            };
        };
    };
    readonly readBy: {
        readonly select: {
            readonly userId: true;
        };
    };
};
/** Ensure a directory exists (recursive). */
export declare function ensureDir(dirPath: string): void;
/** Safely delete a file from the uploads directory given its URL path (e.g. '/uploads/avatars/abc.jpg'). */
export declare function deleteUploadedFile(urlPath: string): void;
/** Allowed image extensions for avatars. */
export declare const ALLOWED_IMAGE_EXTENSIONS: Set<string>;
/** Multer middleware for user avatar uploads (max 5MB, images only). */
export declare const uploadUserAvatar: multer.Multer;
/** Multer middleware for group avatar uploads (max 5MB, images only). */
export declare const uploadGroupAvatar: multer.Multer;
/** Multer middleware for general file uploads (max 20GB). */
export declare const uploadFile: multer.Multer;
/**
 * Express middleware that encrypts an uploaded file in-place after multer
 * has written it to disk. Use after any multer middleware.
 */
export declare function encryptUploadedFile(req: Request, _res: Response, next: NextFunction): void;
/** Absolute path to the uploads root directory. */
export declare const UPLOADS_ROOT: string;
