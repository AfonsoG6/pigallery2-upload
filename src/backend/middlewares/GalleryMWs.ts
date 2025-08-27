import * as path from 'path';
import {promises as fsp} from 'fs';
import * as archiver from 'archiver';
import {NextFunction, Request, Response} from 'express';
import {ErrorCodes, ErrorDTO} from '../../common/entities/Error';
import {ParentDirectoryDTO,} from '../../common/entities/DirectoryDTO';
import {ObjectManagers} from '../model/ObjectManagers';
import {ContentWrapper} from '../../common/entities/ConentWrapper';
import {ProjectPath} from '../ProjectPath';
import {Config} from '../../common/config/private/Config';
import {UserDTO, UserDTOUtils} from '../../common/entities/UserDTO';
import {MediaDTO, MediaDTOUtils} from '../../common/entities/MediaDTO';
import {QueryParams} from '../../common/QueryParams';
import {VideoProcessing} from '../model/fileaccess/fileprocessing/VideoProcessing';
import {SearchQueryDTO, SearchQueryTypes,} from '../../common/entities/SearchQueryDTO';
import {LocationLookupException} from '../exceptions/LocationLookupException';
import {SupportedFormats} from '../../common/SupportedFormats';
import {ServerTime} from './ServerTimingMWs';
import {SortByTypes} from '../../common/entities/SortingMethods';
import { spawnSync } from 'child_process';
import { FileActionResultDTO } from '../../common/entities/FileActionResultDTO';
import * as multer from 'multer';
import { DiskManager } from '../model/fileaccess/DiskManager';

class UploadRequest extends Request {
  public _fileRejected: boolean;
  public _fileRejectedReason: ErrorCodes | undefined;
  public _conflict: boolean | undefined;
  public _conflictOriginalName: string | undefined;
  public _conflictAuxName: string | undefined;
  public _conflictUploadedName: string | undefined;
}

export class GalleryMWs {
  @ServerTime('1.db', 'List Directory')
  public static async listDirectory(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const directoryName = req.params['directory'] || '/';
    const absoluteDirectoryName = path.join(
      ProjectPath.ImageFolder,
      directoryName
    );
    try {
      if ((await fsp.stat(absoluteDirectoryName)).isDirectory() === false) {
        return next();
      }
    } catch (e) {
      return next();
    }

    try {
      const directory =
        await ObjectManagers.getInstance().GalleryManager.listDirectory(
          directoryName,
          parseInt(
            req.query[QueryParams.gallery.knownLastModified] as string,
            10
          ),
          parseInt(
            req.query[QueryParams.gallery.knownLastScanned] as string,
            10
          )
        );

      if (directory == null) {
        req.resultPipe = new ContentWrapper(null, null, true);
        return next();
      }
      if (
        req.session['user'].permissions &&
        req.session['user'].permissions.length > 0 &&
        req.session['user'].permissions[0] !== '/*'
      ) {
        directory.directories = directory.directories.filter((d): boolean =>
          UserDTOUtils.isDirectoryAvailable(d, req.session['user'].permissions)
        );
      }
      req.resultPipe = new ContentWrapper(directory, null);
      return next();
    } catch (err) {
      return next(
        new ErrorDTO(
          ErrorCodes.GENERAL_ERROR,
          'Error during listing the directory',
          err
        )
      );
    }
  }

