import { type UserRole, UserRoleSchema } from '@axiom/contracts';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { Email, User, type UserRepository } from '../../domain';

interface UserRow {
  id: number;
  email: string;
  fullName: string;
  passwordHash: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
}

function toDomain(row: UserRow): User {
  return User.rehydrate({
    id: row.id,
    email: Email.create(row.email),
    fullName: row.fullName,
    passwordHash: row.passwordHash,
    role: UserRoleSchema.parse(row.role) as UserRole,
    isActive: row.isActive,
    createdAt: row.createdAt,
  });
}

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<User | null> {
    const row = await this.prisma.db.user.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.db.user.findUnique({ where: { email } });
    return row ? toDomain(row) : null;
  }

  async save(user: User): Promise<User> {
    const data = {
      email: user.email.value,
      fullName: user.fullName,
      passwordHash: user.passwordHash,
      role: user.role,
      isActive: user.isActive,
    };
    const row =
      user.id === null
        ? await this.prisma.db.user.create({ data })
        : await this.prisma.db.user.update({ where: { id: user.id }, data });
    return toDomain(row);
  }

  countActiveAdmins(excludingUserId?: number): Promise<number> {
    return this.prisma.db.user.count({
      where: {
        role: 'ADMIN',
        isActive: true,
        ...(excludingUserId === undefined ? {} : { id: { not: excludingUserId } }),
      },
    });
  }

  async list(page: number, pageSize: number): Promise<{ items: User[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.prisma.db.user.findMany({
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.db.user.count(),
    ]);
    return { items: rows.map(toDomain), total };
  }
}
