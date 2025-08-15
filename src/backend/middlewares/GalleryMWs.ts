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

  private static getStringBodyField(req: Request, name: string, required = true, allowedRegex = /.*/): string {
    const val = (req.body?.[name] ?? '') as string;
    const str = String(val).trim();
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

  private static getArrayBodyField(req: Request, name: string, required = true): string[] {
    const val = (req.body?.[name] ?? (required ? null : [])) as string | string[] | null;
    if (val == null) {
      if (!required) return [];
      throw new ErrorDTO(ErrorCodes.INPUT_ERROR, `Missing parameter: ${name}`);
    }
    return (Array.isArray(val) ? val : [val]).map(v => String(v).trim()).filter(v => v.length > 0);
  }

  private static getBooleanBodyField(req: Request, name: string, required = true): boolean {
    const str = this.getStringBodyField(req, name, required, /true|false/);
    return String(str).toLowerCase() === 'true';
  }

  private static async safeUnlink(filePath: string): Promise<void> {
    if (!filePath) return;
    try { await fsp.unlink(filePath); } catch { /* ignore */ }
  }

  public static async moveFiles(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const result = new FileActionResultDTO();
    try {
      const user: UserDTO = req.session['user'];

      const sourcePaths: string[] = GalleryMWs.getArrayBodyField(req, 'sourcePath');
      const destinationPath: string = GalleryMWs.getStringBodyField(req, 'destinationPath', false);
      const destinationFileName: string = GalleryMWs.getStringBodyField(req, 'destinationFileName', false, /[^/\\:*?"<>|]+/);
      const force: boolean = GalleryMWs.getBooleanBodyField(req, 'force');

      if (sourcePaths.length > 1 && destinationFileName) {
        throw new ErrorDTO(ErrorCodes.INPUT_ERROR, 'Cannot specify destination file name when moving multiple files');
      }

      for (const sourcePath of sourcePaths) {
        try {
          if (UserDTOUtils.isDirectoryPathAvailable(sourcePath, user.permissions) === false) {
            throw new ErrorDTO(ErrorCodes.INVALID_PATH_ERROR, 'Source path is not available for user');
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
            throw new ErrorDTO(ErrorCodes.INVALID_PATH_ERROR, 'Destination path is not available for user');
          }

          const fullDestinationPath = path.join(ProjectPath.ImageFolder, relDestinationPath);

          if (force === false && isFile) {
            await fsp.access(fullDestinationPath).then(
              () => { throw new ErrorDTO(ErrorCodes.FILE_EXISTS_ERROR, 'File already exists at destination: ' + relDestinationPath); },
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
    const result = new FileActionResultDTO();
    try {
      const targetPaths: string[] = GalleryMWs.getArrayBodyField(req, 'targetPath');

      for (const targetPath of targetPaths) {
        try {
          if (UserDTOUtils.isDirectoryPathAvailable(targetPath, req.session['user'].permissions) === false) {
            throw new ErrorDTO(ErrorCodes.INVALID_PATH_ERROR, 'File path is not available for user');
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

  public static async uploadFiles(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    if (Config.Upload.enabled === false) {
      return next();
    }

    const file = (req as any).file as (Express.Multer.File | undefined);
    const fileRejected = (req as any)._fileRejected as string | undefined;
    const conflict = (req as any)._uploadConflict as boolean | undefined;
    const conflictOriginal = (req as any)._uploadConflictOriginal as string | undefined;

    try {
      // Validate fields
      const autoOrganize: boolean = GalleryMWs.getBooleanBodyField(req, "autoOrganize");
      const force: boolean = GalleryMWs.getBooleanBodyField(req, "force");
      const uploadPath: string = GalleryMWs.getStringBodyField(req, 'uploadPath');
      const lastModified: number = parseInt(GalleryMWs.getStringBodyField(req, 'lastModified', true, /\d+/), 10);

      // Field-level errors from multer
      if (fileRejected === 'INVALID_PATH') {
        throw new ErrorDTO(ErrorCodes.INVALID_PATH_ERROR, 'Upload path is not available for user');
      }
      if (fileRejected === 'UNSUPPORTED_TYPE') {
        throw new ErrorDTO(ErrorCodes.INPUT_ERROR, 'No valid files found in upload request');
      }
      if (!file) {
        throw new ErrorDTO(ErrorCodes.INPUT_ERROR, 'No valid files found in upload request');
      }

      // Permission check on logical upload path (defense in depth)
      if (UserDTOUtils.isDirectoryPathAvailable(path.join(uploadPath, file.originalname), req.session['user'].permissions) === false) {
        await GalleryMWs.safeUnlink(file.path);
        throw new ErrorDTO(ErrorCodes.INVALID_PATH_ERROR, 'Upload path is not available for user');
      }

      // File-level validations mirrored from previous behavior
      const ext = path.extname(file.originalname).toLowerCase();
      const isAllowed =
        SupportedFormats.WithDots.Photos.includes(ext) ||
        SupportedFormats.WithDots.Videos.includes(ext);
      if (!isAllowed) {
        await GalleryMWs.safeUnlink(file.path);
        throw new ErrorDTO(ErrorCodes.INPUT_ERROR, 'No valid files found in upload request');
      }

      // Handle conflict created by storage when force=false
      if (conflict && !force) {
        // Delete the temp/conflict file and respond with FILE_EXISTS_ERROR
        await GalleryMWs.safeUnlink(file.path);
        const baseDir = autoOrganize ? Config.Upload.defaultUploadPath : Config.Media.folder;
        const existingPath = path.join(baseDir, uploadPath, conflictOriginal || file.originalname);
        const relativeExisting = path.relative(ProjectPath.ImageFolder, existingPath);
        throw new ErrorDTO(ErrorCodes.FILE_EXISTS_ERROR, 'File already exists: ' + relativeExisting);
      }

      // Post-write ownership/permissions/timestamps
      const user: UserDTO = req.session['user'];
      if (user.unixUser) {
        try {
          const uid: number = parseInt(spawnSync('id', ['-u', user.unixUser]).stdout.toString().trim());
          const gid: number = parseInt(spawnSync('id', ['-g', user.unixUser]).stdout.toString().trim());
          await fsp.chown(file.path, uid, gid);
        } catch (e) {
          await GalleryMWs.safeUnlink(file.path);
          throw new ErrorDTO(ErrorCodes.GENERAL_ERROR, 'Error setting file owner: ' + e.toString());
        }
      }

      try { await fsp.chmod(file.path, user.unixUser ? 0o600 : 0o666); }
      catch (e) { await GalleryMWs.safeUnlink(file.path); throw new ErrorDTO(ErrorCodes.GENERAL_ERROR, 'Error setting file permissions: ' + e.toString()); }

      try { await fsp.utimes(file.path, new Date(lastModified), new Date(lastModified)); }
      catch (e) { await GalleryMWs.safeUnlink(file.path); throw new ErrorDTO(ErrorCodes.GENERAL_ERROR, 'Error setting file last modified time: ' + e.toString()); }

    } catch (e) {
      return next(e);
    }

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
      return next(new ErrorDTO(ErrorCodes.INVALID_PATH_ERROR, 'Upload path is not available for user'));
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
