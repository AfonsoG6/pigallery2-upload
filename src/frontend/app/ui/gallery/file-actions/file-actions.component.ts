import { Component, Input, TemplateRef } from '@angular/core';
import { BsModalService, BsModalRef } from 'ngx-bootstrap/modal';
import { GalleryFileActionsService } from './file-actions.service';
import * as path from 'path-browserify';
import { ErrorCodes } from '../../../../../common/entities/Error';
import { NotificationService } from '../../../model/notification.service';
import { Router } from '@angular/router';
import { ContentLoaderService } from '../contentLoader.service';
import { GalleryCacheService } from '../cache.gallery.service';

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

  private plural(): string {
    return this.fileActionsService.multipleSelectedPaths() ? 's' : '';
  }

  private nTargets(): number {
    return this.fileActionsService.numberOfSelectedPaths();
  }

  async performAction(): Promise<void> {
    if (this.action === 'move') {
      try {
        await this.fileActionsService.moveFiles(this.destinationPath, this.destinationFileName, this.force);
      } catch (error) {
        if (error.code == ErrorCodes.INVALID_PATH_ERROR) {
          this.notification.error('Invalid destination path: ' + this.destinationPath);
          this.invalidPathError = true;
          return;
        }
        if (error.code == ErrorCodes.FILE_EXISTS_ERROR) {
          this.notification.error(`File${this.plural()} already exists at destination: ${this.destinationPath}`);
          this.invalidPathError = false;
          return;
        }
        this.notification.error(`Failed to move file${this.plural()}`);
        this.invalidPathError = false;
        return;
      }
      this.notification.success(`Successfully moved ${this.nTargets()} file${this.plural()} to ${this.destinationPath}`);
    } else if (this.action === 'delete') {
      try {
        await this.fileActionsService.deleteFiles();
      } catch (error) {
        this.notification.error(`Failed to delete file${this.plural()}`);
        return;
      }
      this.notification.success(`Successfully deleted ${this.nTargets()} file${this.plural()}`);
    }
    else {
      this.fileActionsService.clearSelectedPaths();
      return;
    }
    this.fileActionsService.clearSelectedPaths();
    this.resetForm();
    this.hideModal();
    await this.redirectToParentDirectory();
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
