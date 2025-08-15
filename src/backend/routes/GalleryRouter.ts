import {AuthenticationMWs} from '../middlewares/user/AuthenticationMWs';
import {Express} from 'express';
import {GalleryMWs} from '../middlewares/GalleryMWs';
import {RenderingMWs} from '../middlewares/RenderingMWs';
import {ThumbnailGeneratorMWs} from '../middlewares/thumbnail/ThumbnailGeneratorMWs';
import {UserRoles, UserDTOUtils} from '../../common/entities/UserDTO';
import {ThumbnailSourceType} from '../model/fileaccess/PhotoWorker';
import {VersionMWs} from '../middlewares/VersionMWs';
import {SupportedFormats} from '../../common/SupportedFormats';
import {ServerTimingMWs} from '../middlewares/ServerTimingMWs';
import {MetaFileMWs} from '../middlewares/MetaFileMWs';
import {Config} from '../../common/config/private/Config';
import * as multer from 'multer';
import * as path from 'path';
import {promises as fsp} from 'fs';

export class GalleryRouter {
  public static route(app: Express): void {
    this.addGetImageIcon(app);
    this.addGetVideoIcon(app);
    this.addGetResizedPhoto(app);
    this.addGetBestFitVideo(app);
    this.addGetVideoThumbnail(app);
    this.addGetImage(app);
    this.addGetVideo(app);
    this.addGetMetaFile(app);
    this.addGetBestFitMetaFile(app);
    this.addRandom(app);
    this.addDirectoryList(app);
    this.addDirectoryZip(app);
    this.addMove(app);
    this.addDelete(app);
    this.addUpload(app);
    this.addUploadOrganize(app);

    this.addSearch(app);
    this.addAutoComplete(app);
  }

  protected static addDirectoryList(app: Express): void {
    app.get(
        [Config.Server.apiPath + '/gallery/content/:directory(*)', Config.Server.apiPath + '/gallery/', Config.Server.apiPath + '/gallery//'],
        // common part
        AuthenticationMWs.authenticate,
        AuthenticationMWs.normalizePathParam('directory'),
        AuthenticationMWs.authorisePath('directory', true),
        VersionMWs.injectGalleryVersion,

        // specific part
        GalleryMWs.listDirectory,
        ThumbnailGeneratorMWs.addThumbnailInformation,
        GalleryMWs.cleanUpGalleryResults,
        ServerTimingMWs.addServerTiming,
        RenderingMWs.renderResult
    );
  }

  protected static addDirectoryZip(app: Express): void {
    app.get(
        [Config.Server.apiPath + '/gallery/zip/:directory(*)'],
        // common part
        AuthenticationMWs.authenticate,
        AuthenticationMWs.normalizePathParam('directory'),
        AuthenticationMWs.authorisePath('directory', true),

        // specific part
        ServerTimingMWs.addServerTiming,
        GalleryMWs.zipDirectory
    );
  }

  protected static addGetImage(app: Express): void {
    app.get(
        [
          Config.Server.apiPath + '/gallery/content/:mediaPath(*.(' +
          SupportedFormats.Photos.join('|') +
          '))',
        ],
        // common part
        AuthenticationMWs.authenticate,
        AuthenticationMWs.normalizePathParam('mediaPath'),
        AuthenticationMWs.authorisePath('mediaPath', false),

        // specific part
        GalleryMWs.loadFile,
        ServerTimingMWs.addServerTiming,
        RenderingMWs.renderFile
    );
  }

  protected static addGetVideo(app: Express): void {
    app.get(
        [
          Config.Server.apiPath + '/gallery/content/:mediaPath(*.(' +
          SupportedFormats.Videos.join('|') +
          '))',
        ],
        // common part
        AuthenticationMWs.authenticate,
        AuthenticationMWs.normalizePathParam('mediaPath'),
        AuthenticationMWs.authorisePath('mediaPath', false),

        // specific part
        GalleryMWs.loadFile,
        ServerTimingMWs.addServerTiming,
        RenderingMWs.renderFile
    );
  }

  protected static addGetBestFitVideo(app: Express): void {
    app.get(
        [
          Config.Server.apiPath + '/gallery/content/:mediaPath(*.(' +
          SupportedFormats.Videos.join('|') +
          '))/bestFit',
        ],
        // common part
        AuthenticationMWs.authenticate,
        AuthenticationMWs.normalizePathParam('mediaPath'),
        AuthenticationMWs.authorisePath('mediaPath', false),

        // specific part
        GalleryMWs.loadFile,
        GalleryMWs.loadBestFitVideo,
        ServerTimingMWs.addServerTiming,
        RenderingMWs.renderFile
    );
  }

  protected static addGetMetaFile(app: Express): void {
    app.get(
        [
          Config.Server.apiPath + '/gallery/content/:mediaPath(*.(' +
          SupportedFormats.MetaFiles.join('|') +
          '))',
        ],
        // common part
        AuthenticationMWs.authenticate,
        AuthenticationMWs.normalizePathParam('mediaPath'),
        AuthenticationMWs.authorisePath('mediaPath', false),

        // specific part
        GalleryMWs.loadFile,
        ServerTimingMWs.addServerTiming,
        RenderingMWs.renderFile
    );
  }

