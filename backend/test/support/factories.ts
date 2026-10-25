import type {
  BoardDto,
  CompanyDetail,
  PipelineStateDto,
  RegisterInteractionRequest,
  RegisterInteractionResultDto,
} from '@axiom/contracts';
import { type TestApp, uniqueRuc } from './app';

/** Crea una empresa nueva (POR_CONTACTAR, MANUAL) con RUC único. */
export async function createCompany(
  t: TestApp,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<CompanyDetail> {
  const res = await t.api<CompanyDetail>('POST', '/companies', {
    token,
    body: {
      ruc: uniqueRuc(),
      legalName: 'Empresa de Prueba Integración S.A.',
      employeeCount: 12,
      phone: '22700000',
      ...overrides,
    },
  });
  if (res.status !== 201)
    throw new Error(`createCompany falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function interact(
  t: TestApp,
  token: string,
  companyId: number,
  body: Partial<RegisterInteractionRequest> = {},
) {
  return t.api<RegisterInteractionResultDto>(
    'POST',
    `/pipeline/companies/${companyId}/interactions`,
    {
      token,
      body: { channel: 'LLAMADA', outcome: 'CONTESTO', ...body },
    },
  );
}

export async function pipelineState(t: TestApp, token: string, companyId: number) {
  const res = await t.api<PipelineStateDto>('GET', `/pipeline/companies/${companyId}`, { token });
  if (res.status !== 200) throw new Error(`pipelineState falló: ${res.status}`);
  return res.body;
}

/** Lleva una empresa nueva a CON_RESPUESTA (INTERESADO desde POR_CONTACTAR). */
export async function companyWithResponse(t: TestApp, token: string): Promise<CompanyDetail> {
  const company = await createCompany(t, token);
  const res = await interact(t, token, company.id, { outcome: 'INTERESADO' });
  if (res.status !== 201)
    throw new Error(`companyWithResponse falló: ${res.status} ${JSON.stringify(res.body)}`);
  return company;
}

export async function board(t: TestApp, token: string, limitPerColumn = 1): Promise<BoardDto> {
  const res = await t.api<BoardDto>('GET', `/pipeline/board?limitPerColumn=${limitPerColumn}`, {
    token,
  });
  if (res.status !== 200) throw new Error(`board falló: ${res.status}`);
  return res.body;
}
