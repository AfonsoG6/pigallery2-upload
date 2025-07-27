import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

export class PasswordHelper {
  public static cryptPasswordBackend(password: string): string {
    const salt = bcrypt.genSaltSync(9);
    return bcrypt.hashSync(password, salt);
  }

  public static comparePassword(
      password: string,
      encryptedPassword: string
  ): boolean {
    try {
      return bcrypt.compareSync(password, encryptedPassword);
      // eslint-disable-next-line no-empty
    } catch (e) {
    }
    return false;
  }

  public static generateDeterministicSalt(username: string): string {
    let hash = "pigallery2|" + username;
    for (let i = 0; i < 1024; i++) {
      hash = crypto.createHash('sha256').update(hash).digest('hex');
    }
    return hash;
  }

  public static cryptPasswordFrontend(username: string, password: string): string {
    const deterministicSalt = this.generateDeterministicSalt(username);
    return crypto.createHash('sha256').update(password + deterministicSalt).digest('hex');
  }
}
