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
import {UserDTOUtils} from '../../common/entities/UserDTO';
import {MediaDTO, MediaDTOUtils} from '../../common/entities/MediaDTO';
import {QueryParams} from '../../common/QueryParams';
import {VideoProcessing} from '../model/fileaccess/fileprocessing/VideoProcessing';
import {SearchQueryDTO, SearchQueryTypes,} from '../../common/entities/SearchQueryDTO';
import {LocationLookupException} from '../exceptions/LocationLookupException';
import {SupportedFormats} from '../../common/SupportedFormats';
import {ServerTime} from './ServerTimingMWs';
import {SortByTypes} from '../../common/entities/SortingMethods';
import * as multipart from 'parse-multipart-data';
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

  private static parsePartsFromMultipartForm(req: Request): any[] {
    if (!req.headers['content-type']) {
      throw new ErrorDTO(ErrorCodes.INPUT_ERROR, 'No content type header found');
    }

    if (req.headers['content-type'].indexOf('multipart/form-data') === -1) {
      throw new ErrorDTO(ErrorCodes.INPUT_ERROR, 'Content type header is not multipart/form-data');
    }
    const boundary = multipart.getBoundary(req.headers['content-type']);
    if (!boundary) {
      throw new ErrorDTO(ErrorCodes.INPUT_ERROR, 'No boundary found in content type header');
    }

    return multipart.parse(req.body, boundary);
  }

  private static getParameterFromParts(parts: any[], parameterName: string, required = true, allowedRegex = /.*/): string[] {
    const parameterParts = parts.filter(
      (p): boolean => p.name === parameterName && p.data && p.data.byteLength > 0
    );
    if (!parameterParts || parameterParts.length === 0) {
      if (!required) return [""];
      throw new ErrorDTO(
        ErrorCodes.INPUT_ERROR,
        `Missing parameter: ${parameterName}`,
        null
      );
    }

    allowedRegex = new RegExp("^" + allowedRegex.source + "$");
    const invalidParts = parameterParts.filter(
      (p): boolean => !allowedRegex.test(p.data.toString().trim())
    );
    if (invalidParts.length > 0) {
      throw new ErrorDTO(
        ErrorCodes.INPUT_ERROR,
        `Invalid value for parameter: ${parameterName}`,
        null
      );
    }

    return parameterParts.map((p): string => p.data.toString().trim());
  }

  public static async moveFiles(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const result = new FileActionResultDTO();
    try {
      const parts = GalleryMWs.parsePartsFromMultipartForm(req);
      const sourcePaths: string[] = GalleryMWs.getParameterFromParts(parts, 'sourcePath');
      const destinationPath: string = GalleryMWs.getParameterFromParts(parts, 'destinationPath', false)[0];
      const destinationFileName: string = GalleryMWs.getParameterFromParts(parts, 'destinationFileName', false, /[^/\\:*?"<>|]+/)[0];
      const force: boolean = GalleryMWs.getParameterFromParts(parts, 'force', true, /true|false/)[0] === 'true';

      if (sourcePaths.length > 1 && destinationFileName) {
        throw new ErrorDTO(ErrorCodes.INPUT_ERROR, 'Cannot specify destination file name when moving multiple files');
      }

      for (const sourcePath of sourcePaths) {
        try {

          if (UserDTOUtils.isDirectoryPathAvailable(sourcePath, req.session['user'].permissions) === false) {
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

          if (UserDTOUtils.isDirectoryPathAvailable(relDestinationPath, req.session['user'].permissions) === false) {
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
          try { await fsp.chmod(fullDestinationPath, 0o666); }
          catch (e) { throw new ErrorDTO(ErrorCodes.GENERAL_ERROR, 'Error setting file permissions: ' + e.toString()); }
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
      const parts = GalleryMWs.parsePartsFromMultipartForm(req);
      const targetPaths: string[] = GalleryMWs.getParameterFromParts(parts, 'targetPath');

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

  public static async parseAndCreateFiles(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    if (Config.Upload.enabled === false) {
      return next();
    }

    try {
      const parts = GalleryMWs.parsePartsFromMultipartForm(req);
      const autoOrganize: boolean = GalleryMWs.getParameterFromParts(parts, "autoOrganize", true, /true|false/)[0] === "true";
      const force: boolean = GalleryMWs.getParameterFromParts(parts, "force", true, /true|false/)[0] === "true";
      let uploadPath: string = GalleryMWs.getParameterFromParts(parts, 'uploadPath')[0];
      const lastModified: number = parseInt(GalleryMWs.getParameterFromParts(parts, 'lastModified', true, /\d+/)[0], 10);
      const files = parts.filter(
        (p): boolean => (
          p.name === "file" &&
          p.filename &&
          (SupportedFormats.WithDots.Photos.includes(path.extname(p.filename).toLowerCase()) ||
          SupportedFormats.WithDots.Videos.includes(path.extname(p.filename).toLowerCase())) &&
          p.data &&
          p.data.byteLength > 0 &&
          p.data.byteLength < Config.Upload.maxFileSizeMb * 1000 * 1000
        )
      );
      if (files.length === 0) {
        throw new ErrorDTO(ErrorCodes.INPUT_ERROR, 'No valid files found in upload request');
      }

      if (UserDTOUtils.isDirectoryPathAvailable(uploadPath, req.session['user'].permissions) === false) {
        throw new ErrorDTO(ErrorCodes.INVALID_PATH_ERROR, 'Upload path is not available for user');
      }

      uploadPath = path.join(
        autoOrganize ? Config.Upload.defaultUploadPath : Config.Media.folder,
        uploadPath
      );

      try { await fsp.mkdir(uploadPath, {recursive: true}); }
      catch (e) { throw new ErrorDTO(ErrorCodes.GENERAL_ERROR, 'Error creating target directory for upload: ' + e.toString());}

      for (const file of files) {
        const filePath = path.join(uploadPath, file.filename);
        if (force === false) {
          const relativePath = path.relative(ProjectPath.ImageFolder, filePath);
          await fsp.access(filePath).then(
            () => { throw new ErrorDTO(ErrorCodes.FILE_EXISTS_ERROR, 'File already exists: ' + relativePath); },
            () => { /* File does not exist, proceed with write */ }
          );
        }
        try { await fsp.writeFile(filePath, file.data); }
        catch (e) { throw new ErrorDTO(ErrorCodes.GENERAL_ERROR, 'Error writing file to disk: ' + e.toString()); }
        try { await fsp.chmod(filePath, 0o666); }
        catch (e) { throw new ErrorDTO(ErrorCodes.GENERAL_ERROR, 'Error setting file permissions: ' + e.toString()); }
        try { await fsp.utimes(filePath, new Date(lastModified), new Date(lastModified)); }
        catch (e) { throw new ErrorDTO(ErrorCodes.GENERAL_ERROR, 'Error setting file last modified time: ' + e.toString()); }
      }
    }
    catch (e) {
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

    if (!req.params || !req.params['uploadPath']) {
      return next(new ErrorDTO(ErrorCodes.INPUT_ERROR, 'Missing parameter: uploadPath'));
    }
    const uploadPath = req.params['uploadPath'] as string;
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
