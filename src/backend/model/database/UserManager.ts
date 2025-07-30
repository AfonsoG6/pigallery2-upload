import {UserDTO, UserRoles} from '../../../common/entities/UserDTO';
import {UserEntity} from './enitites/UserEntity';
import {SQLConnection} from './SQLConnection';
import {PasswordHelper} from '../PasswordHelper';
import {FindOptionsWhere} from 'typeorm';

export class UserManager {


  public async findOne(filter: FindOptionsWhere<UserEntity>): Promise<UserEntity> {
    const connection = await SQLConnection.getConnection();
    const pass = filter.password as string;
    delete filter.password;
    const user = await connection.getRepository(UserEntity).findOneBy(filter);

    if (pass && !PasswordHelper.comparePassword(pass, user.password)) {
      throw new Error('No entry found');
    }
    return user;
  }

  public async find(filter: FindOptionsWhere<UserDTO>): Promise<UserEntity[]> {
    const connection = await SQLConnection.getConnection();
    return await connection.getRepository(UserEntity).findBy(filter);
  }

  public async createUser(user: UserDTO): Promise<UserEntity> {
    const connection = await SQLConnection.getConnection();
    user.password = PasswordHelper.cryptPasswordBackend(user.password);
    return connection.getRepository(UserEntity).save(user);
  }

  public async deleteUser(id: number): Promise<UserEntity> {
    const connection = await SQLConnection.getConnection();
    const user = await connection.getRepository(UserEntity).findOneBy({id});
    return await connection.getRepository(UserEntity).remove(user);
  }

  public async changeRole(id: number, newRole: UserRoles): Promise<UserEntity> {
    const connection = await SQLConnection.getConnection();
    const userRepository = connection.getRepository(UserEntity);
    const user = await userRepository.findOneBy({id});
    user.role = newRole;
    return userRepository.save(user);
  }

  public async changePermissions(id: number, newPermissions: string[]): Promise<UserEntity> {
    const connection = await SQLConnection.getConnection();
    const userRepository = connection.getRepository(UserEntity);
    const user = await userRepository.findOneBy({id});
    user.permissions = newPermissions;
    return userRepository.save(user);
  }

  public async changeUnixUser(id: number, newUnixUser: string): Promise<UserEntity> {
    const connection = await SQLConnection.getConnection();
    const userRepository = connection.getRepository(UserEntity);
    const user = await userRepository.findOneBy({id});
    user.unixUser = newUnixUser;
    return userRepository.save(user);
  }

  public async updateUser(id: number, userData: Partial<UserDTO>): Promise<UserEntity> {
    const connection = await SQLConnection.getConnection();
    const userRepository = connection.getRepository(UserEntity);
    const user = await userRepository.findOneBy({id});
    Object.assign(user, userData);
    return userRepository.save(user);
  }
}
