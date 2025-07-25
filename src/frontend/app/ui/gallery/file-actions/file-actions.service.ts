import {Injectable} from '@angular/core';
import { NetworkService } from '../../../model/network/network.service';

@Injectable()
export class GalleryFileActionsService {
  private selectedPaths: string[] = [];

  constructor(private networkService: NetworkService) {}

  public multipleSelectedPaths(): boolean {
    return this.selectedPaths.length > 1;
  }

  public addSelectedPath(path: string): void {
    if (!this.selectedPaths.includes(path)) {
      this.selectedPaths.push(path);
    }
  }

  public removeSelectedPath(path: string): void {
    const index = this.selectedPaths.indexOf(path);
    if (index > -1) {
      this.selectedPaths.splice(index, 1);
    }
  }

  public clearSelectedPaths(): void {
    this.selectedPaths = [];
  }

  public getSelectedPaths(): string[] {
    return this.selectedPaths;
  }

  public numberOfSelectedPaths(): number {
    return this.selectedPaths.length;
  }

  public pathIsSelected(path: string): boolean {
    return this.selectedPaths.includes(path);
  }

  public addSelectedPaths(paths: string[]): void {
    for (const path of paths) {
      this.addSelectedPath(path);
    }
  }

  public toggleSelectedPath(path: string): void {
    if (this.pathIsSelected(path)) {
      this.removeSelectedPath(path);
    } else {
      this.addSelectedPath(path);
    }
  }

  public hasSelectedPaths(): boolean {
    return this.selectedPaths.length > 0;
  }

  public async moveFiles(destinationPath: string, destinationFileName: string, force: boolean): Promise<void> {
    const formData = new FormData();
    for (const sourcePath of this.selectedPaths) {
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

  public async deleteFiles(): Promise<void> {
    const formData = new FormData();
    for (const targetPath of this.selectedPaths) {
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
