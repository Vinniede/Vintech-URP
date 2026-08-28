import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Modal, PinKeypad } from '@urp/ui';

type ApprovalSummary = { id: string; actionType: string; amount?: string; context?: string };
type Props = { approval: ApprovalSummary | null; apiUrl: (path: string) => string; accessToken: string; onComplete: (approved: boolean) => void };

export function SupervisorApprovalModal({ approval, apiUrl, accessToken, onComplete }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (approval) { setPin(''); setError(''); window.setTimeout(() => inputRef.current?.focus(), 0); } }, [approval]);
  if (!approval) return null;
  const decide = async (decision: 'approved' | 'rejected') => {
    setLoading(true); setError('');
    try { const response = await fetch(apiUrl(`/approvals/${approval.id}/decide`), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ decision, pin }) }); if (response.status === 401) { setError('Incorrect supervisor PIN. Try again.'); return; } if (!response.ok) throw new Error('Approval could not be completed.'); onComplete(decision === 'approved'); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Approval could not be completed.'); } finally { setLoading(false); }
  };
  return <Modal open={true} title="Supervisor approval required" onClose={() => onComplete(false)}><Card><p><strong>{approval.actionType.replaceAll('_', ' ')}</strong>{approval.amount ? ` · ${approval.amount}` : ''}</p>{approval.context && <p>{approval.context}</p>}<label className="urp-pin-label">Supervisor PIN<input ref={inputRef} className="urp-input urp-pin-hidden-input" value={pin} inputMode="numeric" type="password" readOnly aria-label="Supervisor PIN" /></label><PinKeypad value={pin} onChange={setPin} />{error && <Alert>{error}</Alert>}<div className="urp-approval-actions"><Button variant="danger" type="button" disabled={loading} onClick={() => void decide('rejected')}>Reject</Button><Button variant="primary" type="button" disabled={loading || pin.length < 4} onClick={() => void decide('approved')}>{loading ? 'Checking...' : 'Approve'}</Button></div></Card></Modal>;
}
