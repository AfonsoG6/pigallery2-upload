import { Injectable } from '@angular/core';
import { NetworkService } from '../../model/network/network.service';
import * as crypto from 'crypto-js';

@Injectable()
export class UploadService {
  constructor(private networkService: NetworkService) {}

  public async uploadFile(file: File, uploadPath: string, autoOrganize: boolean, force: boolean): Promise<void> {
    const formData = new FormData();
    // Put fields first so multer can read them before the file arrives
    formData.append("uploadPath", uploadPath);
    formData.append("autoOrganize", String(autoOrganize));
    formData.append("sha256", String(await this.getFileSHA256(file)));
    formData.append("force", String(force));
    formData.append("lastModified", String(file.lastModified));
    // File last, so storage callbacks receive populated req.body
    formData.append("file", file);

    try {
      return await this.networkService.postMultipartFormData('/gallery/upload/', formData, false);
    } catch (error) {
      console.error('Error uploading files:', error);
      throw error;
    }
  }

  public async organizeUploadedFiles(uploadPath: string): Promise<void> {
    const data = {
      uploadPath: uploadPath
    };
    try {
      return await this.networkService.postJson('/gallery/upload/organize', data);
    } catch (error) {
      console.error('Error organizing uploaded files:', error);
      throw error;
    }
  }

  public async getFileSHA256(file: File): Promise<string> {
    const chunkSize = 4 * 1024 * 1024; // 4MB
    const hasher = crypto.algo.SHA256.create();
    let offset = 0;

    while (offset < file.size) {
      const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error || new Error('Failed to read file slice'));
        reader.readAsArrayBuffer(slice);
      });
      const wordArray = crypto.lib.WordArray.create(buffer);
      hasher.update(wordArray);
      offset += chunkSize;
    }

    return hasher.finalize().toString(crypto.enc.Hex);
  }
}
