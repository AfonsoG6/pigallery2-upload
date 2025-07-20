import { Injectable } from '@angular/core';
import { NetworkService } from '../../model/network/network.service';

@Injectable()
export class UploadService {
  constructor(private networkService: NetworkService) {}

  public async uploadFiles(files: File[]): Promise<void> {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    try {
      await this.networkService.postMultipartFormData('/upload/', formData);
    } catch (error) {
      console.error('Error uploading files:', error);
      throw error;
    }
  }
}
