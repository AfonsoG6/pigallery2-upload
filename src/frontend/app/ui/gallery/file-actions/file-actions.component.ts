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
  @Input() action: 'move' | 'delete';
  @Input() showText = true;
  modalRef: BsModalRef = null;

  @Input() sourcePaths: string[] = [];
  destinationPath = '';
  destinationFileName = '';
  force = false;

  invalidPathError = false;

  constructor(
    private modalService: BsModalService,
    private fileActionsService: GalleryFileActionsService,
    private notification: NotificationService,
    private router: Router,
    private contentLoaderService: ContentLoaderService
  ) {}

  resetForm(): void {
    this.sourcePaths = [];
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
  }

  hideModal(): void {
    if (this.modalRef) {
      this.modalRef.hide();
      this.modalRef = null;
    }
  }

  addSourcePath(path: string): void {
    if (!this.sourcePaths.includes(path)) {
      this.sourcePaths.push(path);
    }
  }

  removeSourcePath(path: string): void {
    this.sourcePaths = this.sourcePaths.filter(p => p !== path);
  }

  getPlaceholderFileName(): string {
    if (this.sourcePaths.length === 1) {
      return path.basename(this.sourcePaths[0]);
    }
    else {
      return "";
    }
  }

  private plural(): string {
    return this.sourcePaths.length > 1 ? 's' : '';
  }

  async performAction(): Promise<void> {
    if (this.action === 'move') {
      try {
        await this.fileActionsService.moveFiles(this.sourcePaths, this.destinationPath, this.destinationFileName, this.force);
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
      this.notification.success(`Successfully moved ${this.sourcePaths.length} file${this.plural()} to ${this.destinationPath}`);
    } else if (this.action === 'delete') {
      try {
        await this.fileActionsService.deleteFiles(this.sourcePaths);
      } catch (error) {
        this.notification.error(`Failed to delete file${this.plural()}`);
        return;
      }
      this.notification.success(`Successfully deleted ${this.sourcePaths.length} file${this.plural()}`);
    }
    await this.redirectToParentDirectory();
  }

  private async redirectToParentDirectory(): Promise<void> {
    const parentPath = path.dirname(this.sourcePaths[0]);
    this.hideModal();
    this.resetForm();
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
