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

  private getTargetPathCount(): number {
    return this.fileActionsService.getSelectedPathCount();
  }

  private getFailedPathCount(): number {
    return this.fileActionsService.getFailedPathCount();
  }

  private getSuccessfulPathCount(): number {
    return this.fileActionsService.getSuccessfulPathCount();
  }

  private async handleResult(resultDTO: FileActionResultDTO): Promise<void> {
    this.fileActionsService.updateFailedAndSuccessfulPaths(resultDTO.failedPaths);
    if (resultDTO.failedPaths.length > 0) {
      // Partial success
      const firstReason = resultDTO.failedPaths[0].reason;
      if (resultDTO.failedPaths.every(failedPath => failedPath.reason.code === firstReason.code)) {
        this.notification.error(ErrorDTO.getStandardMessage(firstReason.code));
      } else {
        this.notification.error(`Multiple errors occurred`);
      }
      return Promise.reject();
    }
    // Complete success
    if (this.action === 'move') {
      this.notification.success(`Successfully moved ${this.getTargetPathCount()} file${this.getSuccessfulPathCount() > 0 ? 's' : ''} to ${this.destinationPath}`);
    } else if (this.action === 'delete') {
      this.notification.success(`Successfully deleted ${this.getTargetPathCount()} file${this.getSuccessfulPathCount() > 0 ? 's' : ''}`);
    }
    this.hideModal();
    const parentPath = path.dirname(this.fileActionsService.getSelectedPaths()[0]);
    this.fileActionsService.clearSelectedPaths();
    this.resetForm();
    await this.redirectToDirectory(parentPath);
    return Promise.resolve();
  }

  async performActionAsync(): Promise<void> {
    try {
      if (this.action === 'clear') {
        this.resetForm();
        return Promise.resolve();
      }
      let resultDTO: FileActionResultDTO;
      if (this.action === 'move') {
        resultDTO = await this.fileActionsService.moveFiles(this.destinationPath, this.destinationFileName, this.force)
          .catch((e) => { throw e; });
      } else if (this.action === 'delete') {
        resultDTO = await this.fileActionsService.deleteFiles()
          .catch((e) => { throw e; });
      }
      return this.handleResult(resultDTO);
    } catch (e) {
      if (e instanceof ErrorDTO) {
        this.notification.error(ErrorDTO.getStandardMessage(e.code));
        this.invalidPathError = (e.code === ErrorCodes.FILE_INVALID_PATH_ERROR);
      } else {
        this.notification.error('An unknown error occurred');
        console.log(e);
      }
      return Promise.reject();
    }
  }

  performAction(): void {
    this.state = State.PERFORMING;
    this.performActionAsync().then(() => {
      this.state = State.FINISHED;
      this.fileActionsService.clearSelectedPaths();
    }).catch(() => {
      this.state = State.STANDBY;
    });
  }

  private async redirectToDirectory(dir: string): Promise<void> {
    GalleryCacheService.deleteCache();
    await this.router.navigate(['/gallery', dir]);
    await this.contentLoaderService.loadDirectory(dir);
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
