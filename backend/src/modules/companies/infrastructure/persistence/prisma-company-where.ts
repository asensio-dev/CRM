import { normalizeSearchText } from '@axiom/contracts';
import type { Prisma } from '../../../../generated/prisma/client';
import type {
  ActivitySpec,
  AndSpec,
  CompanySpecification,
  CompanySpecificationVisitor,
  EmployeeRangeSpec,
  HasPhoneSpec,
  SectorSpec,
  StatusInSpec,
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
