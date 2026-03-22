export declare const config: {
    port: number;
    jwtSecret: string;
    corsOrigins: string[];
    uploadsDir: string;
    /** Minimum password length */
    minPasswordLength: number;
    /** Maximum registrations allowed from the same IP per day (0 = unlimited) */
    maxRegistrationsPerIp: number;
    /** Require email verification */
    requireEmailVerification: boolean;
    /** Captcha after N failed attempts */
    captchaAfterFailures: number;
    /** TURN server URL for WebRTC calls (e.g. turn:your-domain.com:3478) */
    turnUrl: string;
    /** Shared secret for TURN server (coturn static-auth-secret) */
    turnSecret: string;
    /** STUN server URLs */
    stunUrls: string[];
};
