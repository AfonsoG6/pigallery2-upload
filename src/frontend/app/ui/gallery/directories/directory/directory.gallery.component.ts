import {Component, HostBinding, Input, OnDestroy, OnInit} from '@angular/core';
import {DomSanitizer, SafeStyle} from '@angular/platform-browser';
import {SubDirectoryDTO} from '../../../../../../common/entities/DirectoryDTO';
import {RouterLink} from '@angular/router';
import {Utils} from '../../../../../../common/Utils';
import {Media} from '../../Media';
import {Thumbnail, ThumbnailManagerService,} from '../../thumbnailManager.service';
import {QueryService} from '../../../../model/query.service';
import {CoverPhotoDTO} from '../../../../../../common/entities/PhotoDTO';
import { GalleryFileActionsService } from '../../file-actions/file-actions.service';

@Component({
  selector: 'app-gallery-directory',
  templateUrl: './directory.gallery.component.html',
  styleUrls: ['./directory.gallery.component.css'],
  providers: [RouterLink],
})
export class GalleryDirectoryComponent implements OnInit, OnDestroy {
  @Input() directory: SubDirectoryDTO;
  @Input() size: number;
  thumbnail: Thumbnail = null;

  selectorVisibleTimer: number = null;
  selectorVisible = false;
  overSelector = false;

  constructor(
      private thumbnailService: ThumbnailManagerService,
      private sanitizer: DomSanitizer,
      public queryService: QueryService,
      private fileActionsService: GalleryFileActionsService
  ) {
  }

  public get SamplePhoto(): CoverPhotoDTO {
    return this.directory.cover;
  }

  getSanitizedThUrl(): SafeStyle {
    return this.sanitizer.bypassSecurityTrustStyle(
        'url(' +
        this.thumbnail.Src.replace(/\(/g, '%28')
            .replace(/'/g, '%27')
            .replace(/\)/g, '%29') +
        ')'
    );
  }

  // TODO: implement scroll
  /* isInView(): boolean {
     return document.body.scrollTop < this.container.nativeElement.offsetTop + this.container.nativeElement.clientHeight
       && document.body.scrollTop + window.innerHeight > this.container.nativeElement.offsetTop;
   }*/

  getDirectoryPath(): string {
    return Utils.concatUrls(this.directory.path, this.directory.name);
  }

  ngOnDestroy(): void {
    if (this.thumbnail != null) {
      this.thumbnail.destroy();
    }
  }

  ngOnInit(): void {
    if (this.directory.cover) {
      this.thumbnail = this.thumbnailService.getThumbnail(
          new Media(this.SamplePhoto, this.size, this.size)
      );
    }
  }

  @HostBinding('style.scale')
  get hostScale(): string {
    return this.selected() ? 'var(--zoomed-scale)' : '100%';
  }

  mouseOver(): void {
    if (this.selectorVisibleTimer != null) {
      clearTimeout(this.selectorVisibleTimer);
      this.selectorVisibleTimer = null;
    }
    this.selectorVisible = true;
  }

  mouseOut(): void {
    if (this.overSelector) return;
    if (this.selectorVisibleTimer != null) {
      clearTimeout(this.selectorVisibleTimer);
    }
    this.selectorVisibleTimer = window.setTimeout((): void => {
      this.selectorVisibleTimer = null;
      this.selectorVisible = false;
    }, 100);
  }

  selected(): boolean {
    return this.fileActionsService.pathIsSelected(this.getDirectoryPath());
  }

  toggleSelected(event: MouseEvent): void {
    event.stopPropagation();
    this.fileActionsService.toggleSelectedPath(this.getDirectoryPath());
  }

  mouseOverSelector(): void {
    if (this.selectorVisibleTimer != null) {
      clearTimeout(this.selectorVisibleTimer);
      this.selectorVisibleTimer = null;
    }
    this.selectorVisible = true;
    this.overSelector = true;
  }

  mouseOutSelector(): void {
    this.overSelector = false;
  }
}

