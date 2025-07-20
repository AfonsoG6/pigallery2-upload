import { Component, Input, OnInit, TemplateRef } from '@angular/core';
import { NotificationService } from '../../../model/notification.service';
import { UploadService } from '../upload.service';
import { BsModalService, BsModalRef } from 'ngx-bootstrap/modal';

@Component({
  selector: 'app-gallery-upload',
  templateUrl: './upload.gallery.component.html',
  styleUrls: ['./upload.gallery.component.css'],
})
export class GalleryUploadComponent implements OnInit {
  enabled = true;
  @Input() dropDownItem = false;
  files: { [key: string]: File } = {};
  uploading = false;
  modalRef: BsModalRef;
  isDragOver = false;

  constructor(
    private uploadService: UploadService,
    private notification: NotificationService,
    private modalService: BsModalService
  ) {}

  ngOnInit(): void {}

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = true;
  }

  onDragLeave(): void {
    this.isDragOver = false;
  }

  onFileDropped(event: DragEvent): void {
    event.preventDefault();
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

  async uploadFiles(): Promise<void> {
    if (Object.keys(this.files).length === 0) {
      this.notification.error('No files selected for upload.');
      return;
    }

    this.uploading = true;
    try {
      await this.uploadService.uploadFiles(Object.values(this.files));
      this.notification.success('Files uploaded successfully.');
      this.files = {};
    } catch (error) {
      console.error(error);
      this.notification.error('Failed to upload files.');
    } finally {
      this.uploading = false;
    }
  }

  removeFile(fileName: string): void {
    delete this.files[fileName];
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
      this.files = {};
    }
  }

  triggerFileInput(): void {
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }
}