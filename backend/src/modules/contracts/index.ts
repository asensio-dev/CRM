// API pública del módulo contracts (contratos de venta). Otros módulos solo pueden importar desde aquí.
export { ContractsModule } from './contracts.module';
export { ContractCreated, ContractStatusChanged } from './domain/events';
