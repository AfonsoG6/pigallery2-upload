import {Injectable} from '@angular/core';
import {GalleryCacheService} from '../cache.gallery.service';
import {BehaviorSubject} from 'rxjs';
import {Config} from '../../../../../common/config/public/Config';
import {ContentLoaderService} from '../contentLoader.service';
import {GridSizes} from '../../../../../common/entities/GridSizes';

@Injectable()
export class GalleryNavigatorService {
  public gridSize: BehaviorSubject<GridSizes>;

  constructor(
      private galleryCacheService: GalleryCacheService,
      private galleryService: ContentLoaderService,
  ) {

    // TODO load def instead
    this.gridSize = new BehaviorSubject(this.getDefaultGridSize());
    this.galleryService.content.subscribe((c) => {
      if (c) {
        if (c) {
          const gs = this.galleryCacheService.getGridSize(c);
          if (gs !== null) {
            this.gridSize.next(gs);
          } else {
            this.gridSize.next(this.getDefaultGridSize());
          }
        }
      }
    });
  }


  setGridSize(gs: GridSizes) {
    this.gridSize.next(gs);
    if (this.galleryService.content.value) {
      if (
          !this.isDefaultGridSize()
      ) {
        this.galleryCacheService.setGridSize(
            this.galleryService.content.value,
            gs
        );
      } else {
        this.galleryCacheService.removeGridSize(
            this.galleryService.content.value
        );
      }
    }
  }

  isDefaultGridSize(): boolean {
    return this.gridSize.value === this.getDefaultGridSize();
  }


  getDefaultGridSize(): GridSizes {
    return Config.Gallery.NavBar.defaultGidSize;
  }

}
