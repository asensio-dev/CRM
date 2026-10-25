import type { PipelineStatus } from '@axiom/contracts';
import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../../shared/domain';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { Company, CompanyBranch, type CompanySource, type CompanyWriter, Ruc } from '../../domain';

const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class PrismaCompanyWriter implements CompanyWriter {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<Company | null> {
    const row = await this.prisma.db.company.findUnique({
      where: { id },
      include: { branches: { orderBy: { id: 'asc' } } },
    });
    if (!row) return null;
    return Company.rehydrate(row.id, {
      ruc: Ruc.create(row.ruc),
      legalName: row.legalName,
      tradeName: row.tradeName,
      legalRepName: row.legalRepName,
      legalRepIdNumber: row.legalRepIdNumber,
      employeeCount: row.employeeCount,
      phone: row.phone,
      shippingAddress: row.shippingAddress,
      particularAddress: row.particularAddress,
      activityId: row.activityId,
      sectorId: row.sectorId,
      status: row.status as PipelineStatus,
      version: row.version,
      lastContactAt: row.lastContactAt,
      source: row.source as CompanySource,
      createdById: row.createdById,
      branches: row.branches.map((b) =>
        CompanyBranch.rehydrate(b.id, {
          tradeName: b.tradeName,
          address: b.address,
          phone: b.phone,
          employeeCount: b.employeeCount,
          createdAt: b.createdAt,
        }),
      ),
    });
  }

  async insert(company: Company): Promise<void> {
    try {
      const created = await this.prisma.db.company.create({
        data: {
          ruc: company.ruc.value,
          legalName: company.legalName,
          tradeName: company.tradeName,
          legalRepName: company.legalRepName,
          legalRepIdNumber: company.legalRepIdNumber,
          employeeCount: company.employeeCount,
          phone: company.phone,
          shippingAddress: company.shippingAddress,
          particularAddress: company.particularAddress,
          activityId: company.activityId,
          sectorId: company.sectorId,
          // Estado inicial: los valores por defecto de la tabla (POR_CONTACTAR, version 0).
          source: company.source,
          createdById: company.createdById,
        },
        select: { id: true },
      });
      company.assignId(created.id);
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        throw DomainError.conflict(
          'COMPANY_RUC_DUPLICATED',
          `Ya existe una empresa con el RUC ${company.ruc.value}`,
        );
      }
      throw error;
    }
  }

  async save(company: Company): Promise<void> {
    const id = company.id as number;
    const db = this.prisma.db;
    // Nunca se escribe status / version / lastContactAt: pertenecen al módulo pipeline.
    await db.company.update({
      where: { id },
      data: {
        legalName: company.legalName,
        tradeName: company.tradeName,
        legalRepName: company.legalRepName,
        legalRepIdNumber: company.legalRepIdNumber,
        employeeCount: company.employeeCount,
        phone: company.phone,
        shippingAddress: company.shippingAddress,
        particularAddress: company.particularAddress,
        activityId: company.activityId,
        sectorId: company.sectorId,
      },
      select: { id: true },
    });
    for (const branch of company.branches) {
      if (branch.id !== null) continue;
      const created = await db.companyBranch.create({
        data: {
          companyId: id,
          tradeName: branch.tradeName,
          address: branch.address,
          phone: branch.phone,
          employeeCount: branch.employeeCount,
        },
        select: { id: true },
      });
      branch.assignId(created.id);
    }
  }
}
