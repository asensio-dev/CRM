import type { UserRole } from '@axiom/contracts';
import type { User } from './user';

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}
export const PASSWORD_HASHER = Symbol('PasswordHasher');

export interface AccessClaims {
  userId: number;
  email: string;
  role: UserRole;
  /** `iat` (segundos) del token verificado; se ignora al emitir. */
  issuedAt?: number;
}

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

export interface TokenIssuer {
  issueAccess(claims: AccessClaims): Promise<string>;
  issueRefresh(userId: number): Promise<IssuedRefreshToken>;
  /** `null` si la firma, el tipo o la expiración no son válidos. */
  verifyAccess(token: string): Promise<AccessClaims | null>;
  verifyRefresh(token: string): Promise<{ userId: number } | null>;
  /** SHA-256 hex: lo único que se persiste del refresh token. */
  hashRefresh(token: string): string;
  readonly refreshTtlSeconds: number;
}
export const TOKEN_ISSUER = Symbol('TokenIssuer');

export interface UserRepository {
  findById(id: number): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  /** Inserta (id null) o actualiza; devuelve el usuario persistido. */
  save(user: User): Promise<User>;
  countActiveAdmins(excludingUserId?: number): Promise<number>;
  list(page: number, pageSize: number): Promise<{ items: User[]; total: number }>;
}
export const USER_REPOSITORY = Symbol('UserRepository');

export interface StoredRefreshToken {
  id: number;
  userId: number;
  expiresAt: Date;
  revokedAt: Date | null;
  /** Momento en que se rotó (sustituyó por otro). null si se revocó por logout/robo o sigue activo. */
  replacedAt: Date | null;
}

export interface RefreshTokenRepository {
  create(input: { userId: number; tokenHash: string; expiresAt: Date }): Promise<void>;
  findByHash(tokenHash: string): Promise<StoredRefreshToken | null>;
  /**
   * Revoca de forma atómica solo si seguía activo. `false` = ya estaba revocado (carrera/reutilización).
   * `replaced: true` marca que se revoca por rotación (sustituido por un token nuevo).
   */
  revokeIfActive(tokenHash: string, now: Date, options?: { replaced?: boolean }): Promise<boolean>;
  revokeAllForUser(userId: number, now: Date): Promise<void>;
  /** Revoca los tokens activos del usuario emitidos desde `since`. Devuelve cuántos revocó. */
  revokeActiveIssuedSince(userId: number, since: Date, now: Date): Promise<number>;
  /**
   * Borra como máximo `limit` filas caducadas (`expiresAt < cutoff`) o revocadas (`revokedAt < cutoff`)
   * antes de `cutoff`. Devuelve cuántas borró (si es `limit`, puede quedar más).
   */
  deleteStale(cutoff: Date, limit: number): Promise<number>;
}
export const REFRESH_TOKEN_REPOSITORY = Symbol('RefreshTokenRepository');
