import { Component, Input, TemplateRef } from '@angular/core';
import { BsModalService, BsModalRef } from 'ngx-bootstrap/modal';
import { GalleryFileActionsService } from './file-actions.service';
import * as path from 'path-browserify';
import { ErrorCodes, ErrorDTO } from '../../../../../common/entities/Error';
import { NotificationService } from '../../../model/notification.service';
import { Router } from '@angular/router';
import { ContentLoaderService } from '../contentLoader.service';
import { GalleryCacheService } from '../cache.gallery.service';
import { FileActionResultDTO } from '../../../../../common/entities/FileActionResultDTO';

enum State {
  STANDBY = 0,
  PERFORMING = 1,
  FINISHED = 2,
}


@Component({
  selector: 'app-file-actions',
  templateUrl: './file-actions.component.html',
  styleUrls: ['./file-actions.component.css'],
})
export class GalleryFileActionsComponent {
  @Input() action: 'move' | 'delete' | 'clear';
  @Input() showText = true;
  @Input() inputPaths: string[] = [];
  modalRef: BsModalRef = null;

  destinationPath = '';
  destinationFileName = '';
  force = false;

  state: State = State.STANDBY;
  invalidPathError = false;

  constructor(
    private modalService: BsModalService,
    public fileActionsService: GalleryFileActionsService,
    private notification: NotificationService,
    private router: Router,
    private contentLoaderService: ContentLoaderService
  ) {}

  resetForm(): void {
    this.destinationPath = '';
    this.destinationFileName = '';
    this.force = false;
    this.invalidPathError = false;
    this.state = State.STANDBY;
  }

  openModal(template: TemplateRef<unknown>): void {
    if (!this.modalRef) {
      console.log('Modal opened for action:', this.action);
      this.modalRef = this.modalService.show(template);
    }
    this.fileActionsService.addSelectedPaths(this.inputPaths);
  }

  hideModal(): void {
    if (this.modalRef) {
      this.modalRef.hide();
      this.modalRef = null;
    }
  }

  close(): void {
    this.hideModal();
    if (this.inputPaths.length > 0 || this.state === State.FINISHED) {
      this.fileActionsService.clearSelectedPaths();
      this.resetForm();
    }
  }

  addSourcePath(path: string): void {
    this.fileActionsService.addSelectedPath(path);
  }

  removeSourcePath(path: string): void {
    this.fileActionsService.removeSelectedPath(path);
  }

  getPlaceholderFileName(): string {
    if (!this.fileActionsService.multipleSelectedPaths()) {
      return path.basename(this.fileActionsService.getSelectedPaths()[0]);
    }
    else {
      return "(unchanged)";
    }
  }

  private plural(opposite = false): string {
    if (opposite) return this.fileActionsService.multipleSelectedPaths() ? '' : 's';
    return this.fileActionsService.multipleSelectedPaths() ? 's' : '';
  }

  private nTargets(): number {
    return this.fileActionsService.numberOfSelectedPaths();
  }

  private async handleResult(resultDTO: FileActionResultDTO): Promise<void> {
    if (resultDTO.failedPaths.length === 0) {
      this.state = State.FINISHED;
      if (this.action === 'move')
        this.notification.success(`Successfully moved ${this.nTargets()} file${this.plural()} to ${this.destinationPath}`);
      else if (this.action === 'delete')
        this.notification.success(`Successfully deleted ${this.nTargets()} file${this.plural()}`);
    }
    else {
      if (this.fileActionsService.allFailed(resultDTO.failedPaths.map(failedPath => failedPath.path))) {
        // Send one single notification if all paths failed
        const firstReason = resultDTO.failedPaths[0].reason;
        if (resultDTO.failedPaths.every(failedPath => failedPath.reason.code === firstReason.code)) {
          this.notifyError(firstReason);
        }
        else {
          this.notification.error(`Failed to ${this.action} file${this.plural()} due to multiple errors`);
        }
      }
      else {
        // Send individual notifications for each failed path
        for (const failedPathDTO of resultDTO.failedPaths) {
          this.notification.error(failedPathDTO.reason.message);
        }
      }
      this.state = State.STANDBY;
    }
    this.fileActionsService.updateFailedAndSuccessfulPaths(resultDTO.failedPaths.map(failedPath => failedPath.path));
    if (this.state === State.FINISHED) {
      this.hideModal();
      this.fileActionsService.clearSelectedPaths();
      this.resetForm();
      await this.redirectToParentDirectory();
    }
  }

  private notifyError(errorDTO: ErrorDTO): void {
    if (errorDTO.code === ErrorCodes.INVALID_PATH_ERROR) {
      this.notification.error('Invalid destination path: ' + this.destinationPath);
      this.invalidPathError = true;
    } else if (errorDTO.code === ErrorCodes.FILE_EXISTS_ERROR) {
      this.notification.error(`File already exists at destination: ${this.destinationPath}`);
      this.invalidPathError = false;
    } else {
      this.notification.error(`Failed to ${this.action} file`);
      this.invalidPathError = false;
    }
  }

  async performAction(): Promise<void> {
    if (this.action === 'move') {
      try {
        this.state = State.PERFORMING;
        const resultDTO = await this.fileActionsService.moveFiles(this.destinationPath, this.destinationFileName, this.force);
        await this.handleResult(resultDTO);
      } catch (error) {
        this.notifyError(error as ErrorDTO);
        this.state = State.STANDBY;
      }
    }
    else if (this.action === 'delete') {
      try {
        const resultDTO = await this.fileActionsService.deleteFiles();
        await this.handleResult(resultDTO);
      } catch (error) {
        this.notifyError(error as ErrorDTO);
        this.state = State.STANDBY;
      }
    }
    else {
      this.fileActionsService.clearSelectedPaths();
    }
  }

  private async redirectToParentDirectory(): Promise<void> {
    const parentPath = path.dirname(this.fileActionsService.getSelectedPaths()[0]);
    GalleryCacheService.deleteCache();
    await this.router.navigate(['/gallery', parentPath]);
    await this.contentLoaderService.loadDirectory(parentPath);
  }

  onChangeDestinationPath(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.destinationPath = input.value.trim();
  }

  onChangeDestinationFileName(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.destinationFileName = input.value.trim();
  }

  onChangeForce(event: Event): void {
    this.force = (event.target as HTMLInputElement).checked;
  }
}
