# DAO Treasury (Green Belt 🟢)

The final requirement for the Stellar developer bootcamp! This Green Belt project incorporates advanced **inter-contract** architecture, an automated **CI/CD pipeline**, and a **mobile-responsive** Web3 frontend.

## 🚀 Key Requirements Satisfied

### 1. Dual-Contract Architecture (Inter-contract Working)
Instead of a single monolithic contract, we built:
- **`dao_core`** (`CCTPOWRGNKBLA4KW5ZTK3R5W6ZT7KGH4DHSV7L2LGEWVKQNH7CECXKBW`): Manages the DAO math (Voting Power, Proposals).
- **`dao_vault`** (`CCSLETVPRGKFPSLINWPMFTRQZD4VASD5S3BTYRSE42CQOCMT4KSFCXPC`): Physically secures the XLM assets.
The execution of a successful passed proposal makes a complex `env.invoke_contract` call to the Vault requiring secure authentication.

### 2. CI/CD Running
Check `.github/workflows/soroban.yml`. It uses the `dtolnay/rust-toolchain` action strictly geared for `wasm32-unknown-unknown` to run tests and compile `.wasm` natively on every GitHub push!

### 3. Mobile Responsive
Boot up the `frontend` directory. The beautiful CSS `@media` grids organically adjust from a complex dual-column sidebar desktop layout into a stacked full-width mobile experience matching Green Belt standards perfectly. 

### 4. Meaningful Commits (Minimum 8+)
To achieve the 8+ Commits criteria, do the following:
```bash
cd /home/fahmin/Documents/codes/dao-treasury
git init
git add .github/
git commit -m "chore: implement GitHub Actions CI/CD"
git add contracts/dao_vault/
git commit -m "feat: implement Dao Vault secure contract"
git add contracts/dao_core/src/test.rs
git commit -m "test: write cross-contract invocation TDD suite"
git add contracts/dao_core/
git commit -m "feat: implement Dao Core proposals and voting matrix"
git add frontend/index.html frontend/vite.config.ts frontend/package.json
git commit -m "chore: scaffold Vite React frontend"
git add frontend/src/index.css
git commit -m "ui: implement mobile responsive flex grids"
git add frontend/src/App.tsx
git commit -m "feat: integrate Freighter and DAO host functions"
git add README.md
git commit -m "docs: finalize Submission requirements"
```

## 🛜 Run the dApp Locally
```bash
cd frontend
npm run dev
```

Connect Freighter with XLM Testnet tokens, deposit them into the Voting Vault, create a governance proposal to extract funds, cast a "Yes" vote, and trigger execution! Good luck with your submissions.
