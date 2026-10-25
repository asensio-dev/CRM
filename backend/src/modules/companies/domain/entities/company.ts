import type { PipelineStatus } from '@axiom/contracts';
import { AggregateRoot } from '../../../../shared/domain';
import { employeeCountOf, optionalText, phoneOf, requiredText } from '../validation';
import { Ruc } from '../value-objects/ruc';
import { CompanyBranch, type NewBranchInput } from './company-branch';

export type CompanySource = 'EXCEL' | 'MANUAL';

/**
 * Estado del pipeline: lo gestiona el módulo `pipeline`. Aquí es solo lectura;
 * `Company` no ofrece ningún método para modificarlo.
 */
export interface CompanyPipelineState {
  readonly status: PipelineStatus;
  readonly version: number;
  readonly lastContactAt: Date | null;
}

export interface CompanyProps extends CompanyPipelineState {
  ruc: Ruc;
  legalName: string;
  tradeName: string | null;
  legalRepName: string | null;
  legalRepIdNumber: string | null;
  employeeCount: number;
  phone: string | null;
  shippingAddress: string | null;
  particularAddress: string | null;
  activityId: number | null;
  sectorId: number | null;
  source: CompanySource;
  createdById: number | null;
  branches: CompanyBranch[];
}

export interface NewCompanyInput {
  ruc: unknown;
  legalName: string;
  tradeName?: string | null;
  legalRepName?: string | null;
  legalRepIdNumber?: string | null;
  employeeCount?: number;
  phone?: string | null;
  shippingAddress?: string | null;
  particularAddress?: string | null;
  activityId?: number | null;
  sectorId?: number | null;
  createdById?: number | null;
}

/** Campos editables. `undefined` = sin cambio; `null` = limpiar (donde aplique). Sin RUC ni estado. */
export interface CompanyChanges {
  legalName?: string;
  tradeName?: string | null;
  legalRepName?: string | null;
  legalRepIdNumber?: string | null;
  employeeCount?: number;
  phone?: string | null;
  shippingAddress?: string | null;
  particularAddress?: string | null;
  activityId?: number | null;
  sectorId?: number | null;
}

/** Agregado Empresa: un RUC = una empresa; las filas extra son sucursales. */
export class Company extends AggregateRoot {
  private constructor(
    id: number | null,
    private props: CompanyProps,
  ) {
    super(id);
  }

  /** Factory con invariantes. Toda empresa manual nace `POR_CONTACTAR`, versión 0. */
  static create(input: NewCompanyInput): Company {
    return new Company(null, {
      ruc: Ruc.create(input.ruc),
      legalName: requiredText(input.legalName, 'La razón social', 200),
      tradeName: optionalText(input.tradeName, 'El nombre comercial', 200),
      legalRepName: optionalText(input.legalRepName, 'El representante legal', 100),
      legalRepIdNumber: optionalText(input.legalRepIdNumber, 'La cédula del representante', 20),
      employeeCount: employeeCountOf(input.employeeCount),
      phone: phoneOf(input.phone),
      shippingAddress: optionalText(input.shippingAddress, 'La dirección de envío', 300),
      particularAddress: optionalText(input.particularAddress, 'La dirección particular', 300),
      activityId: input.activityId ?? null,
      sectorId: input.sectorId ?? null,
      status: 'POR_CONTACTAR',
      version: 0,
      lastContactAt: null,
      source: 'MANUAL',
      createdById: input.createdById ?? null,
      branches: [],
    });
  }

  /** Reconstruye desde persistencia sin revalidar. */
  static rehydrate(id: number, props: CompanyProps): Company {
    return new Company(id, props);
  }

  /** Aplica cambios editables validando invariantes; nunca toca RUC ni estado del pipeline. */
  update(changes: CompanyChanges): void {
    const next = { ...this.props };
    if (changes.legalName !== undefined) {
      next.legalName = requiredText(changes.legalName, 'La razón social', 200);
    }
    if (changes.tradeName !== undefined) {
      next.tradeName = optionalText(changes.tradeName, 'El nombre comercial', 200);
    }
    if (changes.legalRepName !== undefined) {
      next.legalRepName = optionalText(changes.legalRepName, 'El representante legal', 100);
    }
    if (changes.legalRepIdNumber !== undefined) {
      next.legalRepIdNumber = optionalText(
        changes.legalRepIdNumber,
        'La cédula del representante',
        20,
      );
    }
    if (changes.employeeCount !== undefined) {
      next.employeeCount = employeeCountOf(changes.employeeCount);
    }
    if (changes.phone !== undefined) next.phone = phoneOf(changes.phone);
    if (changes.shippingAddress !== undefined) {
      next.shippingAddress = optionalText(changes.shippingAddress, 'La dirección de envío', 300);
    }
    if (changes.particularAddress !== undefined) {
      next.particularAddress = optionalText(
        changes.particularAddress,
        'La dirección particular',
        300,
      );
    }
    if (changes.activityId !== undefined) next.activityId = changes.activityId;
    if (changes.sectorId !== undefined) next.sectorId = changes.sectorId;
    this.props = next;
  }

  addBranch(input: NewBranchInput): CompanyBranch {
    const branch = CompanyBranch.create(input);
    this.props.branches.push(branch);
    return branch;
  }

  get ruc(): Ruc {
    return this.props.ruc;
  }
  get legalName(): string {
    return this.props.legalName;
  }
  get tradeName(): string | null {
    return this.props.tradeName;
  }
  get legalRepName(): string | null {
    return this.props.legalRepName;
  }
  get legalRepIdNumber(): string | null {
    return this.props.legalRepIdNumber;
  }
  get employeeCount(): number {
    return this.props.employeeCount;
  }
  get phone(): string | null {
    return this.props.phone;
  }
  get shippingAddress(): string | null {
    return this.props.shippingAddress;
  }
  get particularAddress(): string | null {
    return this.props.particularAddress;
  }
  get activityId(): number | null {
    return this.props.activityId;
  }
  get sectorId(): number | null {
    return this.props.sectorId;
  }
  get source(): CompanySource {
    return this.props.source;
  }
  get createdById(): number | null {
    return this.props.createdById;
  }
  get pipeline(): CompanyPipelineState {
    return {
      status: this.props.status,
      version: this.props.version,
      lastContactAt: this.props.lastContactAt,
    };
  }
  get branches(): readonly CompanyBranch[] {
    return this.props.branches;
  }

  /** Asigna el id generado por la base tras persistir. */
  assignId(id: number): void {
    this._id = id;
  }
}