  @ServerTime('1.zip', 'Zip Directory')
  public static async zipDirectory(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    if (Config.Gallery.NavBar.enableDownloadZip === false) {
      return next();
    }
    const directoryName = req.params['directory'] || '/';
    const absoluteDirectoryName = path.join(
      ProjectPath.ImageFolder,
      directoryName
    );
    try {
      if ((await fsp.stat(absoluteDirectoryName)).isDirectory() === false) {
        return next();
      }
    } catch (e) {
      return next();
    }

    try {
      res.set('Content-Type', 'application/zip');
      res.set('Content-Disposition', 'attachment; filename=Gallery.zip');

      const archive = archiver('zip', {
        store: true, // disable compression
      });

      res.on('close', () => {
        console.log('zip ' + archive.pointer() + ' bytes');
      });

      archive.on('error', (err: Error) => {
        throw err;
      });

      archive.pipe(res);

      // append photos in absoluteDirectoryName
      // using case-insensitive glob of extensions
      for (const ext of SupportedFormats.WithDots.Photos) {
        archive.glob(`*${ext}`, {cwd: absoluteDirectoryName, nocase: true});
      }
      // append videos in absoluteDirectoryName
      // using case-insensitive glob of extensions
      for (const ext of SupportedFormats.WithDots.Videos) {
        archive.glob(`*${ext}`, {cwd: absoluteDirectoryName, nocase: true});
      }

      await archive.finalize();
      return next();
    } catch (err) {
      return next(
        new ErrorDTO(ErrorCodes.GENERAL_ERROR, 'Error creating zip', err)
      );
    }
  }

  @ServerTime('3.pack', 'pack result')
  public static cleanUpGalleryResults(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    if (!req.resultPipe) {
      return next();
    }

    const cw = req.resultPipe as ContentWrapper;
    if (cw.notModified === true) {
      return next();
    }

    if (Config.Media.Video.enabled === false) {
      if (cw.directory) {
        const removeVideos = (dir: ParentDirectoryDTO): void => {
          dir.media = dir.media.filter(
            (m): boolean => !MediaDTOUtils.isVideo(m)
          );
        };
        removeVideos(cw.directory);
      }
      if (cw.searchResult) {
        cw.searchResult.media = cw.searchResult.media.filter(
          (m): boolean => !MediaDTOUtils.isVideo(m)
        );
      }
    }

    ContentWrapper.pack(cw);

    return next();
  }

  public static async loadFile(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    if (!req.params['mediaPath']) {
      return next();
    }
    const fullMediaPath = path.join(
      ProjectPath.ImageFolder,
      req.params['mediaPath']
    );

    // check if file exist
    try {
      if ((await fsp.stat(fullMediaPath)).isDirectory()) {
        return next();
      }
    } catch (e) {
      return next(
        new ErrorDTO(
          ErrorCodes.GENERAL_ERROR,
          'no such file:' + req.params['mediaPath'],
          'can\'t find file: ' + fullMediaPath
        )
      );
    }

    req.resultPipe = fullMediaPath;
    return next();
  }

  public static async loadBestFitVideo(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    if (!req.resultPipe) {
      return next();
    }
    const fullMediaPath = req.resultPipe as string;

    const convertedVideo =
      VideoProcessing.generateConvertedFilePath(fullMediaPath);

    // check if transcoded video exist
    try {
      await fsp.access(convertedVideo);
      req.resultPipe = convertedVideo;
      // eslint-disable-next-line no-empty
    } catch (e) {
    }

    return next();
  }

  @ServerTime('1.db', 'Search')
  public static async search(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    if (
      Config.Search.enabled === false ||
      !req.params['searchQueryDTO']
    ) {
      return next();
    }

    const query: SearchQueryDTO = JSON.parse(
      req.params['searchQueryDTO'] as string
    );

    try {
      const result = await ObjectManagers.getInstance().SearchManager.search(
        query
      );

      result.directories.forEach(
        (dir): MediaDTO[] => (dir.media = dir.media || [])
      );
      req.resultPipe = new ContentWrapper(null, result);
      return next();
    } catch (err) {
      if (err instanceof LocationLookupException) {
        return next(
          new ErrorDTO(
            ErrorCodes.LocationLookUp_ERROR,
            'Cannot find location: ' + err.location,
            err
          )
        );
      }
      return next(
        new ErrorDTO(ErrorCodes.GENERAL_ERROR, 'Error during searching', err)
      );
    }
  }

