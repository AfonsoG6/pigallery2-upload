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

  public static async parseAndCreateFiles(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    if (Config.Upload.enabled === false) {
      return next();
    }

    if (!req.headers['content-type']) {
      return next(
        new ErrorDTO(
          ErrorCodes.INPUT_ERROR,
          'No content type header found for upload'
        )
      );
    }

    if (req.headers['content-type'].indexOf('multipart/form-data') === -1) {
      return next(
        new ErrorDTO(
          ErrorCodes.INPUT_ERROR,
          'Content type header is not multipart/form-data for upload'
        )
      );
    }

    const boundary = multipart.getBoundary(req.headers['content-type']);
    if (!boundary) {
      return next(
        new ErrorDTO(
          ErrorCodes.INPUT_ERROR,
          'No boundary found in content type header for upload'
        )
      );
    }

    const parts = multipart.parse(req.body, boundary);
    const uploadPath = parts.find(
      (p): boolean => p.name === 'uploadPath' && p.data && p.data.byteLength > 0
    );
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
      return next(
        new ErrorDTO(
          ErrorCodes.INPUT_ERROR,
          'No valid files found in upload request'
        )
      );
    }
    // Guarantee that the uploadPath does not contain any path traversal characters
    
    var finalUploadPath = path.join(
      Config.Upload.defaultUploadPath,
      req.session['user'].name
    );
    if (uploadPath && uploadPath.data) {
      // Guarantee that the uploadPath does not contain any path traversal characters
      const uploadPathString = uploadPath.data.toString();
      if (uploadPathString.match(/(^\.{2}\/|\/\.{2}\/|\/\.{2}$|^\.{2}$)/)) {
        return next(
          new ErrorDTO(
            ErrorCodes.INPUT_ERROR,
            'Path traversal detected in uploadPath: ' + uploadPathString
          )
        );
      }
      finalUploadPath = path.join(
        Config.Media.folder,
        uploadPathString,
      )
    }

    try {
      await fsp.mkdir(finalUploadPath, {recursive: true});
    }
    catch (e) {
      return next(
        new ErrorDTO(
          ErrorCodes.GENERAL_ERROR,
          'Error creating target directory for upload: ' + e.toString()
        )
      );
    }

    for (const file of files) {
      const filePath = path.join(finalUploadPath, file.filename);
      try {
        await fsp.writeFile(filePath, file.data);
        await fsp.chmod(filePath, 0o666);
      }
      catch (e) {
        return next(
          new ErrorDTO(
            ErrorCodes.GENERAL_ERROR,
            'Error writing file to disk: ' + e.toString()
          )
        );
      }
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

    if (!req.session['user'] || !req.session['user'].name) {
      return next(
        new ErrorDTO(
          ErrorCodes.INPUT_ERROR,
          'User not logged in or user name not available'
        )
      );
    }

    const sourcePath = path.join(
      Config.Upload.defaultUploadPath,
      req.session['user'].name
    );
    const destinationPath = path.join(
      Config.Media.folder,
      req.session['user'].name
    );

    const pythonScriptPath = Config.Upload.imageOrganizerScriptPath;
    if (!pythonScriptPath || pythonScriptPath === "") {
      return next(
        new ErrorDTO(
          ErrorCodes.INPUT_ERROR,
          'Image organizer script path is not configured'
        )
      );
    }
    // Check if the python script exists
    try {
      await fsp.access(pythonScriptPath);
    } catch (e) {
      return next(
        new ErrorDTO(
          ErrorCodes.INPUT_ERROR,
          'Image organizer script not found at: ' + pythonScriptPath
        )
      );
    }

    const pythonArgs = [
      '--source', sourcePath,
      '--destination', destinationPath
    ];

    if (pythonScriptPath !== "") {
      try {
        const pythonProcess = spawnSync('python', [pythonScriptPath, ...pythonArgs]);
      }
      catch (e) {
        return next(
          new ErrorDTO(
            ErrorCodes.GENERAL_ERROR,
            'Error running image organizer script: ' + e.toString()
          )
        );
      }
    }
    req.resultPipe = "ok";
    return next();
  }
}
