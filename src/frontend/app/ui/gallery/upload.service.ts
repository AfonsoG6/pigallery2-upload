import { Injectable } from '@angular/core';
import { NetworkService } from '../../model/network/network.service';

@Injectable()
export class UploadService {
  constructor(private networkService: NetworkService) {}

  public async uploadFile(file: File, autoOrganize: boolean, uploadPath: string): Promise<void> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("autoOrganize", String(autoOrganize));
    formData.append("uploadPath", uploadPath);
    
    try {
      return await this.networkService.postMultipartFormData('/gallery/upload/', formData);
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
