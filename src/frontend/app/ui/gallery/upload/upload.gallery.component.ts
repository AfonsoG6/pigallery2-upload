import { Component, Input, OnInit, TemplateRef } from '@angular/core';
import { NotificationService } from '../../../model/notification.service';
import { UploadService } from '../upload.service';
import { BsModalService, BsModalRef } from 'ngx-bootstrap/modal';
import { Utils } from '../../../../../common/Utils';
import { ContentLoaderService } from '../contentLoader.service';
import { Subscription } from 'rxjs';
import { ContentWrapper } from '../../../../../common/entities/ConentWrapper';
import { AuthenticationService } from '../../../model/network/authentication.service';
import { ErrorCodes } from '../../../../../common/entities/Error';
import { GalleryCacheService } from '../cache.gallery.service';

enum State {
  STANDBY = 0,
  UPLOADING = 1,
  FINISHED = 2,
}

@Component({
  selector: 'app-gallery-upload',
  templateUrl: './upload.gallery.component.html',
  styleUrls: ['./upload.gallery.component.css'],
})
export class GalleryUploadComponent implements OnInit {
  enabled = true;
  @Input() dropDownItem = false;
  modalRef: BsModalRef;
  isDragOver = false;

  state: State = State.STANDBY;

  files: { [key: string]: File } = {};
  successfulFiles: string[] = [];
  failedFiles: string[] = [];

  autoOrganize = true;
  force = false;

  currentDir = '';
  uploadDir = this.authService.user.value.name;
  invalidPathError = false;
  contentSubscription: Subscription = null;

  constructor(
    private uploadService: UploadService,
    private notification: NotificationService,
    private modalService: BsModalService,
    private contentLoaderService: ContentLoaderService,
    private authService: AuthenticationService,
  ) {}

  ngOnInit(): void {
      this.contentSubscription = this.contentLoaderService.content.subscribe(
          async (content: ContentWrapper) => {
            if (content && content.directory && content.directory.path && content.directory.name) {
              this.currentDir = Utils.concatUrls(
                  content.directory.path,
                  content.directory.name
              );
              if (!this.autoOrganize) this.uploadDir = this.currentDir;
            }
            else {
              this.currentDir = '';
              if (!this.autoOrganize) this.uploadDir = '';
            }
          }
      );
    }

    ngOnDestroy(): void {
      if (this.contentSubscription !== null) {
        this.contentSubscription.unsubscribe();
      }
    }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (this.state !== State.STANDBY) return;
    this.isDragOver = true;
  }

  onDragLeave(): void {
    if (this.state !== State.STANDBY) return;
    this.isDragOver = false;
  }

  onFileDropped(event: DragEvent): void {
    event.preventDefault();
    if (this.state !== State.STANDBY) return;
    this.isDragOver = false;
    if (event.dataTransfer && event.dataTransfer.files) {
      const fileList = event.dataTransfer.files;
      this.addFiles(fileList);
      this.notification.success('Files added successfully.');
    } else {
      this.notification.error('No files found in the drop event.');
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.addFiles(input.files);
    }
  }

  private addFiles(fileList: FileList): void {
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      this.files[file.name] = file;
    }
  }

  removeFile(fileName: string): void {
    delete this.files[fileName];
  }

  private plural(): string {
    return Object.keys(this.files).length > 1 ? 's' : '';
  }

  async uploadFiles(): Promise<void> {
    if (Object.keys(this.files).length === 0) {
      this.notification.error('No files selected for upload.');
      return;
    }

    this.state = State.UPLOADING;
    for (const fileName in this.files) {
      if (this.successfulFiles.includes(fileName)) continue;

      try {
        await this.uploadService.uploadFile(this.files[fileName], this.uploadDir, this.autoOrganize, this.force);
        this.successfulFiles.push(fileName);
        if (this.failedFiles.includes(fileName)) {
          this.failedFiles = this.failedFiles.filter(f => f !== fileName);
        }
      } catch (error) {
        this.failedFiles.push(fileName);
        if (error.code == ErrorCodes.INVALID_PATH_ERROR) {
          this.notification.error('Invalid upload path: ' + this.uploadDir);
          this.invalidPathError = true;
          this.state = State.STANDBY;
          return;
        }
        if (error.code == ErrorCodes.FILE_EXISTS_ERROR) {
          this.notification.error(`File${this.plural()} already exists: ${fileName}`);
          continue;
        }
      }
    }
    if (this.successfulFiles.length === 0 && this.failedFiles.length > 0) {
      this.notification.error(`Failed to upload file${this.plural()}`);
      this.state = State.STANDBY;
      return;
    }

    this.notification.success(`Successfully uploaded ${this.successfulFiles.length} file${this.plural()}`);
    if (this.autoOrganize) {
      try {
        await this.uploadService.organizeUploadedFiles(this.uploadDir);
        this.notification.success(`File${this.plural()} organized successfully.`);
      }
      catch (error) {
        if (error.code == ErrorCodes.INVALID_PATH_ERROR) {
          this.notification.error('Invalid upload path: ' + this.uploadDir);
          this.invalidPathError = true;
          this.state = State.STANDBY;
          return;
        }
        else {
          this.notification.error(`Failed to organize file${this.plural()}`);
        }
      }
    }
    this.invalidPathError = false;
    if (this.successfulFiles.length == Object.keys(this.files).length) {
      this.state = State.FINISHED;
      this.refreshParentDirectory();
    }
  }

  openModal(template: TemplateRef<unknown>): void {
    if (this.modalRef) {
      this.modalRef.hide();
    }
    this.modalRef = this.modalService.show(template);
  }

  hideModal(): void {
    if (this.modalRef) {
      this.modalRef.hide();
      this.modalRef = null;
    }
  }

  resetForm(): void {
    this.state = State.STANDBY;
    this.files = {};
    this.successfulFiles = [];
    this.failedFiles = [];
    this.autoOrganize = true;
    this.force = false;
    this.uploadDir = this.authService.user.value.name;
    this.invalidPathError = false;
  }

  private async refreshParentDirectory(): Promise<void> {
    GalleryCacheService.deleteCache();
    await this.contentLoaderService.loadDirectory(this.currentDir);
  }

  triggerFileInput(): void {
    if (this.state !== State.STANDBY) return;
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  onChangeAutoOrganize(event: Event): void {
    this.autoOrganize = (event.target as HTMLInputElement).checked;
    if (this.autoOrganize) {
      this.uploadDir = this.authService.user.value.name
    }
    else {
      this.uploadDir = this.currentDir;
    }
  }

  onChangeForce(event: Event): void {
    this.force = (event.target as HTMLInputElement).checked;
  }

  setUploadDir(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.value) {
      this.uploadDir = input.value;
    } else {
      this.uploadDir = '';
    }
  }
}
