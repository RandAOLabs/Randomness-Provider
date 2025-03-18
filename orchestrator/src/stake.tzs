import { ProviderDetails, ProviderStakingClient, StakingClientConfig  } from "ao-process-clients";

// Random Client Configuration
// async function getStakingClient(): Promise<ProviderStakingClient>{
//     let test = await getProviderStakingClientAutoConfiguration()
// test.wallet = JSON.parse(process.env.WALLET_JSON!)
// const randclient = new ProviderStakingClient(test)
//     return randclient
// }

async function getStakingClient(): Promise<ProviderStakingClient>{
//     let test = await getProviderStakingClientAutoConfiguration()
// test.wallet = JSON.parse(process.env.WALLET_JSON!)
const RANDOM_CONFIG: StakingClientConfig = {
    wallet: JSON.parse(process.env.WALLET_JSON!),
    tokenProcessId: '5ZR9uegKoEhE9fJMbs-MvWLIztMNCVxgpzfeBVE3vqI',
    processId: 'EIQJoqVWonlxsEe8xGpQZhh54wrmgE3q0tAsVIhKYQU'
}
const randclient = new ProviderStakingClient(RANDOM_CONFIG)
    return randclient
}


// Function to clear all output requests
async function stake() {
    try {
        let providerDetails: ProviderDetails = {    /** Provider name */
            name: "test",
            /** Commission percentage (1-100) */
            commission: 50,
            /** Provider description */
            description: "this is a test description",
            /** Optional Twitter handle */
            twitter: "test_twitter",
            /** Optional Discord handle */
            discord: "test_discord",
            /** Optional Telegram handle */
            telegram: "test_tg"};
        console.log(await (await getStakingClient()).stakeWithDetails("100000000000000000000",providerDetails))
    } catch (error) {
        console.error("An error occurred while staking:", error);
    } finally {

        console.log("Done.");
    }
}

// Run the function when the script is executed
(async () => {
    await stake();
})();
