# DAO Treasury (Green Belt 🟢)

The final requirement for the Stellar developer bootcamp! This Green Belt project incorporates advanced **inter-contract** architecture, an automated **CI/CD pipeline**, and a **mobile-responsive** Web3 frontend.

## Key requirements satisfied

### 1. Dual-contract architecture (inter-contract)

Instead of a single monolithic contract, we built:

- **`dao_core`** (`CCTPOWRGNKBLA4KW5ZTK3R5W6ZT7KGH4DHSV7L2LGEWVKQNH7CECXKBW` in an older deployment): Manages the DAO math (voting power, proposals) and exposes **read-only view functions** (`get_proposal_count`, `get_total_power`, `get_proposal`) for the frontend to load real on-chain state via Soroban simulation.
- **`dao_vault`** (`CCSLETVPRGKFPSLINWPMFTRQZD4VASD5S3BTYRSE42CQOCMT4KSFCXPC`): Holds native XLM. A successful proposal triggers a cross-contract `execute_payout` with vault-side authentication.

After you change `dao_core` (for example to add or adjust view functions), **redeploy the Wasm**, run `init` against your vault and token as before, and point the frontend at the new contract ID using environment variables (see below).

### 2. CI/CD

GitHub Actions workflow: [`.github/workflows/soroban.yml`](.github/workflows/soroban.yml).

- **contracts**: `cargo test` for `dao_vault` and `dao_core`, plus `wasm32-unknown-unknown` release builds.
- **frontend**: `npm ci`, `npm run lint`, and `npm run build` in `frontend/`.

Runs on push and pull requests to `main` / `master`.

### 3. Mobile responsive UI

From the `frontend` directory, run the Vite app. Layout uses responsive CSS so the dashboard stacks cleanly on small viewports.

### 4. Frontend and on-chain data

The React app uses `@stellar/stellar-sdk` **`Contract.call`** for invocations (instead of hand-built host-function XDR). **Read-only** methods use `simulateTransaction`; **writes** use `prepareTransaction` → Stellar Wallets Kit sign → `sendTransaction`.

Configure the deployment (see [`frontend/.env.example`](frontend/.env.example)):

| Variable | Purpose |
|----------|---------|
| `VITE_DAO_CORE_CONTRACT_ID` | `dao_core` contract id (C… StrKey) after deploy |
| `VITE_SOROBAN_RPC_URL` | Soroban RPC HTTP endpoint (defaults to public testnet RPC) |

## Run the dApp locally

```bash
cd frontend
cp .env.example .env   # optional: set contract id after redeploy
npm ci
npm run dev
```

Connect a wallet (testnet XLM), deposit to gain voting power, create proposals, vote, and execute when support exceeds 50% of total power. See [`frontend/README.md`](frontend/README.md) for more detail.

## Historical note: meaningful commits (8+)

Bootcamp scaffolding sometimes used a scripted sequence of commits; use your own workflow for future changes.
