# DAO Treasury frontend

Vite + React + TypeScript client for the Soroban `dao_core` contract. It loads **real proposal state** from the network using read-only simulations (`get_proposal_count`, `get_total_power`, `get_proposal`) and submits transactions through the Stellar Wallets Kit.

## Configuration

Copy `.env.example` to `.env` and adjust:

- **`VITE_DAO_CORE_CONTRACT_ID`** — `dao_core` contract address (C…) that matches the Wasm you deployed (must include the view functions used by this app).
- **`VITE_SOROBAN_RPC_URL`** — Soroban RPC URL (default: Stellar testnet public RPC).

If simulations fail with “function not found” or similar, redeploy `dao_core` with the current contract sources and update the env var.

## Scripts

```bash
npm ci          # install (use package-lock.json in CI)
npm run dev     # dev server
npm run build   # production build
npm run lint    # eslint
npm run preview # preview production build
```

## Wallet

The app initializes [`@creit.tech/stellar-wallets-kit`](https://github.com/Creit-Tech/Stellar-Wallets-Kit) with `defaultModules()` and uses `authModal()` for connect and `signTransaction()` for submits. Use **Stellar testnet** and a funded account.
