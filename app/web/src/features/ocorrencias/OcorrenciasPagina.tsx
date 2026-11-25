import { Alert } from '@/design-system';
import { temApi } from '@/data/ia';
import { OcorrenciasRecentes } from './OcorrenciasRecentes';
import { RegistrarOcorrencia } from './RegistrarOcorrencia';

/** Ocorrências: registrar pelo relato (formulário, reserva do WhatsApp) e acompanhar as recentes. */
export function OcorrenciasPagina() {
  if (!temApi) {
    return (
      <Alert tone="info" title="O registro de ocorrências usa a API">
        Defina <code>VITE_API_URL</code> em <code>app/web/.env</code> (por exemplo, http://localhost:7333) e recarregue a página.
      </Alert>
    );
  }
  return (
    <section className="cr-stack" id="ocorrencias">
      <RegistrarOcorrencia />
      <OcorrenciasRecentes />
    </section>
  );
}
