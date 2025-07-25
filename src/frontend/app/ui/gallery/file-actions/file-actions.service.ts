import {Injectable} from '@angular/core';
import { NetworkService } from '../../../model/network/network.service';

@Injectable()
export class GalleryFileActionsService {
  constructor(private networkService: NetworkService) {}

  public async moveFiles(sourcePaths: string[], destinationPath: string, destinationFileName: string, force: boolean): Promise<void> {
    const formData = new FormData();
    for (const sourcePath of sourcePaths) {
      formData.append('sourcePath', sourcePath);
    }
    formData.append('destinationPath', destinationPath);
    if (destinationFileName) {
      formData.append('destinationFileName', destinationFileName);
    }
    formData.append('force', String(force));

    try {
      return await this.networkService.postMultipartFormData('/gallery/move/', formData);
    } catch (error) {
      console.error('Error moving files:', error);
      throw error;
    }
  }

  public async deleteFiles(targetPaths: string[]): Promise<void> {
    const formData = new FormData();
    for (const targetPath of targetPaths) {
      formData.append('targetPath', targetPath);
    }

    try {
      return await this.networkService.postMultipartFormData('/gallery/delete/', formData);
    } catch (error) {
      console.error('Error deleting files:', error);
      throw error;
    }
  }

}
