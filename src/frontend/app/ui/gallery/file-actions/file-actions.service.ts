import {Injectable} from '@angular/core';
import { NetworkService } from '../../../model/network/network.service';
import { FileActionResultDTO } from '../../../../../common/entities/FileActionResultDTO';

@Injectable()
export class GalleryFileActionsService {
  private selectedPaths: string[] = [];
  private successfulPaths: Set<string> = new Set();
  private failedPaths: Set<string> = new Set();

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

  public updateFailedAndSuccessfulPaths(failedPaths: string[]): void {
    for (const sPath of this.selectedPaths) {
      if (failedPaths.includes(sPath)) {
        this.failedPaths.add(sPath);
      }
      else {
        this.failedPaths.delete(sPath);
        this.successfulPaths.add(sPath);
      }
    }
  }

  public allFailed(paths: string[]): boolean {
    return paths.length === this.selectedPaths.filter(path => !this.successful(path)).length;
  }

  public successful(path: string): boolean {
    return this.successfulPaths.has(path);
  }

  public failed(path: string): boolean {
    return this.failedPaths.has(path);
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

  public async moveFiles(destinationPath: string, destinationFileName: string, force: boolean): Promise<FileActionResultDTO> {
    const formData = new FormData();
    for (const sourcePath of this.selectedPaths) {
      if (this.successful(sourcePath)) continue;
      formData.append('sourcePath', sourcePath);
    }
    formData.append('destinationPath', destinationPath);
    if (destinationFileName) {
      formData.append('destinationFileName', destinationFileName);
    }
    formData.append('force', String(force));

    try {
      return await this.networkService.postMultipartFormData<FileActionResultDTO>('/gallery/move/', formData);
    } catch (error) {
      console.error('Error moving files:', error);
      throw error;
    }
  }

  public async deleteFiles(): Promise<FileActionResultDTO> {
    const formData = new FormData();
    for (const targetPath of this.selectedPaths) {
      if (this.successful(targetPath)) continue;
      formData.append('targetPath', targetPath);
    }

    try {
      return await this.networkService.postMultipartFormData<FileActionResultDTO>('/gallery/delete/', formData);
    } catch (error) {
      console.error('Error deleting files:', error);
      throw error;
    }
  }

}
