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
  csrfToken?: string;
  usedSharingKey?: string;
  permissions: string[]; // user can only see these permissions. if ends with *, its recursive
}

export const UserDTOUtils = {
  isDirectoryPathAvailable: (path: string, permissions: string[]): boolean => {
    if (permissions == null) {
      return true;
    }
    permissions = permissions.map((p) => Utils.canonizePath(p));
    path = Utils.canonizePath(path);
    if (path.match(/(^\.{2}\/|\/\.{2}\/|\/\.{2}$|^\.{2}$)/)) {
      // Path traversal not allowed
      return false;
    }
    if (permissions.length === 0) {
      return true;
    }
    for (const permission of permissions) {
      const permissionRegex = new RegExp("^" +
        permission
        .replace("*", ".*")
        .replace("/", "\\/")
        + "$"
      );
      if (permissionRegex.test(path)) {
        console.log(`Path "${path}" matches permission "${permission}"`);
        return true;
      }
      if (permission.endsWith("/*")) {
        const permissionBaseDirRegex = new RegExp("^" +
          permission
          .substring(0, permission.length - 2)
          .replace("*", ".*")
          .replace("/", "\\/")
          + "$"
        );
        if (permissionBaseDirRegex.test(path)) {
          console.log(`Path "${path}" matches base directory permission "${permission}"`);
          return true;
        }
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
