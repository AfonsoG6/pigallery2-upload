import {DirectoryPathDTO} from './DirectoryDTO';
import {FileDTO} from './FileDTO';

export interface MDFileDTO extends FileDTO {
  id: number;
  name: string;
  directory: DirectoryPathDTO;
  sha256?: string;
  date: number;
}

