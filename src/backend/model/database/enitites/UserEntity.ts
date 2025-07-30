import {UserDTO, UserRoles} from '../../../../common/entities/UserDTO';
import {Column, Entity, PrimaryGeneratedColumn, Unique} from 'typeorm';

@Entity()
@Unique(['name'])
export class UserEntity implements UserDTO {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  password: string;

  @Column('smallint')
  role: UserRoles;

  @Column('simple-array')
  permissions: string[];

  @Column({nullable: true})
  unixUser: string;
}
