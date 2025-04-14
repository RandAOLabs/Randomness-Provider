import { connect, createDataItemSigner } from "@permaweb/aoconnect";

const { spawn, message, result } = connect({
  MU_URL: "https://ur-mu.randao.net",
  CU_URL: "https://ur-cu.randao.net",
  MODE: "legacy"
});
const TOKEN_PROCESS = "kUnKIPp7XS4pBsy1qy7j3S-JJ0ChZ4utbZ-IPxhw_W0"
const RAND_PROCESS = "UujLOtCfyo3uoKfuozS7cQfTe11BdvWR3Slb65zrR7k"
export async function fetchMessageResult(
    messageID: string,
    processID: string
): Promise<{ Messages: any[]; Spawns: any[]; Output: any[]; Error: any }> {
    try {
        const response = await result({
            message: messageID,
            process: processID,
        });

        return {
            Messages: response.Messages || [],
            Spawns: response.Spawns || [],
            Output: response.Output || [],
            Error: response.Error || null
        };
    } catch (error: any) {
        if (error instanceof SyntaxError && error.message.includes("Unexpected token '<'")) {
            console.error("CU timeout ratelimit error");
            await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 60 seconds
        } else {
            console.error("Error fetching message result:", error);
        }

        return { Messages: [], Spawns: [], Output: [], Error: error };
    }
}
export async function TransferToProviders(providerIds: string[], callbackID:string) {
    try {
        const sentMessage = await message({
            process: TOKEN_PROCESS,
            tags: [
                { name: "Action", value: "Transfer" },
                { name: "library", value: "npm install ao-process-clients" },
                { name: "Quantity", value: "100" },
                { name: "Recipient", value: RAND_PROCESS },
                { name: "X-CallbackId", value: callbackID },
                { name: "X-Providers", value: JSON.stringify({ provider_ids: providerIds }) },
                { name: "X-RequestedInputs", value: JSON.stringify({ requested_inputs: providerIds.length }) },
            ],
            signer: createDataItemSigner(JSON.parse(process.env.REQUEST_WALLET_JSON!)),
            data: "",
        });

        const result = await fetchMessageResult(sentMessage,TOKEN_PROCESS);
        return result;
    } catch (error) {
        console.error("Transfer message failed:", error);
        throw error;
    }
}