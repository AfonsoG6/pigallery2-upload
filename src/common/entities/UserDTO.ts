import {DirectoryPathDTO} from './DirectoryDTO';
import {Utils} from '../Utils';

export enum UserRoles {
  LimitedGuest = 1,
  Guest = 2,
  User = 3,
  Admin = 4,
  Developer = 5,
}

export interface UserDTO {
  id: number;
  name: string;
  password: string;
  role: UserRoles;
  permissions: string[];
  csrfToken?: string;
  usedSharingKey?: string;
  unixUser?: string;
}

export const UserDTOUtils = {
  isDirectoryPathAvailable: (path: string, permissions: string[]): boolean => {
    if (permissions == null) {
      return true;
    }
    path = Utils.canonizePath(path);
    if (path.match(/(^\.{2}\/|\/\.{2}\/|\/\.{2}$|^\.{2}$)/)) {
      // Path traversal not allowed
      return false;
    }
    if (permissions.length === 0) {
      return true;
    }
    for (const permission of permissions) {
      const processedPermission = Utils.canonizePath(permission)
        .replace(/\*\*+/, "<<ANY_PATH_SEQUENCE>>")
        .replace("*", "<<ANY_DIRECTORY_OR_FILE>>")
      let permRegex = "^" + processedPermission.replace(/[.*+?^${}()|[\]\\]/g, (match) => `\\${match}`) + "$";
      permRegex = permRegex
        .replace("/<<ANY_PATH_SEQUENCE>>$", "(/<<ANY_PATH_SEQUENCE>>)?$")
        .replace("/<<ANY_DIRECTORY_OR_FILE>>$", "(/<<ANY_DIRECTORY_OR_FILE>>)?$")
        .replace("<<ANY_PATH_SEQUENCE>>", "[^\\:*?\"<>|]+")
        .replace("<<ANY_DIRECTORY_OR_FILE>>", "[^\\:*?\"<>|/]+");
      const permissionRegex = new RegExp(permRegex);
      console.log(`Checking path: ${path} against permission regex: ${permissionRegex}`);
      if (permissionRegex.test(path)) {
        return true;
      }
    }
    return false;
  },

  isDirectoryAvailable: (
      directory: DirectoryPathDTO,
      permissions: string[]
  ): boolean => {
    return UserDTOUtils.isDirectoryPathAvailable(
        Utils.concatUrls(directory.path, directory.name),
        permissions
    );
  },
};
