import { Injectable } from '@nestjs/common';
import type { PasswordHasher } from '../../domain';

/** Argon2id vía Bun.password (mismo algoritmo que usa el seed). */
@Injectable()
export class BunPasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return Bun.password.hash(plain, { algorithm: 'argon2id' });
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    try {
      return await Bun.password.verify(plain, hash);
    } catch {
      return false; // hash corrupto o de formato desconocido
    }
  }
}
