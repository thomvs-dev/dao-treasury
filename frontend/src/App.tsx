import React, { useState } from 'react';
import { StellarWalletsKit, WalletNetwork, allowAllModules } from '@creit.tech/stellar-wallets-kit';
import { SorobanRpc, TransactionBuilder, Networks, xdr, Address, nativeToScVal } from '@stellar/stellar-sdk';
import { Wallet, CheckCircle2, AlertCircle, Loader2, Vote, Send, Banknote } from 'lucide-react';

const DAO_CORE_ID = 'CBIMHITPYBLX25DFSOR3WGWEIPOCJNNM67DIWAXZQOJAQNLLOGJSE72X';
const NATIVE_XLM = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const RPC_URL = 'https://soroban-testnet.stellar.org';

const kit = new StellarWalletsKit({
  network: WalletNetwork.TESTNET,
  selectedWalletId: 'freighter',
  modules: allowAllModules(),
});

function App() {
  const [address, setAddress] = useState<string>('');
  const [status, setStatus] = useState<'idle'|'pending'|'success'|'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [txHash, setTxHash] = useState('');

  // UI State
  const [depositAmount, setDepositAmount] = useState('50');
  const [propTo, setPropTo] = useState('');
  const [propAmt, setPropAmt] = useState('100');
  const [voteId, setVoteId] = useState('1');

  // Hardcoded mock proposals demonstrating UI (real deployment would track state via events or indexer)
  const proposals = [
    { id: 1, to: 'GDZZ...', amount: 100, votes: 600, totalPower: 1000, executed: false },
    { id: 2, to: 'GBXX...', amount: 50, votes: 550, totalPower: 1000, executed: true },
  ];

  const connectWallet = async () => {
    try {
      await kit.openModal({
        onWalletSelected: async (option) => {
          kit.setWallet(option.id);
          const pubKey = await kit.getPublicKey();
          setAddress(pubKey);
        }
      });
    } catch (e: any) { handleError(e); }
  };

  const handleError = (error: any) => {
    setStatus('error');
    console.error(error);
    setErrorMsg(error?.message || 'Unknown error');
  };

  const executeContractCall = async (method: string, args: xdr.ScVal[]) => {
    if (!address) return;
    setStatus('pending');
    setErrorMsg('');
    setTxHash('');

    try {
      const server = new SorobanRpc.Server(RPC_URL);
      const source = await server.getAccount(address);
      
      const tx = new TransactionBuilder(source, { fee: '100000', networkPassphrase: Networks.TESTNET })
      .addOperation(
        xdr.Operation.invokeHostFunction({
          hostFunction: xdr.HostFunction.hostFunctionTypeInvokeContract(
            new xdr.InvokeContractArgs({
              contractAddress: Address.fromString(DAO_CORE_ID).toScAddress(),
              functionName: method,
              args,
            })
          ),
          auth: []
        })
      ).setTimeout(30).build();

      const signedXdr = await kit.signTransaction(await (await server.prepareTransaction(tx)).toXDR());
      const signedTx = TransactionBuilder.fromXDR(signedXdr.signedTxXdr, Networks.TESTNET);
      const sendResponse = await server.sendTransaction(signedTx);
      
      if (sendResponse.status === 'PENDING') {
        let getResponse = await server.getTransaction(sendResponse.hash);
        while (getResponse.status === 'NOT_FOUND' || getResponse.status === 'PENDING') {
          await new Promise(r => setTimeout(r, 2000));
          getResponse = await server.getTransaction(sendResponse.hash);
        }
        
        if (getResponse.status === 'SUCCESS') {
          setTxHash(sendResponse.hash);
          setStatus('success');
        } else {
          throw new Error('Transaction failed on-chain.');
        }
      } else {
        throw new Error(sendResponse.errorResult?.toString() || 'Submit failed');
      }
    } catch (e: any) { handleError(e); }
  };

  const handleDeposit = () => executeContractCall('deposit', [Address.fromString(address).toScVal(), nativeToScVal(Number(depositAmount)*10000000, {type: 'i128'})]);
  const handlePropose = () => {
    if(!propTo || !propAmt) return handleError(new Error("Fill all proposal fields"));
    executeContractCall('propose', [Address.fromString(address).toScVal(), Address.fromString(propTo).toScVal(), nativeToScVal(Number(propAmt)*10000000, {type: 'i128'})]);
  };
  const handleVote = (id: number) => executeContractCall('vote', [Address.fromString(address).toScVal(), nativeToScVal(id, {type: 'u32'})]);
  const handleExecute = (id: number) => executeContractCall('execute', [nativeToScVal(id, {type: 'u32'})]);

  return (
    <div className="app-container">
      <header>
        <h1><div className="logo">⛻</div> Soroban DAO Treasury</h1>
        {address ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span className="badge badge-success">{address.slice(0,6)}...{address.slice(-4)}</span>
            <button className="btn btn-outline" style={{width: 'auto', padding: '8px 16px'}} onClick={() => setAddress('')}>Disconnect</button>
          </div>
        ) : (
          <button className="btn btn-primary" style={{width: 'auto'}} onClick={connectWallet}><Wallet size={16} /> Connect</button>
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
        {/* Left Column: Power Management */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '18px', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Banknote size={20} className="text-primary"/> Voting Power
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>Deposit native XLM to the cross-contract Vault to gain voting multiplier power.</p>
          <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Amount (XLM)</label>
          <input type="number" className="input-field" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
          <button className="btn btn-primary" onClick={handleDeposit} disabled={status === 'pending'}>
            {status === 'pending' ? <Loader2 size={16} className="animate-spin" /> : 'Deposit to Vault'}
          </button>
        </div>

        {/* Right Column: Proposals */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '18px', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
             <Vote size={20} className="text-primary"/> Active Proposals
          </h2>
          
          <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '24px', marginBottom: '24px' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Beneficiary Recipient</label>
            <input type="text" className="input-field" placeholder="G..." value={propTo} onChange={(e) => setPropTo(e.target.value)} />
            
            <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Amount (XLM)</label>
            <input type="number" className="input-field" placeholder="100" value={propAmt} onChange={(e) => setPropAmt(e.target.value)} />
            
            <button className="btn btn-outline" onClick={handlePropose} disabled={status === 'pending'} style={{ marginTop: '8px' }}>
              <Send size={16}/> Submit Proposal
            </button>
          </div>

          <h3 style={{ fontSize: '14px', margin: '0 0 16px' }}>Governance Queue</h3>
          {proposals.map(p => {
             const progress = (p.votes / p.totalPower) * 100;
             return (
              <div key={p.id} className="proposal-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 600 }}>Proposal #{p.id}</span>
                  {p.executed ? <span className="badge" style={{ background: 'rgba(245,158,11,0.2)', color: 'var(--warning)' }}>Executed</span> 
                              : <span className="badge badge-success">Active</span>}
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 12px' }}>Request: {p.amount} XLM → {p.to}</p>
                
                <div style={{ width: '100%', height: '6px', background: 'var(--bg-dark)', borderRadius: '3px', marginBottom: '16px', overflow: 'hidden' }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.5s' }} />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button className="btn btn-primary" onClick={() => handleVote(p.id)} disabled={p.executed || status === 'pending'}>Vote Yes</button>
                  <button className="btn btn-outline" onClick={() => handleExecute(p.id)} disabled={p.executed || progress <= 50 || status === 'pending'}>Execute</button>
                </div>
              </div>
             )
          })}
        </div>
      </div>
      )}

      {status !== 'idle' && (
        <div className="toast" style={{ borderColor: status === 'error' ? 'var(--danger)' : status === 'success' ? 'var(--success)' : 'var(--primary)' }}>
          {status === 'pending' && <Loader2 size={24} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />}
          {status === 'success' && <CheckCircle2 size={24} style={{ color: 'var(--success)' }} />}
          {status === 'error' && <AlertCircle size={24} style={{ color: 'var(--danger)' }} />}
          
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 600, fontSize: '14px' }}>
              {status === 'pending' ? 'Transaction Pending...' : status === 'success' ? 'Transaction Successful!' : 'Transaction Failed'}
            </span>
            {errorMsg && <span style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '4px', maxWidth: '250px' }}>{errorMsg}</span>}
            {txHash && status === 'success' && (
              <a href={`https://stellar.expert/explorer/testnet/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: 'var(--primary)', textDecoration: 'none', marginTop: '4px' }}>
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
