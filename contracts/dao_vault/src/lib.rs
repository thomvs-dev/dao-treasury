#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};
use soroban_sdk::token::Client as TokenClient;

#[contracttype]
pub enum DataKey {
    CoreAddress,
}

#[contract]
pub struct DaoVaultContract;

#[contractimpl]
impl DaoVaultContract {
    pub fn init(env: Env, core_address: Address) {
        if env.storage().instance().has(&DataKey::CoreAddress) {
            panic!("Vault is already initialized");
        }
        env.storage().instance().set(&DataKey::CoreAddress, &core_address);
    }

    pub fn execute_payout(env: Env, token: Address, to: Address, amount: i128) {
        let core_addr: Address = env.storage().instance().get(&DataKey::CoreAddress).unwrap_or_else(|| panic!("Vault not initialized"));
        
        // This validates that the inter-contract call is originating entirely from the core contract logic
        core_addr.require_auth();

        let token_client = TokenClient::new(&env, &token);
        
        // Fails safely if vault lacks funding
        token_client.transfer(&env.current_contract_address(), &to, &amount);
    }
}
