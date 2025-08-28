import {Request} from 'express';

export enum ErrorCodes {
  NOT_AUTHENTICATED = 1,
  ALREADY_AUTHENTICATED = 2,
  NOT_AUTHORISED = 3,
  PERMISSION_DENIED = 4,
  CREDENTIAL_NOT_FOUND = 5,

  USER_CREATION_ERROR = 20,

  GENERAL_ERROR = 31,
  THUMBNAIL_GENERATION_ERROR = 32,
  PHOTO_GENERATION_ERROR = 33,
  PERSON_ERROR = 34,
  METAFILE_ERROR = 35,
  SERVER_ERROR = 36,

  USER_MANAGEMENT_DISABLED = 40,

  INPUT_ERROR = 50,
  FILE_INVALID_PATH_ERROR = 51,
  FILE_UNSUPPORTED_TYPE_ERROR = 52,
  FILE_CONFLICT_PATH_ERROR = 53,
  FILE_CONFLICT_HASH_ERROR = 54,
  FILE_RENAME_FAILURE = 55,
  FILE_CHOWN_FAILURE = 56,
  FILE_CHMOD_FAILURE = 57,
  FILE_UTIMES_FAILURE = 58,
  FILE_RM_FAILURE = 59,

  SETTINGS_ERROR = 60,
  TASK_ERROR = 61,
  JOB_ERROR = 62,
  LocationLookUp_ERROR = 63,

  ALBUM_ERROR = 70,
}

export class ErrorDTO {
  public detailsStr: string;
  public request: {
    method: string;
    url: string;
  } = {method: '', url: ''};

  constructor(
      public code: ErrorCodes,
      public message?: string,
      public details?: any,
      req?: Request
  ) {
    this.detailsStr =
        (this.details ? this.details.toString() : '') || ErrorCodes[code];
    if (req) {
      this.request = {
        method: req.method,
        url: req.url,
      };
    }
  }

  public setRequest(req: Request): void {
    this.request = {
      method: req.method,
      url: req.url,
    };
  }

  toString(): string {
    return '[' + ErrorCodes[this.code] + '] ' + this.message + this.detailsStr;
  }

  public static getStandardMessage(errorCode: ErrorCodes) {
    switch (errorCode) {
      case ErrorCodes.INPUT_ERROR:
        return 'The request contained invalid input.';
      case ErrorCodes.FILE_INVALID_PATH_ERROR:
        return 'The specified path is invalid.';
      case ErrorCodes.FILE_UNSUPPORTED_TYPE_ERROR:
        return 'The specified file is of an unsupported type.';
      case ErrorCodes.FILE_CONFLICT_PATH_ERROR:
        return 'A file with the same name already exists in the specified path (You may force this operation).';
      case ErrorCodes.FILE_CONFLICT_HASH_ERROR:
        return 'An identical file already exists (You may force this operation).';
      case ErrorCodes.FILE_RENAME_FAILURE:
        return 'Failed to rename a file.';
      case ErrorCodes.FILE_CHOWN_FAILURE:
        return 'Failed to change the owner of a file.';
      case ErrorCodes.FILE_CHMOD_FAILURE:
        return 'Failed to change the permissions of a file.';
      case ErrorCodes.FILE_UTIMES_FAILURE:
        return 'Failed to update the timestamps of a file.';
      case ErrorCodes.FILE_RM_FAILURE:
        return 'Failed to remove a file.';
      default:
        return 'An unknown error occurred.';
    }
  }

  public getStandardMessage(): string {
    return ErrorDTO.getStandardMessage(this.code);
  }
}
