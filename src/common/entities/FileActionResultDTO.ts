import { ErrorDTO } from "./Error";

export interface FailedPathDTO {
  path: string;
  reason: ErrorDTO;
}


export class FileActionResultDTO {
  failedPaths: FailedPathDTO[] = [];

  addFailedPath(path: string, reason: ErrorDTO): void {
    if (!this.failedPaths.some(failedPath => failedPath.path === path)) {
      this.failedPaths.push({ path, reason });
    }
  }
}
