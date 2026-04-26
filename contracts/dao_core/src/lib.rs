#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol, IntoVal};
use soroban_sdk::token::Client as TokenClient;

#[contracttype]
pub enum DataKey {
    VaultAddress,
    TokenAddress,
    TotalPower,
    Power(Address),
    Proposal(u32),
    ProposalCount,
}

#[contracttype]
pub struct Proposal {
    pub id: u32,
    pub proposer: Address,
    pub to: Address,
    pub amount: i128,
    pub votes: i128,
    pub executed: bool,
}

#[contract]
pub struct DaoCoreContract;

#[contractimpl]
impl DaoCoreContract {
    pub fn init(env: Env, vault_address: Address, token_address: Address) {
        if env.storage().instance().has(&DataKey::VaultAddress) {
            panic!("Core is already initialized");
        }
        env.storage().instance().set(&DataKey::VaultAddress, &vault_address);
        env.storage().instance().set(&DataKey::TokenAddress, &token_address);
        env.storage().instance().set(&DataKey::TotalPower, &0i128);
        env.storage().instance().set(&DataKey::ProposalCount, &0u32);
    }

    pub fn deposit(env: Env, user: Address, amount: i128) {
        user.require_auth();

        let vault: Address = env.storage().instance().get(&DataKey::VaultAddress).unwrap();
        let token: Address = env.storage().instance().get(&DataKey::TokenAddress).unwrap();

        // Cross-contract call to the Token contract: Native Token -> Vault
        let token_client = TokenClient::new(&env, &token);
        token_client.transfer(&user, &vault, &amount);

        // Update user voting power
        let key = DataKey::Power(user.clone());
        let current_power: i128 = env.storage().instance().get(&key).unwrap_or(0);
        env.storage().instance().set(&key, &(current_power + amount));

        let total_power: i128 = env.storage().instance().get(&DataKey::TotalPower).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalPower, &(total_power + amount));
    }

    pub fn propose(env: Env, user: Address, to: Address, amount: i128) -> u32 {
        user.require_auth();
        
        let power: i128 = env.storage().instance().get(&DataKey::Power(user.clone())).unwrap_or(0);
        if power == 0 {
            panic!("Must have voting power to propose");
        }

        let mut count: u32 = env.storage().instance().get(&DataKey::ProposalCount).unwrap_or(0);
        count += 1;

        let proposal = Proposal {
            id: count,
            proposer: user,
            to,
            amount,
            votes: 0,
            executed: false,
        };

        env.storage().instance().set(&DataKey::Proposal(count), &proposal);
        env.storage().instance().set(&DataKey::ProposalCount, &count);

        count
    }

    pub fn vote(env: Env, user: Address, proposal_id: u32) {
        user.require_auth();

        let power: i128 = env.storage().instance().get(&DataKey::Power(user.clone())).unwrap_or(0);
        if power == 0 {
            panic!("No voting power");
        }

        let mut proposal: Proposal = env.storage().instance().get(&DataKey::Proposal(proposal_id)).unwrap_or_else(|| panic!("Proposal not found"));
        if proposal.executed {
            panic!("Already executed");
        }

        proposal.votes += power;
        env.storage().instance().set(&DataKey::Proposal(proposal_id), &proposal);
    }

    /// Returns how many proposals have been created (highest id).
    pub fn get_proposal_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::ProposalCount).unwrap_or(0)
    }

    /// Sum of all voting power deposited (denominator for majority checks in the UI).
    pub fn get_total_power(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalPower).unwrap_or(0)
    }

    /// Read a proposal by id, or `None` if it does not exist.
    pub fn get_proposal(env: Env, proposal_id: u32) -> Option<Proposal> {
        env.storage()
            .instance()
            .get(&DataKey::Proposal(proposal_id))
    }

    pub fn execute(env: Env, proposal_id: u32) {
        let mut proposal: Proposal = env.storage().instance().get(&DataKey::Proposal(proposal_id)).unwrap_or_else(|| panic!("Proposal not found"));
        if proposal.executed {
            panic!("Already executed");
        }

        let total_power: i128 = env.storage().instance().get(&DataKey::TotalPower).unwrap_or(0);
        
        // Require > 50% majority
        if proposal.votes <= total_power / 2 {
            panic!("Not enough votes");
        }

        proposal.executed = true;
        env.storage().instance().set(&DataKey::Proposal(proposal_id), &proposal);

        // INTER-CONTRACT CALL: Ask Vault to release funds!
        let vault: Address = env.storage().instance().get(&DataKey::VaultAddress).unwrap();
        let token: Address = env.storage().instance().get(&DataKey::TokenAddress).unwrap();

        env.invoke_contract::<()>(
            &vault,
            &Symbol::new(&env, "execute_payout"),
            soroban_sdk::vec![
                &env,
                token.into_val(&env),
                proposal.to.into_val(&env),
                proposal.amount.into_val(&env)
            ],
        );
    }
}

mod test;
