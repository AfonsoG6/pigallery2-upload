import { Component, Input, OnInit, OnDestroy, TemplateRef } from '@angular/core';
import { NotificationService } from '../../../model/notification.service';
import { UploadService } from '../upload.service';
import { BsModalService, BsModalRef } from 'ngx-bootstrap/modal';
import { Utils } from '../../../../../common/Utils';
import { ContentLoaderService } from '../contentLoader.service';
import { Subscription } from 'rxjs';
import { ContentWrapper } from '../../../../../common/entities/ConentWrapper';
import { AuthenticationService } from '../../../model/network/authentication.service';
import { ErrorCodes, ErrorDTO } from '../../../../../common/entities/Error';
import { GalleryCacheService } from '../cache.gallery.service';
import { LoadingBarService } from '@ngx-loading-bar/core'; // added
import { LoadingBarState } from '@ngx-loading-bar/core/loading-bar.state';

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
export class GalleryUploadComponent implements OnInit, OnDestroy {
  enabled = true;
  @Input() dropDownItem = false;
  modalRef: BsModalRef;
  isDragOver = false;

  state: State = State.STANDBY;

  files: { [key: string]: File } = {};
  successfulFiles: string[] = [];
  failedFiles: string[] = [];
  failedReasons: { [fileName: string]: string } = {};

  autoOrganize = true;
  force = false;

  currentDir = '';
  uploadDir = this.authService.user.value.name;
  invalidPathError = false;
  contentSubscription: Subscription = null;

  // loading bars: one global ref and one per-file ref
  private globalLoadingBarRef = this.loadingBar.useRef('global-loading-bar');
  private fileLoadingBarRefs: { [refName: string]: LoadingBarState } = {};

