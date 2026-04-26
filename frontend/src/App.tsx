import { useCallback, useEffect, useMemo, useState } from 'react';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { Networks as KitNetworks } from '@creit.tech/stellar-wallets-kit/types';
import {
  Contract,
  TransactionBuilder,
  Networks,
  Address,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { Api, Server as SorobanServer } from '@stellar/stellar-sdk/rpc';
import { Wallet, CheckCircle2, AlertCircle, Loader2, Vote, Send, Banknote } from 'lucide-react';

const DEFAULT_DAO_CORE_ID =
  import.meta.env.VITE_DAO_CORE_CONTRACT_ID ??
  'CBIMHITPYBLX25DFSOR3WGWEIPOCJNNM67DIWAXZQOJAQNLLOGJSE72X';
const DEFAULT_RPC_URL =
  import.meta.env.VITE_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';

const STROOPS_PER_XLM = 10_000_000n;

StellarWalletsKit.init({
  modules: defaultModules(),
  network: KitNetworks.TESTNET,
  selectedWalletId: 'freighter',
});

export type ProposalRow = {
  id: number;
  proposer: string;
  to: string;
  amountStroops: bigint;
  votes: bigint;
  executed: boolean;
};

function toBigIntSafe(v: unknown): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return BigInt(Math.trunc(v));
  if (typeof v === 'string' && v !== '') {
    try {
      return BigInt(v);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function parseProposalFromSimulation(native: unknown): ProposalRow | null {
  if (native === null || native === undefined) return null;

  if (Array.isArray(native)) {
    if (native.length === 0) return null;
    const tag = native[0];
    if (tag === 0 || tag === false) return null;
    const payload = native.length >= 2 ? native[1] : null;
    if (tag === 0 || tag === 'None' || payload === null || typeof payload !== 'object') {
      return null;
    }
    return mapStructToRow(payload as Record<string, unknown>);
  }

  if (typeof native === 'object' && native !== null && 'amount' in native) {
    return mapStructToRow(native as Record<string, unknown>);
  }
  return null;
}

function mapStructToRow(m: Record<string, unknown>): ProposalRow | null {
  const id = Number(m.id);
  if (!Number.isFinite(id)) return null;
  const proposer = typeof m.proposer === 'string' ? m.proposer : String(m.proposer);
  const to = typeof m.to === 'string' ? m.to : String(m.to);
  return {
    id,
    proposer,
    to,
    amountStroops: toBigIntSafe(m.amount),
    votes: toBigIntSafe(m.votes),
    executed: Boolean(m.executed),
  };
}

function stroopsToXlmDisplay(stroops: bigint): string {
  const whole = stroops / STROOPS_PER_XLM;
  const frac = stroops % STROOPS_PER_XLM;
  if (frac === 0n) return whole.toString();
  const fracStr = (STROOPS_PER_XLM + frac).toString().slice(1).replace(/0+$/, '');
  return `${whole}.${fracStr || '0'}`;
}

function shortAddr(a: string, left = 6, right = 4): string {
  if (a.length <= left + right) return a;
  return `${a.slice(0, left)}...${a.slice(-right)}`;
}

function App() {
  const rpcUrl = DEFAULT_RPC_URL;
  const daoCoreId = DEFAULT_DAO_CORE_ID;

  const core = useMemo(() => new Contract(daoCoreId), [daoCoreId]);
  const server = useMemo(() => new SorobanServer(rpcUrl), [rpcUrl]);

  const [address, setAddress] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [txHash, setTxHash] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [totalPower, setTotalPower] = useState<bigint>(0n);

  const [depositAmount, setDepositAmount] = useState('50');
  const [propTo, setPropTo] = useState('');
  const [propAmt, setPropAmt] = useState('100');

  const simulateRead = useCallback(
    async <T,>(addOperation: () => xdr.Operation): Promise<T> => {
      if (!address) {
        throw new Error('Wallet not connected');
      }
      const account = await server.getAccount(address);
      const op = addOperation();
      const tx = new TransactionBuilder(account, { fee: '100000', networkPassphrase: Networks.TESTNET })
        .addOperation(op)
        .setTimeout(30)
        .build();
      const sim = await server.simulateTransaction(tx);
      if (Api.isSimulationError(sim)) {
        throw new Error(sim.error);
      }
      if (!Api.isSimulationSuccess(sim) || !sim.result) {
        throw new Error('Simulation did not return a result');
      }
      return scValToNative(sim.result.retval) as T;
    },
    [address, server],
  );

  const refreshOnChainState = useCallback(async () => {
    if (!address) return;
    setListLoading(true);
    setLoadError(null);
    try {
      const countNative = await simulateRead<unknown>(() => core.call('get_proposal_count'));
      const count =
        typeof countNative === 'number'
          ? countNative
          : typeof countNative === 'bigint'
            ? Number(countNative)
            : Number(countNative);
      if (!Number.isFinite(count) || count < 0) {
        throw new Error('Unexpected get_proposal_count response');
      }

      const tpNative = await simulateRead<unknown>(() => core.call('get_total_power'));
      setTotalPower(toBigIntSafe(tpNative));

      const rows: ProposalRow[] = [];
      for (let pid = 1; pid <= count; pid++) {
        const raw = await simulateRead<unknown>(() =>
          core.call('get_proposal', nativeToScVal(pid, { type: 'u32' })),
        );
        const row = parseProposalFromSimulation(raw);
        if (row) rows.push(row);
      }
      setProposals(rows);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLoadError(msg);
      setProposals([]);
      setTotalPower(0n);
    } finally {
      setListLoading(false);
    }
  }, [address, core, simulateRead]);

  useEffect(() => {
    void refreshOnChainState();
  }, [refreshOnChainState]);

  const handleError = (error: unknown) => {
    setStatus('error');
    console.error(error);
    setErrorMsg(error instanceof Error ? error.message : String(error));
  };

  const executeContractCall = async (method: string, args: xdr.ScVal[], onSuccess?: () => void) => {
    if (!address) return;
    setStatus('pending');
    setErrorMsg('');
    setTxHash('');

    try {
      const source = await server.getAccount(address);
      const tx = new TransactionBuilder(source, { fee: '100000', networkPassphrase: Networks.TESTNET })
        .addOperation(core.call(method, ...args))
        .setTimeout(30)
        .build();

      const prepared = await server.prepareTransaction(tx);
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(prepared.toXDR(), {
        networkPassphrase: Networks.TESTNET,
        address,
      });
      const signedTx = TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET);
      const sendResponse = await server.sendTransaction(signedTx);

      if (sendResponse.status === 'PENDING') {
        let getResponse = await server.getTransaction(sendResponse.hash);
        while (getResponse.status === Api.GetTransactionStatus.NOT_FOUND) {
          await new Promise((r) => setTimeout(r, 2000));
          getResponse = await server.getTransaction(sendResponse.hash);
        }

        if (getResponse.status === Api.GetTransactionStatus.SUCCESS) {
          setTxHash(sendResponse.hash);
          setStatus('success');
          onSuccess?.();
        } else {
          throw new Error('Transaction failed on-chain.');
        }
      } else {
        throw new Error('Submit failed');
      }
    } catch (e: unknown) {
      handleError(e);
    }
  };

  const handleDeposit = () => {
    const amt = parseFloat(depositAmount);
    if (!Number.isFinite(amt) || amt <= 0) return handleError(new Error('Invalid deposit amount'));
    const stroops = BigInt(Math.round(amt * Number(STROOPS_PER_XLM)));
    void executeContractCall(
      'deposit',
      [Address.fromString(address).toScVal(), nativeToScVal(stroops, { type: 'i128' })],
      () => void refreshOnChainState(),
    );
  };

  const handlePropose = () => {
    if (!propTo || !propAmt) return handleError(new Error('Fill all proposal fields'));
    const amt = parseFloat(propAmt);
    if (!Number.isFinite(amt) || amt <= 0) return handleError(new Error('Invalid proposal amount'));
    const stroops = BigInt(Math.round(amt * Number(STROOPS_PER_XLM)));
    void executeContractCall(
      'propose',
      [
        Address.fromString(address).toScVal(),
        Address.fromString(propTo).toScVal(),
        nativeToScVal(stroops, { type: 'i128' }),
      ],
      () => void refreshOnChainState(),
    );
  };

  const handleVote = (id: number) =>
    void executeContractCall(
      'vote',
      [Address.fromString(address).toScVal(), nativeToScVal(id, { type: 'u32' })],
      () => void refreshOnChainState(),
    );

  const handleExecute = (id: number) =>
    void executeContractCall('execute', [nativeToScVal(id, { type: 'u32' })], () =>
      void refreshOnChainState(),
    );

  const connectWallet = async () => {
    try {
      const { address: pub } = await StellarWalletsKit.authModal();
      setAddress(pub);
    } catch (e: unknown) {
      handleError(e);
    }
  };

  return (
    <div className="app-container">
      <header>
        <h1>
          <div className="logo">⛻</div> Soroban DAO Treasury
        </h1>
        {address ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span className="badge badge-success">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
            <button
              className="btn btn-outline"
              style={{ width: 'auto', padding: '8px 16px' }}
              onClick={() => setAddress('')}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={connectWallet}>
            <Wallet size={16} /> Connect
          </button>
        )}
      </header>

      {!address && (
        <div className="glass-card" style={{ textAlign: 'center', padding: '48px 0', opacity: 0.6 }}>
          <Wallet size={48} style={{ margin: '0 auto 16px' }} />
          <p>Connect your wallet to participate in DAO Governance.</p>
        </div>
      )}

      {address && (
        <div className="dashboard-grid">
          <div className="glass-card" style={{ padding: '24px' }}>
            <h2
              style={{ fontSize: '18px', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Banknote size={20} className="text-primary" /> Voting Power
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Deposit native XLM to the cross-contract Vault to gain voting multiplier power.
            </p>
            {listLoading ? null : (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                On-chain total power:{' '}
                <strong style={{ color: 'var(--text)' }}>{stroopsToXlmDisplay(totalPower)} XLM</strong>
              </p>
            )}
            <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Amount (XLM)</label>
            <input
              type="number"
              className="input-field"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
            />
            <button className="btn btn-primary" onClick={handleDeposit} disabled={status === 'pending'}>
              {status === 'pending' ? <Loader2 size={16} className="animate-spin" /> : 'Deposit to Vault'}
            </button>
          </div>

          <div className="glass-card" style={{ padding: '24px' }}>
            <h2
              style={{ fontSize: '18px', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Vote size={20} className="text-primary" /> Active Proposals
            </h2>

            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '24px', marginBottom: '24px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Beneficiary Recipient</label>
              <input
                type="text"
                className="input-field"
                placeholder="G..."
                value={propTo}
                onChange={(e) => setPropTo(e.target.value)}
              />

              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Amount (XLM)</label>
              <input
                type="number"
                className="input-field"
                placeholder="100"
                value={propAmt}
                onChange={(e) => setPropAmt(e.target.value)}
              />

              <button
                className="btn btn-outline"
                onClick={handlePropose}
                disabled={status === 'pending'}
                style={{ marginTop: '8px' }}
              >
                <Send size={16} /> Submit Proposal
              </button>
            </div>

            <h3 style={{ fontSize: '14px', margin: '0 0 16px' }}>Governance Queue</h3>
            {loadError && (
              <p style={{ fontSize: '13px', color: 'var(--danger)', marginBottom: '12px' }}>
                Could not load proposals: {loadError}. If you redeployed <code>dao_core</code>, set{' '}
                <code>VITE_DAO_CORE_CONTRACT_ID</code> in <code>.env</code> to the new contract ID.
              </p>
            )}
            {listLoading && (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={16} className="animate-spin" /> Loading on-chain proposals…
              </p>
            )}
            {!listLoading && !loadError && proposals.length === 0 && (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No proposals yet.</p>
            )}
            {!listLoading &&
              proposals.map((p) => {
                const denom = totalPower > 0n ? totalPower : 1n;
                const progress = Number((100n * p.votes) / denom);
                const canExecute =
                  !p.executed && totalPower > 0n && p.votes * 2n > totalPower;
                return (
                  <div key={p.id} className="proposal-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 600 }}>Proposal #{p.id}</span>
                      {p.executed ? (
                        <span className="badge" style={{ background: 'rgba(245,158,11,0.2)', color: 'var(--warning)' }}>
                          Executed
                        </span>
                      ) : (
                        <span className="badge badge-success">Active</span>
                      )}
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 4px' }}>
                      Request: {stroopsToXlmDisplay(p.amountStroops)} XLM → {shortAddr(p.to)}
                    </p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
                      Proposer: {shortAddr(p.proposer)} · Votes: {stroopsToXlmDisplay(p.votes)} power
                    </p>

                    <div
                      style={{
                        width: '100%',
                        height: '6px',
                        background: 'var(--bg-dark)',
                        borderRadius: '3px',
                        marginBottom: '16px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, progress)}%`,
                          height: '100%',
                          background: 'var(--primary)',
                          transition: 'width 0.5s',
                        }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleVote(p.id)}
                        disabled={p.executed || status === 'pending'}
                      >
                        Vote Yes
                      </button>
                      <button
                        className="btn btn-outline"
                        onClick={() => handleExecute(p.id)}
                        disabled={p.executed || !canExecute || status === 'pending'}
                      >
                        Execute
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {status !== 'idle' && (
        <div
          className="toast"
          style={{
            borderColor:
              status === 'error' ? 'var(--danger)' : status === 'success' ? 'var(--success)' : 'var(--primary)',
          }}
        >
          {status === 'pending' && (
            <Loader2 size={24} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
          )}
          {status === 'success' && <CheckCircle2 size={24} style={{ color: 'var(--success)' }} />}
          {status === 'error' && <AlertCircle size={24} style={{ color: 'var(--danger)' }} />}

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>
              {status === 'pending'
                ? 'Transaction Pending...'
                : status === 'success'
                  ? 'Transaction Successful!'
                  : 'Transaction Failed'}
            </span>
            {errorMsg && (
              <span style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px', maxWidth: '250px' }}>
                {errorMsg}
              </span>
            )}
            {txHash && status === 'success' && (
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: '12px', color: 'var(--primary)', textDecoration: 'none', marginTop: '4px' }}
              >
                View on Stellar Expert
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
