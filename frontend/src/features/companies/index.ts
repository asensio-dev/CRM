/**
 * API pública de la feature `companies`.
 *
 * - `EditCompanyDialog` props: `{ company: CompanyDetail; open; onOpenChange(open); onSaved?(c) }`.
 *   Hace PATCH /companies/:id (sin RUC ni estado); muestra la cédula solo si `company.legalRepIdNumber`
 *   no es `undefined`. Deja la ficha guardada en `companyKeys.detail(id)` e invalida los listados.
 * - `AddBranchDialog` props: `{ companyId: number; open; onOpenChange(open); onAdded?(c) }`.
 *   Hace POST /companies/:id/branches; actualiza `companyKeys.detail(companyId)`.
 * - Para compartir caché con estos diálogos, la ficha debe consultarse con la clave `companyKeys.detail(id)`.
 */
export { CompaniesPage } from './companies-page';
export {
  AddBranchDialog,
  type AddBranchDialogProps,
  CreateCompanyDialog,
  EditCompanyDialog,
  type EditCompanyDialogProps,
} from './company-dialogs';
export { catalogKeys, companyKeys, useActivities, useSectors } from './queries';
