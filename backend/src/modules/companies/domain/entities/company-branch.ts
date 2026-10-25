import { Entity } from '../../../../shared/domain';
import { employeeCountOf, optionalText, phoneOf } from '../validation';

export interface CompanyBranchProps {
  tradeName: string | null;
  address: string | null;
  phone: string | null;
  employeeCount: number;
  createdAt: Date | null;
}

export interface NewBranchInput {
  tradeName?: string | null;
  address?: string | null;
  phone?: string | null;
  employeeCount?: number;
}

/** Sucursal / nómina adicional de una empresa (filas extra del Excel con el mismo RUC). */
export class CompanyBranch extends Entity {
  private constructor(
    id: number | null,
    private readonly props: CompanyBranchProps,
  ) {
    super(id);
  }

  static create(input: NewBranchInput): CompanyBranch {
    return new CompanyBranch(null, {
      tradeName: optionalText(input.tradeName, 'El nombre comercial de la sucursal', 200),
      address: optionalText(input.address, 'La dirección de la sucursal', 300),
      phone: phoneOf(input.phone),
      employeeCount: employeeCountOf(input.employeeCount),
      createdAt: null,
    });
  }

  /** Reconstruye desde persistencia sin revalidar. */
  static rehydrate(id: number, props: CompanyBranchProps): CompanyBranch {
    return new CompanyBranch(id, props);
  }

  get tradeName(): string | null {
    return this.props.tradeName;
  }
  get address(): string | null {
    return this.props.address;
  }
  get phone(): string | null {
    return this.props.phone;
  }
  get employeeCount(): number {
    return this.props.employeeCount;
  }
  get createdAt(): Date | null {
    return this.props.createdAt;
  }

  /** Asigna el id generado por la base tras persistir. */
  assignId(id: number): void {
    this._id = id;
  }
}
