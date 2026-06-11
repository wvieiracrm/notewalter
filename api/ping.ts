// Endpoint de diagnóstico SEM imports — confirma se a infra de funções da
// Vercel está saudável, isolando crashes causados por dependências.
interface VercelRequest {
  method?: string;
}
interface VercelResponse {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
}

export default function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({ ok: true, ts: Date.now() });
}
