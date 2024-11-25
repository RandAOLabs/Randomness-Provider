import { IRandomClient, RandomClient } from "ao-process-clients";

const PROVIDER_ID = process.env.PROVIDER_ID || "0";

async function main() {
    try {
        const randclient: IRandomClient = RandomClient.autoConfiguration();

        console.log("Testing `createRequest`...");
        const createRequestResult = await randclient.createRequest(["provider1", "provider2"]);
        console.log("createRequest result:", createRequestResult);

        console.log("Testing `getOpenRandomRequests`...");
        const openRequests = await randclient.getOpenRandomRequests(PROVIDER_ID);
        console.log("getOpenRandomRequests result:", openRequests);

        console.log("Testing `getProviderAvailableValues`...");
        const availableValues = await randclient.getProviderAvailableValues(PROVIDER_ID);
        console.log("getProviderAvailableValues result:", availableValues);

        console.log("Testing `getRandomRequests`...");
        const randomRequests = await randclient.getRandomRequests(["request1", "request2"]);
        console.log("getRandomRequests result:", randomRequests);

        console.log("Testing `postVDFChallenge`...");
        const postVDFChallengeResult = await randclient.postVDFChallenge(
            "request1",
            "modulus_value",
            "input_value"
        );
        console.log("postVDFChallenge result:", postVDFChallengeResult);

        console.log("Testing `postVDFOutputAndProof`...");
        const postVDFOutputAndProofResult = await randclient.postVDFOutputAndProof(
            "request1",
            "output_value",
            "proof_value"
        );
        console.log("postVDFOutputAndProof result:", postVDFOutputAndProofResult);

        console.log("Testing `updateProviderAvailableValues`...");
        const updateAvailableValuesResult = await randclient.updateProviderAvailableValues(42);
        console.log("updateProviderAvailableValues result:", updateAvailableValuesResult);

    } catch (error) {
        console.error("An error occurred during testing:", error);
    }
}

// Call the main function
main();
