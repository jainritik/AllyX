// Keep the verified mailbox while ensuring customers see the product name.
export function allyxEmailSender(configuredAddress: string) {
    const address = configuredAddress.match(/<([^<>]+)>/)?.[1] || configuredAddress.trim();
    return { name: "ALLYX", address: address.trim() };
}