  @ServerTime('1.db', 'Autocomplete')
  public static async autocomplete(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    if (Config.Search.AutoComplete.enabled === false) {
      return next();
    }
    if (!req.params['text']) {
      return next();
    }

    let type: SearchQueryTypes = SearchQueryTypes.any_text;
    if (req.query[QueryParams.gallery.search.type]) {
      type = parseInt(req.query[QueryParams.gallery.search.type] as string, 10);
    }
    try {
      req.resultPipe =
        await ObjectManagers.getInstance().SearchManager.autocomplete(
          req.params['text'],
          type
        );
      return next();
    } catch (err) {
      return next(
        new ErrorDTO(ErrorCodes.GENERAL_ERROR, 'Error during searching', err)
      );
    }
  }

  public static async getRandomImage(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    if (
      Config.RandomPhoto.enabled === false ||
      !req.params['searchQueryDTO']
    ) {
      return next();
    }

    try {
      const query: SearchQueryDTO = JSON.parse(
        req.params['searchQueryDTO'] as string
      );

      const photos =
        await ObjectManagers.getInstance().SearchManager.getNMedia(query, [{method: SortByTypes.Random, ascending: null}], 1, true);
      if (!photos || photos.length !== 1) {
        return next(new ErrorDTO(ErrorCodes.INPUT_ERROR, 'No photo found'));
      }

      req.params['mediaPath'] = path.join(
        photos[0].directory.path,
        photos[0].directory.name,
        photos[0].name
      );
      return next();
    } catch (e) {
      return next(
        new ErrorDTO(
          ErrorCodes.GENERAL_ERROR,
          'Can\'t get random photo: ' + e.toString()
        )
      );
    }
  }

  // Accept value from body first, then query as a fallback.
  private static getStringBodyField(req: Request, name: string, required = true, allowedRegex = /.*/): string {
    const val = (typeof req.body?.[name] !== 'undefined') ? req.body?.[name] : req.query?.[name];
    const str = String(val ?? '').trim();
    if (!str) {
      if (!required) return '';
      throw new ErrorDTO(ErrorCodes.INPUT_ERROR, `Missing parameter: ${name}`);
    }
    const full = new RegExp(`^${allowedRegex.source}$`);
    if (!full.test(str)) {
      throw new ErrorDTO(ErrorCodes.INPUT_ERROR, `Invalid value for parameter: ${name}`);
    }
    return str;
  }

  private static getBooleanBodyField(req: Request, name: string, required = false): boolean {
    const str = this.getStringBodyField(req, name, required, /true|false/);
    return String(str).toLowerCase() === 'true';
  }

  private static getIntegerBodyField(req: Request, name: string, required = false): number {
    const str = this.getStringBodyField(req, name, required, /\d+/);
    return parseInt(str, 10);
  }

  private static getArrayBodyField(req: Request, name: string, required = false): string[] {
    const val = (req.body?.[name] ?? (required ? null : [])) as string | string[] | null;
    if (val == null) {
      if (!required) return [];
      throw new ErrorDTO(ErrorCodes.INPUT_ERROR, `Missing parameter: ${name}`);
    }
    return (Array.isArray(val) ? val : [val]).map(v => String(v).trim()).filter(v => v.length > 0);
  }

  private static async safeUnlink(filePath: string): Promise<void> {
    if (!filePath) return;
    try { await fsp.unlink(filePath); } catch { /* ignore */ }
  }

  private static async safeRename(filePath: string, newPath: string): Promise<void> {
    if (!filePath || !newPath) return;
    try { await fsp.rename(filePath, newPath); } catch { /* ignore */ }
  }