  protected static addGetBestFitMetaFile(app: Express): void {
    app.get(
        [
          Config.Server.apiPath + '/gallery/content/:mediaPath(*.(' +
          SupportedFormats.MetaFiles.join('|') +
          '))/bestFit',
        ],
        // common part
        AuthenticationMWs.authenticate,
        AuthenticationMWs.normalizePathParam('mediaPath'),
        AuthenticationMWs.authorisePath('mediaPath', false),

        // specific part
        GalleryMWs.loadFile,
        MetaFileMWs.compressGPX,
        ServerTimingMWs.addServerTiming,
        RenderingMWs.renderFile
    );
  }

  protected static addRandom(app: Express): void {
    app.get(
        [Config.Server.apiPath + '/gallery/random/:searchQueryDTO'],
        // common part
        AuthenticationMWs.authenticate,
        AuthenticationMWs.authorise(UserRoles.Guest),
        VersionMWs.injectGalleryVersion,

        // specific part
        GalleryMWs.getRandomImage,
        GalleryMWs.loadFile,
        ServerTimingMWs.addServerTiming,
        RenderingMWs.renderFile
    );
  }

  /**
   * Used for serving photo thumbnails and previews
   * @param app
   * @protected
   */
  protected static addGetResizedPhoto(app: Express): void {
    app.get(
        Config.Server.apiPath + '/gallery/content/:mediaPath(*.(' +
        SupportedFormats.Photos.join('|') +
        '))/:size',
        // common part
        AuthenticationMWs.authenticate,
        AuthenticationMWs.normalizePathParam('mediaPath'),
        AuthenticationMWs.authorisePath('mediaPath', false),

        // specific part
        GalleryMWs.loadFile,
        ThumbnailGeneratorMWs.generateThumbnailFactory(ThumbnailSourceType.Photo),
        ServerTimingMWs.addServerTiming,
        RenderingMWs.renderFile
    );
  }

  protected static addGetVideoThumbnail(app: Express): void {
    app.get(
        Config.Server.apiPath + '/gallery/content/:mediaPath(*.(' +
        SupportedFormats.Videos.join('|') +
        '))/:size',
        // common part
        AuthenticationMWs.authenticate,
        AuthenticationMWs.normalizePathParam('mediaPath'),
        AuthenticationMWs.authorisePath('mediaPath', false),

        // specific part
        GalleryMWs.loadFile,
        ThumbnailGeneratorMWs.generateThumbnailFactory(ThumbnailSourceType.Video),
        ServerTimingMWs.addServerTiming,
        RenderingMWs.renderFile
    );
  }

  protected static addGetVideoIcon(app: Express): void {
    app.get(
        Config.Server.apiPath + '/gallery/content/:mediaPath(*.(' +
        SupportedFormats.Videos.join('|') +
        '))/icon',
        // common part
        AuthenticationMWs.authenticate,
        AuthenticationMWs.normalizePathParam('mediaPath'),
        AuthenticationMWs.authorisePath('mediaPath', false),

        // specific part
        GalleryMWs.loadFile,
        ThumbnailGeneratorMWs.generateIconFactory(ThumbnailSourceType.Video),
        ServerTimingMWs.addServerTiming,
        RenderingMWs.renderFile
    );
  }

  protected static addGetImageIcon(app: Express): void {
    app.get(
        Config.Server.apiPath + '/gallery/content/:mediaPath(*.(' +
        SupportedFormats.Photos.join('|') +
        '))/icon',
        // common part
        AuthenticationMWs.authenticate,
        AuthenticationMWs.normalizePathParam('mediaPath'),
        AuthenticationMWs.authorisePath('mediaPath', false),

        // specific part
        GalleryMWs.loadFile,
        ThumbnailGeneratorMWs.generateIconFactory(ThumbnailSourceType.Photo),
        ServerTimingMWs.addServerTiming,
        RenderingMWs.renderFile
    );
  }

  protected static addMove(app: Express): void {
    app.post(
        Config.Server.apiPath + '/gallery/move',
        // common part
        AuthenticationMWs.authenticate,
        AuthenticationMWs.authorise(UserRoles.User),
        VersionMWs.injectGalleryVersion,

        // specific part: use multer to parse fields only
        multer().none(),
        GalleryMWs.moveFiles,
        ServerTimingMWs.addServerTiming,
        RenderingMWs.renderResult
    );
  }

  protected static addDelete(app: Express): void {
    app.post(
        Config.Server.apiPath + '/gallery/delete',
        // common part
        AuthenticationMWs.authenticate,
        AuthenticationMWs.authorise(UserRoles.User),
        VersionMWs.injectGalleryVersion,

        // specific part: use multer to parse fields only
        multer().none(),
        GalleryMWs.deleteFiles,
        ServerTimingMWs.addServerTiming,
        RenderingMWs.renderResult
    );
  }