  constructor(
    private uploadService: UploadService,
    private notification: NotificationService,
    private modalService: BsModalService,
    private contentLoaderService: ContentLoaderService,
    private authService: AuthenticationService,
    private loadingBar: LoadingBarService, // added
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
      // ensure a ref exists for this file
      this.getFileLoadingBar(file.name);
    }
  }

  private getTotalFileCount(): number {
    return Object.keys(this.files).length;
  }

  private getSuccessfulFileCount(): number {
    return this.successfulFiles.length;
  }

  private getFailedFileCount(): number {
    return this.failedFiles.length;
  }

  removeFile(fileName: string): void {
    delete this.files[fileName];
    // best-effort cleanup of the file ref
    const refName = this.getFileRefName(fileName);
    if (this.fileLoadingBarRefs[refName]) {
      try { this.fileLoadingBarRefs[refName].complete(); } catch { /* ignore error */ }
      delete this.fileLoadingBarRefs[refName];
    }
  }

  // helper to generate consistent ref names for files
  getFileRefName(fileName: string): string {
    return `upload-file-${fileName}`;
  }

  private getFileLoadingBar(fileName: string): LoadingBarState {
    const refName = this.getFileRefName(fileName);
    if (!this.fileLoadingBarRefs[refName]) {
      this.fileLoadingBarRefs[refName] = this.loadingBar.useRef(refName);
    }
    return this.fileLoadingBarRefs[refName];
  }

  private fileFailed(fileName: string): void {
    this.failedFiles.push(fileName);
  }

  private fileSucceeded(fileName: string): void {
    this.successfulFiles.push(fileName);
    this.failedFiles = this.failedFiles.filter(f => f !== fileName);
  }

  private safeLoadingBarStart(loadingBarRef: LoadingBarState, initialValue?: number): void {
    try { loadingBarRef.start(initialValue); } catch { /* ignore error */ }
  }

  private safeLoadingBarComplete(loadingBarRef: LoadingBarState): void {
    try { loadingBarRef.complete(); } catch { /* ignore error */ }
  }

  private safeLoadingBarSet(loadingBarRef: LoadingBarState, value: number): void {
    try { loadingBarRef.set(value); } catch { /* ignore error */ }
  }

  private getErrorMessage(err: unknown): string {
    const e = err as Partial<ErrorDTO> | undefined;
    if (e && typeof e.code === 'number') {
      return ErrorDTO.getStandardMessage(e.code as number);
    }
    return 'An unknown error occurred.';
  }

  async uploadFilesStage1(): Promise<void> {
    if (this.getTotalFileCount() === 0) {
      this.notification.error('No files selected for upload.');
      return Promise.reject();
    }

    let completedFileCount = 0;
    let stoppingError = false;
    const uploadDir = this.uploadDir;
    const autoOrganize = this.autoOrganize;
    const force = this.force;

    for (const fileName in this.files) {
      if (this.successfulFiles.includes(fileName)) continue;

      const fileLoadingBar = this.getFileLoadingBar(fileName);
      try {
        this.safeLoadingBarStart(fileLoadingBar, 0);
        await this.uploadService.uploadFile(this.files[fileName], uploadDir, autoOrganize, force);
        this.fileSucceeded(fileName);
      } catch (error) {
        // record a human-friendly reason if available
        this.failedReasons[fileName] = this.getErrorMessage(error);
        this.fileFailed(fileName);
        // If somehow an error that isn't an ErrorDTO is thrown, treat it as an unknown critical error
        if (!(error as Partial<ErrorDTO>).code) {
          stoppingError = true;
          this.notification.error('Unknown error occurred.');
        }
        // Special case: If the path provided is invalid, it will also be for all the other files
        if ((error as Partial<ErrorDTO>).code == ErrorCodes.FILE_INVALID_PATH_ERROR) {
          this.invalidPathError = true;
          stoppingError = true;
          this.notification.error('Invalid upload path: ' + uploadDir);
        }
        else {
          this.notification.error(this.getErrorMessage(error));
        }
      } finally {
        // Regardless of success or failure, proceed the progress bars
        this.safeLoadingBarComplete(fileLoadingBar);
        completedFileCount++;
        this.safeLoadingBarSet(this.globalLoadingBarRef, (completedFileCount / this.getTotalFileCount()) * 100);
      }
      if (stoppingError) break;
    }

    // If a stopping error occurred or if no files were successfully uploaded, we reject the promise
    if (stoppingError || (this.getFailedFileCount() > 0)) {
      return Promise.reject();
    }
    // If no stopping error occurred and at least one file was successfully uploaded, we resolve the promise
    this.notification.success(`Successfully uploaded ${this.getSuccessfulFileCount()} file${this.getSuccessfulFileCount() > 1 ? 's' : ''}`);
    return Promise.resolve();
  }

  async uploadFilesStage2(): Promise<void> {
    const uploadDir = this.uploadDir;
    try {
      await this.uploadService.organizeUploadedFiles(uploadDir);
    }
    catch (error) {
      if (error.code == ErrorCodes.FILE_INVALID_PATH_ERROR) {
        this.invalidPathError = true;
        this.notification.error('Invalid upload path: ' + uploadDir);
      }
      else {
        this.notification.error(`Failed to organize file${this.getSuccessfulFileCount() > 1 ? 's' : ''}`);
      }
      return Promise.reject();
    }
    this.notification.success(`File${this.getSuccessfulFileCount() > 1 ? 's' : ''} organized successfully.`);
    return Promise.resolve();
  }

  uploadFiles(): void {
    new Promise<void>(async (resolve, reject) => {
      this.state = State.UPLOADING;
      this.safeLoadingBarSet(this.globalLoadingBarRef, 0);
      await this.uploadFilesStage1().catch(() => {reject();});
      if (this.autoOrganize) {
        await this.uploadFilesStage2().catch(() => {reject();});
      }
      resolve();
    }).then(() => {
      // If we reach this point, it means all files were uploaded and auto-organized successfully
      this.invalidPathError = false;
      this.safeLoadingBarComplete(this.globalLoadingBarRef);
      this.state = State.FINISHED;
      this.refreshParentDirectory();
    }).catch(() => {
      this.safeLoadingBarComplete(this.globalLoadingBarRef);
      this.state = State.STANDBY;
    });
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
    this.failedReasons = {};
    this.autoOrganize = true;
    this.force = false;
    this.uploadDir = this.authService.user.value.name;
    this.invalidPathError = false;
    // cleanup file refs
    this.fileLoadingBarRefs = {};
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