  public static async moveFiles(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  multer().none()(req, res, (err?: any) => {
      if (err) {
        return next(new ErrorDTO(ErrorCodes.INPUT_ERROR));
      }
    });
    const result = new FileActionResultDTO();
    try {
      const user: UserDTO = req.session['user'];

      const sourcePaths: string[] = GalleryMWs.getArrayBodyField(req, 'sourcePath', true);
      const destinationPath: string = GalleryMWs.getStringBodyField(req, 'destinationPath', true);
      const destinationFileName: string = GalleryMWs.getStringBodyField(req, 'destinationFileName', false, /[^/\\:*?"<>|]+/);
      const force: boolean = GalleryMWs.getBooleanBodyField(req, 'force', false);

      if (sourcePaths.length > 1 && destinationFileName) {
        throw new ErrorDTO(ErrorCodes.INPUT_ERROR, 'Cannot specify destination file name when moving multiple files');
      }

      for (const sourcePath of sourcePaths) {
        try {
          if (UserDTOUtils.isDirectoryPathAvailable(sourcePath, user.permissions) === false) {
            throw new ErrorDTO(ErrorCodes.FILE_INVALID_PATH_ERROR, 'Source path is not available for user');
          }

          const fullSourcePath = path.join(ProjectPath.ImageFolder, sourcePath);
          let isDirectory = false;
          try { isDirectory = await fsp.stat(fullSourcePath).then(stat => stat.isDirectory()) }
          catch (e) { throw new ErrorDTO(ErrorCodes.GENERAL_ERROR, 'Error checking source path: ' + e.toString()); }
          const isFile = !isDirectory;

          let relDestinationPath = destinationPath;
          if (isFile) {
            if (!destinationFileName) {
              relDestinationPath = path.join(destinationPath, path.basename(sourcePath));
            }
            else if (destinationFileName && path.extname(destinationFileName) === '') {
              relDestinationPath = path.join(destinationPath, destinationFileName + path.extname(sourcePath));
            }
          }
          else {
            relDestinationPath = path.join(destinationPath, path.basename(sourcePath));
          }
          if (isDirectory && destinationFileName) {
            throw new ErrorDTO(ErrorCodes.INPUT_ERROR, 'Cannot specify destination file name when moving a directory');
          }

          if (UserDTOUtils.isDirectoryPathAvailable(relDestinationPath, user.permissions) === false) {
            throw new ErrorDTO(ErrorCodes.FILE_INVALID_PATH_ERROR, 'Destination path is not available for user');
          }

          const fullDestinationPath = path.join(ProjectPath.ImageFolder, relDestinationPath);

          if (force === false && isFile) {
            await fsp.access(fullDestinationPath).then(
              () => { throw new ErrorDTO(ErrorCodes.FILE_CONFLICT_PATH_ERROR, 'File already exists at destination: ' + relDestinationPath); },
              () => { /* File does not exist, proceed with write */ }
            );
          }

          try { await fsp.mkdir(path.dirname(fullDestinationPath), { recursive: true }); }
          catch (e) { throw new ErrorDTO(ErrorCodes.GENERAL_ERROR, 'Error creating destination directory: ' + e.toString()); }
          try { await fsp.rename(fullSourcePath, fullDestinationPath); }
          catch (e) { throw new ErrorDTO(ErrorCodes.GENERAL_ERROR, 'Error moving file: ' + e.toString()); }
        }
        catch (e) {
          if (e instanceof ErrorDTO) {
            result.addFailedPath(sourcePath, e);
          } else {
            result.addFailedPath(sourcePath, new ErrorDTO(ErrorCodes.GENERAL_ERROR, 'Unknown error during moving'));
          }
        }
      }
    }
    catch (e) {
      return next(e);
    }
    req.resultPipe = result;
    return next();
  }

  public static async deleteFiles(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  multer().none()(req, res, (err?: any) => {
      if (err) {
        return next(new ErrorDTO(ErrorCodes.INPUT_ERROR));
      }
    });
    const result = new FileActionResultDTO();
    try {
      const targetPaths: string[] = GalleryMWs.getArrayBodyField(req, 'targetPath');

      for (const targetPath of targetPaths) {
        try {
          if (UserDTOUtils.isDirectoryPathAvailable(targetPath, req.session['user'].permissions) === false) {
            throw new ErrorDTO(ErrorCodes.FILE_INVALID_PATH_ERROR, 'File path is not available for user');
          }
          const fullTargetPath = path.join(ProjectPath.ImageFolder, targetPath);
          try { await fsp.rm(fullTargetPath, { recursive: true }); }
          catch (e) { throw new ErrorDTO(ErrorCodes.GENERAL_ERROR, 'Error deleting directory: ' + e.toString()); }
        }
        catch (e) {
          if (e instanceof ErrorDTO) {
            result.addFailedPath(targetPath, e);
          } else {
            result.addFailedPath(targetPath, new ErrorDTO(ErrorCodes.GENERAL_ERROR, 'Unknown error during deletion'));
          }
        }
      }
    }
    catch (e) {
      return next(e);
    }
    req.resultPipe = result;
    return next();
  }

  private static getAbsoluteUploadDirectoryPath(req: Request): string {
  // Fallback to query params if body is not yet parsed by multer in certain callbacks
  const uploadPath = GalleryMWs.getStringBodyField(req, 'uploadPath', true);
  const autoOrganize = GalleryMWs.getBooleanBodyField(req, 'autoOrganize', false);
    const baseDir = autoOrganize ? Config.Upload.defaultUploadPath : Config.Media.folder;
    return path.join(baseDir, uploadPath);
  }

  private static getAbsoluteUploadFilePath(req: Request, file: Express.Multer.File): string {
    const dir = GalleryMWs.getAbsoluteUploadDirectoryPath(req);
    return path.join(dir, file.originalname);
  }

  private static getFileExtension(file: Express.Multer.File): string {
    return path.extname(file.originalname).toLowerCase();
  }

  private static createUploadMulter(): multer.Multer {
    const storage = multer.diskStorage({
      destination: async (req, file, cb) => {
        try {
          const absUploadDirectoryPath = GalleryMWs.getAbsoluteUploadDirectoryPath(req);
          await fsp.mkdir(absUploadDirectoryPath, {recursive: true});
          cb(null, absUploadDirectoryPath);
        } catch (err) {
          cb(new Error(ErrorCodes.GENERAL_ERROR.toString()), null);
        }
      },
      filename: async (req, file, cb) => {
        const uploadRequest = (req as unknown) as UploadRequest;
        const force = GalleryMWs.getBooleanBodyField(req, 'force', false);
        const autoOrganize = GalleryMWs.getBooleanBodyField(req, 'autoOrganize', false);
        const absUploadFilePath = GalleryMWs.getAbsoluteUploadFilePath(req, file);
        if (!autoOrganize) {
          await fsp.access(absUploadFilePath).then(() => {
            if (force) {
              uploadRequest._conflict = true;
              const p = path.parse(file.originalname);
              uploadRequest._conflictOriginalName = file.originalname;
              uploadRequest._conflictAuxName = `${p.name}__conflict_aux__${Date.now()}${p.ext}`;
              uploadRequest._conflictUploadedName = `${p.name}__conflict__${Date.now()}${p.ext}`;
              cb(null, path.basename(uploadRequest._conflictUploadedName));
            }
          }).catch(() => { /* File does not exist, great */ });
        }
        cb(null, file.originalname);
      }
    });

    const fileFilter: multer.Options['fileFilter'] = async (req, file, cb) => {
      const uploadRequest = (req as unknown) as UploadRequest;
      uploadRequest._fileRejected = false;

      let force: boolean, autoOrganize: boolean, sha256: string, uploadPath: string;
      try {
        force = GalleryMWs.getBooleanBodyField(req, 'force', false);
        autoOrganize = GalleryMWs.getBooleanBodyField(req, 'autoOrganize', false);
        sha256 = GalleryMWs.getStringBodyField(req, 'sha256', false, /[a-f0-9]{64}/);
        uploadPath = GalleryMWs.getStringBodyField(req, 'uploadPath', true);
        GalleryMWs.getStringBodyField(req, 'lastModified', false, /\d+/);
      }
      catch (e) {
        uploadRequest._fileRejected = true;
        uploadRequest._fileRejectedReason = ErrorCodes.INPUT_ERROR;
        return cb(null, false);
      }

      const absUploadDirectoryPath = GalleryMWs.getAbsoluteUploadDirectoryPath(req);
      if (!absUploadDirectoryPath || !UserDTOUtils.isDirectoryPathAvailable(absUploadDirectoryPath, req.session['user'].permissions)) {
        uploadRequest._fileRejected = true;
        uploadRequest._fileRejectedReason = ErrorCodes.FILE_INVALID_PATH_ERROR;
        return cb(null, false);
      }

      const absUploadFilePath = GalleryMWs.getAbsoluteUploadFilePath(req, file);
      if (!autoOrganize) {
        await fsp.access(absUploadFilePath).then(() => {
          if (force) {
            uploadRequest._conflict = true;
          } else {
            uploadRequest._fileRejected = true;
            uploadRequest._fileRejectedReason = ErrorCodes.FILE_CONFLICT_PATH_ERROR;
            return cb(null, false);
          }
        }).catch(() => { /* File does not exist, great */ });
      }

      if (!force) {
        if (sha256) {
          try {
            const relNormalized = DiskManager.normalizeDirPath(uploadPath);
            // DirectoryEntity.path has a trailing separator
            const dirPath = path.join(path.dirname(relNormalized), path.sep);
            const dirName = path.basename(relNormalized);

            const gm = ObjectManagers.getInstance().GalleryManager;
            const duplicateExists = autoOrganize
              ? await gm.checkFileHashExistsInDirOrChildDirs(dirPath, dirName, sha256)
              : await gm.checkFileHashExistsInDir(dirPath, dirName, sha256);

            if (duplicateExists) {
              uploadRequest._fileRejected = true;
              uploadRequest._fileRejectedReason = ErrorCodes.FILE_CONFLICT_HASH_ERROR;
              return cb(null, false);
            }
          } catch (e) {
            // On DB errors, do not block upload here; let later stages handle issues
          }
        }
      }

      const ext = GalleryMWs.getFileExtension(file);
      if (!(
        SupportedFormats.WithDots.Photos.includes(ext) ||
        SupportedFormats.WithDots.Videos.includes(ext) ||
        SupportedFormats.WithDots.MetaFiles.includes(ext)
      )) {
        uploadRequest._fileRejected = true;
        uploadRequest._fileRejectedReason = ErrorCodes.FILE_UNSUPPORTED_TYPE_ERROR;
        return cb(null, false);
      }
      cb(null, true);
    };

    return multer({ storage, fileFilter });
  }

  // Run multer.single('file') as a Promise so we can await it
  private static runMulterSingle(req: Request, res: Response): Promise<void> {
    const upload = GalleryMWs.createUploadMulter();
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      upload.single('file')(req, res, (err?: any) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  public static async uploadFiles(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    if (Config.Upload.enabled === false) {
      return next(new ErrorDTO(ErrorCodes.GENERAL_ERROR, 'File upload is not enabled'));
    }
    try {
      await GalleryMWs.runMulterSingle(req, res);
    } catch (err) {
      const msg = (err as Error)?.message ?? ErrorCodes.GENERAL_ERROR.toString();
      const errorCode = parseInt(msg, 10) || ErrorCodes.GENERAL_ERROR;
      return next(new ErrorDTO(errorCode));
    }

    const uploadRequest = (req as unknown) as UploadRequest;

    const file = req.file;
    const fileRejected = uploadRequest._fileRejected;
    const fileRejectedReason = uploadRequest._fileRejectedReason;
    const conflict = uploadRequest._conflict;
    let fileInAux = false;
    let conflictOriginalPath: string = null;
    let conflictAuxPath: string = null;
    let conflictUploadedPath: string = null;

    try {
      const force: boolean = GalleryMWs.getBooleanBodyField(req, "force", false);
      const lastModified: number = GalleryMWs.getIntegerBodyField(req, "lastModified", true);

      // Field-level errors from multer
      if (fileRejected) {
        throw new ErrorDTO(fileRejectedReason);
      }
      if (!file) {
        throw new ErrorDTO(ErrorCodes.INPUT_ERROR);
      }

      if (conflict && force) {
        conflictOriginalPath = path.join(file.destination, uploadRequest._conflictOriginalName);
        conflictAuxPath = path.join(file.destination, uploadRequest._conflictAuxName);
        conflictUploadedPath = path.join(file.destination, uploadRequest._conflictUploadedName);
        try {
          await fsp.rename(conflictOriginalPath, conflictAuxPath);
          fileInAux = true;
        } catch (e) {
          throw new ErrorDTO(ErrorCodes.FILE_RENAME_FAILURE);
        }
        try {
          await fsp.rename(conflictUploadedPath, conflictOriginalPath);
        } catch (e) {
          throw new ErrorDTO(ErrorCodes.FILE_RENAME_FAILURE);
        }
      }

      // Post-write ownership/permissions/timestamps
      const user: UserDTO = req.session['user'];
      if (Config.Upload.enableChownChmod) {
        if (user.unixUser) {
          try {
            const uid: number = parseInt(spawnSync('id', ['-u', user.unixUser]).stdout.toString().trim());
            const gid: number = parseInt(spawnSync('id', ['-g', user.unixUser]).stdout.toString().trim());
            await fsp.chown(file.path, uid, gid);
          } catch (e) {
            throw new ErrorDTO(ErrorCodes.FILE_CHOWN_FAILURE);
          }
        }

        try { await fsp.chmod(file.path, user.unixUser ? 0o600 : 0o666); }
        catch (e) { throw new ErrorDTO(ErrorCodes.FILE_CHMOD_FAILURE); }
      }

      try { await fsp.utimes(file.path, new Date(lastModified), new Date(lastModified)); }
      catch (e) { throw new ErrorDTO(ErrorCodes.FILE_UTIMES_FAILURE); }

    } catch (e) {
      if (file) {
        // Best effort: Attempt to delete the failed uploaded file to avoid building up garbage
        await GalleryMWs.safeUnlink(file.path);
      }
      if (fileInAux) {
        // Best effort: If the auxiliary file exists, try to restore it to its original name/path
        await GalleryMWs.safeRename(conflictAuxPath, conflictOriginalPath);
      }
      return next(e);
    }

    // If everything went well, we can safely remove the auxiliary file and return
    if (fileInAux) await GalleryMWs.safeUnlink(conflictAuxPath);
    req.resultPipe = "ok";
    return next();
  }

  public static async organizeUploadedFiles(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    if (Config.Upload.enabled === false) {
      return next();
    }

    if (!req.body || !req.body.uploadPath) {
      return next(new ErrorDTO(ErrorCodes.INPUT_ERROR, 'Missing parameter: uploadPath'));
    }
    const uploadPath = req.body.uploadPath as string;
    if (UserDTOUtils.isDirectoryPathAvailable(uploadPath, req.session['user'].permissions) === false) {
      return next(new ErrorDTO(ErrorCodes.FILE_INVALID_PATH_ERROR, 'Upload path is not available for user'));
    }

    const sourcePath = path.join(
      Config.Upload.defaultUploadPath,
      uploadPath
    );
    const destinationPath = path.join(
      Config.Media.folder,
      uploadPath
    );

    const pythonScriptPath = Config.Upload.imageOrganizerScriptPath;
    if (!pythonScriptPath || pythonScriptPath === "") {
      return next(new ErrorDTO(ErrorCodes.GENERAL_ERROR, 'Image organizer script path is not configured'));
    }

    try {
      await fsp.access(pythonScriptPath);
    } catch (e) {
      return next(new ErrorDTO(ErrorCodes.GENERAL_ERROR, 'Image organizer script cannot be accessed: ' + pythonScriptPath));
    }

    const pythonArgs = [
      '--source', sourcePath,
      '--destination', destinationPath
    ];

    try { spawnSync('python', [pythonScriptPath, ...pythonArgs]); }
    catch (e) { return next(new ErrorDTO(ErrorCodes.GENERAL_ERROR, 'Error running image organizer script: ' + e.toString())); }

    req.resultPipe = "ok";
    return next();
  }
}
