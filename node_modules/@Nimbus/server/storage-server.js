require('dotenv').config({ path: '.storage.env' });
const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const TelegramBot = require('node-telegram-bot-api');
const { WebhookClient } = require('discord.js');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

// ----- Databases -----
const messengerDB = new Pool({ 
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
});

const storageDB = new Pool({ 
    connectionString: process.env.STORAGE_DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
});

const masterKey = Buffer.from(process.env.MASTER_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');

// ----- 20 Encryption Methods -----
const CRYPTO_METHODS = [
    'aes-128-gcm', 'aes-192-gcm', 'aes-256-gcm',
    'aes-128-ctr', 'aes-192-ctr', 'aes-256-ctr',
    'aes-128-cbc', 'aes-192-cbc', 'aes-256-cbc',
    'chacha20-poly1305',
    'aria-128-gcm', 'aria-192-gcm', 'aria-256-gcm',
    'camellia-128-gcm', 'camellia-192-gcm', 'camellia-256-gcm',
    'camellia-128-cbc', 'camellia-192-cbc', 'camellia-256-cbc',
    'des-ede3-cbc'
];

// ----- Resources -----
let tgBots = [];
let tgChannels = [];
let dcWebhooks = [];

// ----- Encryption Functions -----
function encryptKey(key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
    let enc = cipher.update(key, 'binary', 'hex');
    enc += cipher.final('hex');
    return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc}`;
}

function decryptKey(encrypted) {
    const [ivHex, tagHex, data] = encrypted.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let dec = decipher.update(data, 'hex', 'binary');
    dec += decipher.final('binary');
    return dec;
}

function encryptChunk(data, method, key) {
    try {
        const authModes = ['gcm', 'ccm', 'poly1305'];
        const needsAuth = authModes.some(m => method.includes(m));
        const ivLength = needsAuth ? 12 : 16;
        const iv = crypto.randomBytes(ivLength);
        const cipher = crypto.createCipheriv(method, key, iv);
        let encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
        if (needsAuth) {
            const authTag = cipher.getAuthTag();
            return { data: encrypted, iv, authTag };
        }
        return { data: encrypted, iv };
    } catch (err) {
        console.error(`[ERROR] Encryption failed for ${method}:`, err.message);
        throw err;
    }
}

function decryptChunk(data, method, key, iv, authTag = null) {
    try {
        const decipher = crypto.createDecipheriv(method, key, iv);
        if (authTag) decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(data), decipher.final()]);
    } catch (err) {
        console.error(`[ERROR] Decryption failed for ${method}:`, err.message);
        throw err;
    }
}

// ----- Load Resources -----
async function loadResources() {
    try {
        // Telegram bots
        const botTokens = (process.env.TELEGRAM_BOT_TOKENS || '').split(',').filter(t => t.trim());
        for (const token of botTokens) {
            try {
                const bot = new TelegramBot(token.trim(), { polling: false });
                const info = await bot.getMe();
                tgBots.push({ id: info.id, username: info.username, bot });
                console.log(`✅ Telegram bot loaded: @${info.username}`);
            } catch (err) {
                console.error(`❌ Failed to load Telegram bot:`, err.message);
            }
        }

        // Telegram channels
        const channelIds = (process.env.TELEGRAM_CHANNEL_IDS || '').split(',').filter(id => id.trim());
        for (const id of channelIds) {
            tgChannels.push({ id: id.trim(), load: 0 });
        }
        console.log(`✅ Loaded ${tgChannels.length} Telegram channels`);

        // Discord webhooks
        const webhookUrls = (process.env.DISCORD_WEBHOOK_URLS || '').split(',').filter(url => url.trim());
        for (const url of webhookUrls) {
            try {
                const webhook = new WebhookClient({ url: url.trim() });
                dcWebhooks.push({ id: url.trim().split('/').pop(), webhook, load: 0 });
                console.log(`✅ Discord webhook loaded`);
            } catch (err) {
                console.error(`❌ Failed to load Discord webhook:`, err.message);
            }
        }

        // Create storage tables
        await storageDB.query(`
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                size BIGINT NOT NULL,
                mime_type TEXT,
                chunks INTEGER NOT NULL,
                uploaded_at TIMESTAMP DEFAULT NOW(),
                expires_at TIMESTAMP
            )
        `);

        await storageDB.query(`
            CREATE TABLE IF NOT EXISTS chunks (
                id SERIAL PRIMARY KEY,
                file_id TEXT REFERENCES files(id) ON DELETE CASCADE,
                chunk_index INTEGER NOT NULL,
                service TEXT NOT NULL,
                bot_id BIGINT,
                channel_id TEXT,
                webhook_id TEXT,
                remote_id TEXT NOT NULL,
                encrypted_key TEXT NOT NULL,
                encryption_method TEXT NOT NULL,
                chunk_size INTEGER NOT NULL,
                iv TEXT NOT NULL,
                auth_tag TEXT,
                uploaded_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(file_id, chunk_index)
            )
        `);

        await storageDB.query('CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id)');
        await storageDB.query('CREATE INDEX IF NOT EXISTS idx_chunks_service ON chunks(service)');

        console.log('✅ Storage tables created');
    } catch (err) {
        console.error('❌ Failed to load resources:', err.message);
    }
}

// ----- Get Least Loaded Resource -----
async function getLeastLoaded() {
    const resources = [];
    
    for (const channel of tgChannels) {
        resources.push({ 
            type: 'telegram', 
            channelId: channel.id, 
            load: channel.load 
        });
    }
    
    for (const webhook of dcWebhooks) {
        resources.push({ 
            type: 'discord', 
            webhookId: webhook.id, 
            load: webhook.load 
        });
    }
    
    if (resources.length === 0) {
        throw new Error('No storage resources available');
    }
    
    resources.sort((a, b) => a.load - b.load);
    return resources[0];
}

// ----- Upload File -----
app.post('/api/storage/upload', upload.single('file'), async (req, res) => {
    const fileId = crypto.randomUUID();
    const chunkSize = parseInt(process.env.CHUNK_SIZE) || 19 * 1024 * 1024; // 19MB
    const file = req.file;
    
    if (!file) {
        return res.status(400).json({ error: 'No file provided' });
    }

    // Check file size (max 20GB)
    const maxSize = parseInt(process.env.MAX_FILE_SIZE) || 20 * 1024 * 1024 * 1024;
    if (file.size > maxSize) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ error: 'File too large. Maximum size is 20GB' });
    }
    
    try {
        const totalChunks = Math.ceil(file.size / chunkSize);
        
        // Create file record
        await storageDB.query(
            `INSERT INTO files (id, name, size, mime_type, chunks) VALUES ($1, $2, $3, $4, $5)`,
            [fileId, file.originalname, file.size, file.mimetype, totalChunks]
        );
        
        const filePath = file.path;
        const stream = fs.createReadStream(filePath);
        let chunkIndex = 0;
        let buffer = Buffer.alloc(0);
        
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
            
            while (buffer.length >= chunkSize) {
                const fileChunk = buffer.slice(0, chunkSize);
                buffer = buffer.slice(chunkSize);
                
                const resource = await getLeastLoaded();
                const method = CRYPTO_METHODS[Math.floor(Math.random() * CRYPTO_METHODS.length)];
                const key = crypto.randomBytes(32);
                
                const { data: encData, iv, authTag } = encryptChunk(fileChunk, method, key);
                const encryptedKey = encryptKey(key);
                
                let remoteId;
                if (resource.type === 'telegram') {
                    const bot = tgBots[Math.floor(Math.random() * tgBots.length)];
                    if (bot) {
                        const msg = await bot.bot.sendDocument(
                            resource.channelId, 
                            encData, 
                            { 
                                caption: `${fileId}:${chunkIndex}`,
                                parse_mode: undefined
                            }
                        );
                        remoteId = msg.message_id.toString();
                        
                        // Update load
                        const channel = tgChannels.find(c => c.id === resource.channelId);
                        if (channel) channel.load++;
                    }
                } else {
                    const webhook = dcWebhooks.find(w => w.id === resource.webhookId);
                    if (webhook) {
                        const msg = await webhook.webhook.send({ 
                            files: [{ 
                                attachment: encData, 
                                name: `${fileId}_${chunkIndex}.enc` 
                            }] 
                        });
                        remoteId = msg.id;
                        webhook.load++;
                    }
                }
                
                if (remoteId) {
                    await storageDB.query(
                        `INSERT INTO chunks (file_id, chunk_index, service, bot_id, channel_id, webhook_id, remote_id, encrypted_key, encryption_method, chunk_size, iv, auth_tag)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
                        [
                            fileId, 
                            chunkIndex, 
                            resource.type, 
                            resource.type === 'telegram' ? tgBots[0]?.id : null, 
                            resource.type === 'telegram' ? resource.channelId : null, 
                            resource.type === 'discord' ? resource.webhookId : null, 
                            remoteId, 
                            encryptedKey, 
                            method, 
                            encData.length, 
                            iv.toString('hex'), 
                            authTag ? authTag.toString('hex') : null
                        ]
                    );
                }
                
                chunkIndex++;
            }
        }
        
        // Handle remaining buffer
        if (buffer.length > 0) {
            const resource = await getLeastLoaded();
            const method = CRYPTO_METHODS[Math.floor(Math.random() * CRYPTO_METHODS.length)];
            const key = crypto.randomBytes(32);
            
            const { data: encData, iv, authTag } = encryptChunk(buffer, method, key);
            const encryptedKey = encryptKey(key);
            
            let remoteId;
            if (resource.type === 'telegram') {
                const bot = tgBots[Math.floor(Math.random() * tgBots.length)];
                if (bot) {
                    const msg = await bot.bot.sendDocument(
                        resource.channelId, 
                        encData, 
                        { caption: `${fileId}:${chunkIndex}` }
                    );
                    remoteId = msg.message_id.toString();
                    const channel = tgChannels.find(c => c.id === resource.channelId);
                    if (channel) channel.load++;
                }
            } else {
                const webhook = dcWebhooks.find(w => w.id === resource.webhookId);
                if (webhook) {
                    const msg = await webhook.webhook.send({ 
                        files: [{ attachment: encData, name: `${fileId}_${chunkIndex}.enc` }] 
                    });
                    remoteId = msg.id;
                    webhook.load++;
                }
            }
            
            if (remoteId) {
                await storageDB.query(
                    `INSERT INTO chunks (file_id, chunk_index, service, bot_id, channel_id, webhook_id, remote_id, encrypted_key, encryption_method, chunk_size, iv, auth_tag)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
                    [
                        fileId, 
                        chunkIndex, 
                        resource.type, 
                        resource.type === 'telegram' ? tgBots[0]?.id : null, 
                        resource.type === 'telegram' ? resource.channelId : null, 
                        resource.type === 'discord' ? resource.webhookId : null, 
                        remoteId, 
                        encryptedKey, 
                        method, 
                        encData.length, 
                        iv.toString('hex'), 
                        authTag ? authTag.toString('hex') : null
                    ]
                );
            }
        }
        
        // Clean up temp file
        fs.unlinkSync(filePath);
        
        console.log(`✅ File uploaded: ${fileId} (${file.size} bytes, ${chunkIndex + 1} chunks)`);
        
        res.json({ 
            fileId, 
            fileName: file.originalname,
            size: file.size,
            chunks: chunkIndex + 1 
        });
        
    } catch (err) {
        console.error('❌ Upload error:', err.message);
        fs.unlinkSync(file.path);
        res.status(500).json({ error: 'Upload failed', details: err.message });
    }
});

// ----- Download File -----
app.get('/api/storage/download/:fileId', async (req, res) => {
    const { fileId } = req.params;
    
    try {
        const fileResult = await storageDB.query('SELECT * FROM files WHERE id = $1', [fileId]);
        if (fileResult.rows.length === 0) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const file = fileResult.rows[0];
        const chunksResult = await storageDB.query(
            'SELECT * FROM chunks WHERE file_id = $1 ORDER BY chunk_index', 
            [fileId]
        );
        
        if (chunksResult.rows.length === 0) {
            return res.status(404).json({ error: 'No chunks found' });
        }
        
        const chunks = chunksResult.rows;
        
        // Set headers
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
        res.setHeader('Content-Length', file.size);
        
        // Stream chunks
        for (const chunk of chunks) {
            let encData;
            
            try {
                if (chunk.service === 'telegram') {
                    const bot = tgBots.find(b => b.id === chunk.bot_id);
                    if (!bot) {
                        console.error('Bot not found:', chunk.bot_id);
                        continue;
                    }
                    
                    const msg = await bot.bot.getMessage(chunk.channel_id, parseInt(chunk.remote_id));
                    const fileLink = await bot.bot.getFileLink(msg.document.file_id);
                    const response = await fetch(fileLink);
                    encData = Buffer.from(await response.arrayBuffer());
                    
                } else if (chunk.service === 'discord') {
                    const webhook = dcWebhooks.find(w => w.id === chunk.webhook_id);
                    if (!webhook) {
                        console.error('Webhook not found:', chunk.webhook_id);
                        continue;
                    }
                    
                    const msg = await webhook.webhook.fetchMessage(chunk.remote_id);
                    const attachment = msg.attachments.first();
                    const response = await fetch(attachment.url);
                    encData = Buffer.from(await response.arrayBuffer());
                }
                
                const key = decryptKey(chunk.encrypted_key);
                const iv = Buffer.from(chunk.iv, 'hex');
                const authTag = chunk.auth_tag ? Buffer.from(chunk.auth_tag, 'hex') : null;
                
                const decrypted = decryptChunk(encData, chunk.encryption_method, key, iv, authTag);
                res.write(decrypted);
                
            } catch (err) {
                console.error(`❌ Failed to download chunk ${chunk.chunk_index}:`, err.message);
            }
        }
        
        res.end();
        console.log(`✅ File downloaded: ${fileId}`);
        
    } catch (err) {
        console.error('❌ Download error:', err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Download failed', details: err.message });
        }
    }
});

// ----- Delete File -----
app.delete('/api/storage/delete/:fileId', async (req, res) => {
    const { fileId } = req.params;
    
    try {
        const chunks = await storageDB.query('SELECT * FROM chunks WHERE file_id = $1', [fileId]);
        
        // Delete from remote services
        for (const chunk of chunks.rows) {
            try {
                if (chunk.service === 'telegram') {
                    const bot = tgBots.find(b => b.id === chunk.bot_id);
                    if (bot) {
                        await bot.bot.deleteMessage(chunk.channel_id, parseInt(chunk.remote_id));
                    }
                } else if (chunk.service === 'discord') {
                    const webhook = dcWebhooks.find(w => w.id === chunk.webhook_id);
                    if (webhook) {
                        await webhook.webhook.deleteMessage(chunk.remote_id);
                    }
                }
            } catch (err) {
                console.error(`Failed to delete chunk ${chunk.chunk_index}:`, err.message);
            }
        }
        
        // Delete from database
        await storageDB.query('DELETE FROM chunks WHERE file_id = $1', [fileId]);
        await storageDB.query('DELETE FROM files WHERE id = $1', [fileId]);
        
        console.log(`✅ File deleted: ${fileId}`);
        res.json({ success: true });
        
    } catch (err) {
        console.error('❌ Delete error:', err.message);
        res.status(500).json({ error: 'Delete failed', details: err.message });
    }
});

// ----- File Info -----
app.get('/api/storage/info/:fileId', async (req, res) => {
    const { fileId } = req.params;
    
    try {
        const fileResult = await storageDB.query('SELECT * FROM files WHERE id = $1', [fileId]);
        if (fileResult.rows.length === 0) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const file = fileResult.rows[0];
        const chunksResult = await storageDB.query(
            'SELECT service, COUNT(*) as count FROM chunks WHERE file_id = $1 GROUP BY service', 
            [fileId]
        );
        
        res.json({
            fileId: file.id,
            fileName: file.name,
            size: file.size,
            mimeType: file.mime_type,
            chunks: file.chunks,
            uploadedAt: file.uploaded_at,
            distribution: chunksResult.rows
        });
        
    } catch (err) {
        console.error('❌ Info error:', err.message);
        res.status(500).json({ error: 'Info failed', details: err.message });
    }
});

// ----- Health Check -----
app.get('/api/storage/health', (req, res) => {
    res.json({
        status: 'ok',
        telegramBots: tgBots.length,
        telegramChannels: tgChannels.length,
        discordWebhooks: dcWebhooks.length,
        totalResources: tgBots.length + tgChannels.length + dcWebhooks.length
    });
});

// ----- Start Server -----
const PORT = process.env.PORT || 3002;
loadResources().then(() => {
    app.listen(PORT, () => {
        console.log(`\n🚀 Storage Server running on port ${PORT}`);
        console.log(`📦 Telegram bots: ${tgBots.length}`);
        console.log(`📦 Telegram channels: ${tgChannels.length}`);
        console.log(`📦 Discord webhooks: ${dcWebhooks.length}\n`);
    });
});
