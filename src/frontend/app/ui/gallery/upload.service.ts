import { Injectable } from '@angular/core';
import { NetworkService } from '../../model/network/network.service';

@Injectable()
export class UploadService {
  constructor(private networkService: NetworkService) {}

  public async uploadFile(file: File, uploadPath: string, autoOrganize: boolean, force: boolean): Promise<void> {
    const formData = new FormData();
    // Put fields first so multer can read them before the file arrives
    formData.append("uploadPath", uploadPath);
    formData.append("autoOrganize", String(autoOrganize));
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
}
