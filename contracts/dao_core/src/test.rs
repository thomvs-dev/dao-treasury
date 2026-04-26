#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol, IntoVal};
use soroban_sdk::token::Client as TokenClient;
use soroban_dao_vault::DaoVaultContract;

fn setup_test() -> (Env, Address, Address, TokenClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    
    // Register Vault Contract
    let vault_id = env.register(DaoVaultContract, ());

    // Setup Token
    let admin = Address::generate(&env);
    let token_address = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let token = TokenClient::new(&env, &token_address);
    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token_address);

    // Register Core Contract
    let core_id = env.register(DaoCoreContract, ());

    // Init components
    env.invoke_contract::<()>(&vault_id, &Symbol::new(&env, "init"), soroban_sdk::vec![&env, core_id.to_val()]);
    env.invoke_contract::<()>(&core_id, &Symbol::new(&env, "init"), soroban_sdk::vec![&env, vault_id.to_val(), token.address.to_val()]);

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    token_admin.mint(&user1, &1000);
    token_admin.mint(&user2, &1000);

    (env, core_id, vault_id, token, user1, user2)
}

#[test]
fn test_dao_inter_contract_flow() {
    let (env, core_id, vault_id, token, user1, user2) = setup_test();

    // 1. User1 deposits 600 XLM into Core DAO effectively giving power.
    env.invoke_contract::<()>(&core_id, &Symbol::new(&env, "deposit"), soroban_sdk::vec![&env, user1.to_val(), 600_i128.into_val(&env)]);

    // Vault should have 600 XLM
    assert_eq!(token.balance(&vault_id), 600);
    assert_eq!(token.balance(&user1), 400);

    // 2. User2 submits a proposal to get 500 XLM (doesn't have power yet!)
    // Oh wait, user2 must have voting power to propose. So User2 deposits 50 XLM.
    env.invoke_contract::<()>(&core_id, &Symbol::new(&env, "deposit"), soroban_sdk::vec![&env, user2.to_val(), 50_i128.into_val(&env)]);

    let proposal_id: u32 = env.invoke_contract(&core_id, &Symbol::new(&env, "propose"), soroban_sdk::vec![&env, user2.to_val(), user2.to_val(), 500_i128.into_val(&env)]);
    assert_eq!(proposal_id, 1);

    // 3. User1 votes YES with their massive 600 voting power
    env.invoke_contract::<()>(&core_id, &Symbol::new(&env, "vote"), soroban_sdk::vec![&env, user1.to_val(), proposal_id.into_val(&env)]);

    // 4. Execute the proposal (Anyone can execute once consensus is reached)
    env.invoke_contract::<()>(&core_id, &Symbol::new(&env, "execute"), soroban_sdk::vec![&env, proposal_id.into_val(&env)]);

    // 5. Verify the inter-contract call worked! User2 should receive 500 XLM from Vault safely!
    assert_eq!(token.balance(&vault_id), 150); // 650 total deposit - 500
    assert_eq!(token.balance(&user2), 1450); // started with 1000, deposited 50, received 500.
}

#[test]
fn test_view_functions_track_state() {
    let (env, core_id, _vault_id, _token, user1, user2) = setup_test();

    let zero: u32 = env.invoke_contract(&core_id, &Symbol::new(&env, "get_proposal_count"), soroban_sdk::vec![&env]);
    assert_eq!(zero, 0);
    let tp0: i128 = env.invoke_contract(&core_id, &Symbol::new(&env, "get_total_power"), soroban_sdk::vec![&env]);
    assert_eq!(tp0, 0);

    env.invoke_contract::<()>(&core_id, &Symbol::new(&env, "deposit"), soroban_sdk::vec![&env, user1.to_val(), 100_i128.into_val(&env)]);

    let tp1: i128 = env.invoke_contract(&core_id, &Symbol::new(&env, "get_total_power"), soroban_sdk::vec![&env]);
    assert_eq!(tp1, 100);

    let pid: u32 = env.invoke_contract(&core_id, &Symbol::new(&env, "propose"), soroban_sdk::vec![&env, user1.to_val(), user2.to_val(), 10_i128.into_val(&env)]);
    assert_eq!(pid, 1);

    let count: u32 = env.invoke_contract(&core_id, &Symbol::new(&env, "get_proposal_count"), soroban_sdk::vec![&env]);
    assert_eq!(count, 1);

    let proposal: Option<Proposal> = env.invoke_contract(
        &core_id,
        &Symbol::new(&env, "get_proposal"),
        soroban_sdk::vec![&env, 1_u32.into_val(&env)],
    );
    let p = proposal.expect("proposal 1");
    assert_eq!(p.id, 1);
    assert_eq!(p.proposer, user1);
    assert_eq!(p.to, user2);
    assert_eq!(p.amount, 10);
    assert_eq!(p.votes, 0);
    assert!(!p.executed);

    let missing: Option<Proposal> = env.invoke_contract(
        &core_id,
        &Symbol::new(&env, "get_proposal"),
        soroban_sdk::vec![&env, 99_u32.into_val(&env)],
    );
    assert!(missing.is_none());
}
