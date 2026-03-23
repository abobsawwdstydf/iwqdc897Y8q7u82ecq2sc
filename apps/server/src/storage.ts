import axios from 'axios';

const STORAGE_URL = process.env.STORAGE_URL || 'http://localhost:3002';

export interface UploadedFile {
    fileId: string;
    fileName: string;
    size: number;
    chunks: number;
}

export async function uploadToStorage(file: Express.Multer.File): Promise<UploadedFile> {
    const formData = new FormData();
    const blob = new Blob([file.buffer], { type: file.mimetype });
    formData.append('file', blob, file.originalname);

    const response = await axios.post(`${STORAGE_URL}/api/storage/upload`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    });

    return response.data;
}

export async function downloadFromStorage(fileId: string): Promise<Buffer> {
    const response = await axios.get(`${STORAGE_URL}/api/storage/download/${fileId}`, {
        responseType: 'arraybuffer',
    });

    return Buffer.from(response.data);
}

export async function deleteFromStorage(fileId: string): Promise<void> {
    await axios.delete(`${STORAGE_URL}/api/storage/delete/${fileId}`);
}

export async function getFileInfo(fileId: string): Promise<any> {
    const response = await axios.get(`${STORAGE_URL}/api/storage/info/${fileId}`);
    return response.data;
}

export async function checkStorageHealth(): Promise<any> {
    const response = await axios.get(`${STORAGE_URL}/api/storage/health`);
    return response.data;
}
