/**
 * API pública de la feature `contracts`.
 *
 * - `CreateContractDialog` props: `{ open; onOpenChange; companyId?; companyName?; onCreated?(c) }`.
 *   Con `companyId` el selector de empresa queda fijo. Crea en BORRADOR y mueve la empresa a EN_PROCESO_CONTRATO.
 * - Claves de caché: `contractKeys`. Las mutaciones invalidan contratos, analytics y el pipeline de la empresa.
 */

export { CreateContractDialog, type CreateContractDialogProps } from './contract-form-dialog';
export { ContractsPage } from './contracts-page';
export { contractKeys } from './queries';
