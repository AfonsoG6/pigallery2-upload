import { Component, Input, OnInit, TemplateRef } from '@angular/core';
import { NotificationService } from '../../../model/notification.service';
import { UploadService } from '../upload.service';
import { BsModalService, BsModalRef } from 'ngx-bootstrap/modal';
import { Utils } from '../../../../../common/Utils';
import { ContentLoaderService } from '../contentLoader.service';
import { Subscription } from 'rxjs';
import { ContentWrapper } from '../../../../../common/entities/ConentWrapper';

enum UploadStatus {
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
  
  status: UploadStatus = UploadStatus.STANDBY;

  files: { [key: string]: File } = {};
  successfulFiles: string[] = [];
  failedFiles: string[] = [];
  
  autoOrganize = true;

  currentDir = '';
  uploadDir = '';
  contentSubscription: Subscription = null;

  constructor(
    private uploadService: UploadService,
    private notification: NotificationService,
    private modalService: BsModalService,
    private galleryService: ContentLoaderService
  ) {}

  ngOnInit(): void {
      this.contentSubscription = this.galleryService.content.subscribe(
          async (content: ContentWrapper) => {
            if (content && content.directory && content.directory.path && content.directory.name) {
              this.currentDir = Utils.concatUrls(
                  content.directory.path,
                  content.directory.name
              );
              this.uploadDir = this.currentDir;
            }
            else {
              this.currentDir = '';
              this.uploadDir = '';
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
    if (this.status !== UploadStatus.STANDBY) return;
    this.isDragOver = true;
  }

  onDragLeave(): void {
    if (this.status !== UploadStatus.STANDBY) return;
    this.isDragOver = false;
  }

  onFileDropped(event: DragEvent): void {
    event.preventDefault();
    if (this.status !== UploadStatus.STANDBY) return;
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

  async uploadFiles(): Promise<void> {
    if (Object.keys(this.files).length === 0) {
      this.notification.error('No files selected for upload.');
      return;
    }

    this.status = UploadStatus.UPLOADING;
    for (const fileName in this.files) {
      try {
        if (this.autoOrganize) await this.uploadService.uploadFile(this.files[fileName], null);
        else await this.uploadService.uploadFile(this.files[fileName], this.uploadDir);
        this.successfulFiles.push(fileName);
      } catch (error) {
        this.failedFiles.push(fileName);
      }
    }
    if (this.successfulFiles.length === 0 && this.failedFiles.length > 0) {
      this.notification.error('Failed to upload any files.');
      this.status = UploadStatus.FINISHED;
      return;
    }

    this.notification.success('Successfully uploaded '+ this.successfulFiles.length + ' files.');
    if (this.autoOrganize) {
      try {
        await this.uploadService.organizeUploadedFiles();
        this.notification.success('Files organized successfully.');
      }
      catch (error) {
        this.notification.error('Failed to organize files.');
      }
    }
    this.status = UploadStatus.FINISHED;
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
    this.status = UploadStatus.STANDBY;
    this.files = {};
    this.successfulFiles = [];
    this.failedFiles = [];
    this.autoOrganize = true;
    this.uploadDir = this.currentDir;
  }

  triggerFileInput(): void {
    if (this.status !== UploadStatus.STANDBY) return;
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  toggleAutoOrganize(event: Event): void {
    this.autoOrganize = (event.target as HTMLInputElement).checked;
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