  protected static addUpload(app: Express): void {
    const upload = this.createUploadMulter();

    app.post(
        Config.Server.apiPath + '/gallery/upload',
        // common part
        AuthenticationMWs.authenticate,
        AuthenticationMWs.authorise(UserRoles.User),
        VersionMWs.injectGalleryVersion,

        // specific part: multer handles multipart and saves file directly
        upload.single('file'),
        GalleryMWs.uploadFiles,
        ServerTimingMWs.addServerTiming,
        RenderingMWs.renderResult
    );
  }

  protected static addUploadOrganize(app: Express): void {
    app.post(
        Config.Server.apiPath + '/gallery/upload/organize',
        // common part
        AuthenticationMWs.authenticate,
        AuthenticationMWs.authorise(UserRoles.User),
        VersionMWs.injectGalleryVersion,

        // specific part
        GalleryMWs.organizeUploadedFiles,
        ServerTimingMWs.addServerTiming,
        RenderingMWs.renderResult
    );
  }

  protected static addSearch(app: Express): void {
    app.get(
        Config.Server.apiPath + '/search/:searchQueryDTO(*)',
        // common part
        AuthenticationMWs.authenticate,
        AuthenticationMWs.authorise(UserRoles.Guest),
        VersionMWs.injectGalleryVersion,

        // specific part
        GalleryMWs.search,
        ThumbnailGeneratorMWs.addThumbnailInformation,
        GalleryMWs.cleanUpGalleryResults,
        ServerTimingMWs.addServerTiming,
        RenderingMWs.renderResult
    );
  }

  protected static addAutoComplete(app: Express): void {
    app.get(
        Config.Server.apiPath + '/autocomplete/:text(*)',
        // common part
        AuthenticationMWs.authenticate,
        AuthenticationMWs.authorise(UserRoles.Guest),
        VersionMWs.injectGalleryVersion,

        // specific part
        GalleryMWs.autocomplete,
        ServerTimingMWs.addServerTiming,
        RenderingMWs.renderResult
    );
  }

  private static createUploadMulter(): multer.Multer {
    const storage = multer.diskStorage({
      destination: async (req, file, cb) => {
        try {
          const autoOrganize = String((req.body?.autoOrganize ?? 'false')).toLowerCase() === 'true';
          const uploadPath = String(req.body?.uploadPath ?? '');
          // Validate user access to target relative path
          const hasAccess = UserDTOUtils.isDirectoryPathAvailable(uploadPath, req.session['user'].permissions);
          if (!hasAccess) return cb(new Error('INVALID_PATH'), null);

          const baseDir = autoOrganize ? Config.Upload.defaultUploadPath : Config.Media.folder;
          const destDir = path.join(baseDir, uploadPath);
          await fsp.mkdir(destDir, {recursive: true});
          cb(null, destDir);
        } catch (err) {
          cb(err as Error, null);
        }
      },
      filename: async (req, file, cb) => {
        try {
          const autoOrganize = String((req.body?.autoOrganize ?? 'false')).toLowerCase() === 'true';
          const uploadPath = String(req.body?.uploadPath ?? '');
          const force = String((req.body?.force ?? 'false')).toLowerCase() === 'true';
          const baseDir = autoOrganize ? Config.Upload.defaultUploadPath : Config.Media.folder;
          const destDir = path.join(baseDir, uploadPath);

          const originalName = file.originalname;
          const targetPath = path.join(destDir, originalName);

          try {
            await fsp.access(targetPath);
            // File exists
            if (!force) {
              // Save to a conflict name; handler will delete and respond with FILE_EXISTS_ERROR
              const p = path.parse(originalName);
              const conflictName = `${p.name}__conflict__${Date.now()}${p.ext}`;
              (req as any)._uploadConflict = true;
              (req as any)._uploadConflictOriginal = originalName;
              return cb(null, conflictName);
            }
          } catch {
            // does not exist, proceed with original name
          }
          cb(null, originalName);
        } catch (err) {
          cb(err as Error, null);
        }
      }
    });

    const fileFilter: multer.Options['fileFilter'] = (req, file, cb) => {
      // Pre-write permission check for uploadPath
      const uploadPath = String(req.body?.uploadPath ?? '');
      if (!uploadPath || !UserDTOUtils.isDirectoryPathAvailable(uploadPath, req.session['user'].permissions)) {
        (req as any)._fileRejected = 'INVALID_PATH';
        return cb(null, false); // reject without writing the file
      }

      // Type allow-list
      const ext = path.extname(file.originalname).toLowerCase();
      const isAllowed =
        SupportedFormats.WithDots.Photos.includes(ext) ||
        SupportedFormats.WithDots.Videos.includes(ext);
      if (!isAllowed) {
        (req as any)._fileRejected = 'UNSUPPORTED_TYPE';
        return cb(null, false); // reject without throwing
      }
      cb(null, true);
    };

    // Avoid throwing from limits to keep error formatting consistent; validate size in handler if needed.
    return multer({ storage, fileFilter });
  }
}
