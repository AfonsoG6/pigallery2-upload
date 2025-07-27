import * as crypto from 'crypto-js';


export class LoginCredential {
  constructor(
    public username: string = '',
    public password: string = '',
    public rememberMe: boolean = true
  ) {}

  public static generateDeterministicSalt(username: string): string {
    let hash = "pigallery2|" + username;
    for (let i = 0; i < 1024; i++) {
      hash = crypto.SHA256(hash).toString();
    }
    return hash;
  }

  public static cryptPasswordFrontend(username: string, password: string): string {
    const deterministicSalt = this.generateDeterministicSalt(username);
    return crypto.SHA256(password + deterministicSalt).toString();
  }

  public getToSend(): LoginCredential {
    const overthewirePassword = LoginCredential.cryptPasswordFrontend(this.username, this.password);
    return new LoginCredential(this.username, overthewirePassword, this.rememberMe);
  }
}
