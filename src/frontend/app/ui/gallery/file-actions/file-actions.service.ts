import {Injectable} from '@angular/core';
import { NetworkService } from '../../../model/network/network.service';
import { FailedPathDTO, FileActionResultDTO } from '../../../../../common/entities/FileActionResultDTO';
import { ErrorCodes, ErrorDTO } from '../../../../../common/entities/Error';

@Injectable()
export class GalleryFileActionsService {
  private selectedPaths: string[] = [];
  private successfulPaths: Set<string> = new Set();
  private failedPaths: Set<string> = new Set();
  // store failure reason per path (by error code)
  private failedPathReasons: Map<string, ErrorCodes> = new Map();

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
    this.successfulPaths.delete(path);
    this.failedPaths.delete(path);
    this.failedPathReasons.delete(path);
  }

  public clearSelectedPaths(): void {
    this.selectedPaths = [];
    this.successfulPaths.clear();
    this.failedPaths.clear();
    this.failedPathReasons.clear();
  }

  public getSelectedPaths(): string[] {
    return this.selectedPaths;
  }

  public getSelectedPathCount(): number {
    return this.selectedPaths.length;
  }

  public getFailedPathCount(): number {
    return this.failedPaths.size;
  }

  public getSuccessfulPathCount(): number {
    return this.successfulPaths.size;
  }

  public pathIsSelected(path: string): boolean {
    return this.selectedPaths.includes(path);
  }

  public addSelectedPaths(paths: string[]): void {
    for (const path of paths) {
      this.addSelectedPath(path);
    }
  }

  public updateFailedAndSuccessfulPaths(failed: FailedPathDTO[]): void {
    const failedSet = new Set(failed.map(fp => fp.path));
    for (const sPath of this.selectedPaths) {
      if (failedSet.has(sPath)) {
        this.failedPaths.add(sPath);
        const reason: ErrorDTO | undefined = failed.find(fp => fp.path === sPath)?.reason as ErrorDTO | undefined;
        if (reason && typeof reason.code !== 'undefined') {
          this.failedPathReasons.set(sPath, reason.code as ErrorCodes);
        } else {
          this.failedPathReasons.set(sPath, ErrorCodes.GENERAL_ERROR);
        }
      } else {
        this.failedPaths.delete(sPath);
        this.failedPathReasons.delete(sPath);
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

  public getFailureReason(path: string): string {
    const code = this.failedPathReasons.get(path);
    if (typeof code === 'number') {
      return ErrorDTO.getStandardMessage(code);
    }
    return 'An unknown error occurred.';
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
    try {
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

      return await this.networkService.postMultipartFormData<FileActionResultDTO>('/gallery/move/', formData);
    } catch (error) {
      console.error('Error moving files:', error);
      return Promise.reject(error);
    }
  }

  public async deleteFiles(): Promise<FileActionResultDTO> {
    try {
      const formData = new FormData();
      for (const targetPath of this.selectedPaths) {
        if (this.successful(targetPath)) continue;
        formData.append('targetPath', targetPath);
      }

      return await this.networkService.postMultipartFormData<FileActionResultDTO>('/gallery/delete/', formData);
    } catch (error) {
      console.error('Error deleting files:', error);
      return Promise.reject(error);
    }
  }

}
