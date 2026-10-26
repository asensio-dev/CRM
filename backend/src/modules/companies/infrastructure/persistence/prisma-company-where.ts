import { normalizeSearchText } from '@axiom/contracts';
import { Prisma } from '../../../../generated/prisma/client';
import {
  type ActivitySpec,
  AndSpec,
  type CompanySpecification,
  type CompanySpecificationVisitor,
  type EmployeeRangeSpec,
  type HasPhoneSpec,
  type SectorSpec,
  type StatusInSpec,
  TextMatchSpec,
} from '../../domain';

type Where = Prisma.CompanyWhereInput;

/**
 * Traduce una especificación de dominio a un `where` de Prisma.
 * El texto se busca en la columna calculada `searchText` (ruc + razón social + nombre comercial,
 * mayúsculas sin tildes, collation BIN2 e índice propio): ~20× más rápido que LIKE con la
 * collation lingüística sobre tres columnas.
 */
class PrismaWhereVisitor implements CompanySpecificationVisitor<Where> {
  visitText({ text }: TextMatchSpec): Where {
    return { searchText: { contains: normalizeSearchText(text) } };
  }

  visitStatusIn({ statuses }: StatusInSpec): Where {
    return statuses.length === 1 ? { status: statuses[0] } : { status: { in: [...statuses] } };
  }

  visitSector({ sectorId }: SectorSpec): Where {
    return { sectorId };
  }

  visitActivity({ activityId }: ActivitySpec): Where {
    return { activityId };
  }

  visitEmployeeRange({ min, max }: EmployeeRangeSpec): Where {
    return { employeeCount: { gte: min, lte: max } };
  }

  visitHasPhone({ expected }: HasPhoneSpec): Where {
    return expected ? { phone: { not: null } } : { phone: null };
  }

  visitAnd({ specs }: AndSpec): Where {
    return specs.length === 0 ? {} : { AND: specs.map((s) => s.accept(this)) };
  }
}

export function toPrismaCompanyWhere(spec: CompanySpecification): Where {
  return spec.accept(new PrismaWhereVisitor());
}

/** Escapa comodines de LIKE (se usa `ESCAPE '!'`). */
const escapeLike = (value: string) => value.replace(/[!%_[]/g, '!$&');

/**
 * La misma especificación como fragmento SQL parametrizado (`@P1…`, nunca concatenado). Lo usa la
 * búsqueda por texto, que resuelve página y total en una sola pasada (COUNT(*) OVER ()).
 */
class SqlWhereVisitor implements CompanySpecificationVisitor<Prisma.Sql> {
  visitText({ text }: TextMatchSpec): Prisma.Sql {
    const pattern = `%${escapeLike(normalizeSearchText(text))}%`;
    return Prisma.sql`c.[searchText] LIKE ${pattern} ESCAPE '!'`;
  }

  visitStatusIn({ statuses }: StatusInSpec): Prisma.Sql {
    return Prisma.sql`c.[status] IN (${Prisma.join([...statuses])})`;
  }

  visitSector({ sectorId }: SectorSpec): Prisma.Sql {
    return Prisma.sql`c.[sectorId] = ${sectorId}`;
  }

  visitActivity({ activityId }: ActivitySpec): Prisma.Sql {
    return Prisma.sql`c.[activityId] = ${activityId}`;
  }

  visitEmployeeRange({ min, max }: EmployeeRangeSpec): Prisma.Sql {
    const parts: Prisma.Sql[] = [];
    if (min !== undefined) parts.push(Prisma.sql`c.[employeeCount] >= ${min}`);
    if (max !== undefined) parts.push(Prisma.sql`c.[employeeCount] <= ${max}`);
    return parts.length === 0 ? Prisma.sql`1 = 1` : Prisma.join(parts, ' AND ');
  }

  visitHasPhone({ expected }: HasPhoneSpec): Prisma.Sql {
    return expected ? Prisma.sql`c.[phone] IS NOT NULL` : Prisma.sql`c.[phone] IS NULL`;
  }

  visitAnd({ specs }: AndSpec): Prisma.Sql {
    if (specs.length === 0) return Prisma.sql`1 = 1`;
    return Prisma.join(
      specs.map((s) => Prisma.sql`(${s.accept(this)})`),
      ' AND ',
    );
  }
}

export function toSqlCompanyWhere(spec: CompanySpecification): Prisma.Sql {
  return spec.accept(new SqlWhereVisitor());
}

/** ¿La especificación incluye búsqueda por texto? */
export function hasTextFilter(spec: CompanySpecification): boolean {
  if (spec instanceof TextMatchSpec) return true;
  if (spec instanceof AndSpec) return spec.specs.some(hasTextFilter);
  return false;
}
