/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DAO_CORE_CONTRACT_ID?: string;
  readonly VITE_SOROBAN_RPC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
