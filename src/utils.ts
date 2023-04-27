import {
    Finding,
    TransactionEvent,
    FindingSeverity,
    FindingType,
    ethers,
    getEthersProvider,
    Label,
    EntityType
} from "forta-agent";

import { findMostCommonRecipient } from "./db";

function isValidCharRatio(str: string) {
    const totalChars = str.length;
    const validChars = str.match(/[a-zA-Z0-9\s]/g);
    const words = str.trim().split(/\s+/);

    if (words.length < 2) {
        return false;
    }

    if (validChars) {
        const validCharRatio = validChars.length / totalChars;
        return validCharRatio > 0.7;
    }

    return false;
}


export function containsWords(txEvent: TransactionEvent): { isValid: boolean; text: string } {
    const inputData = txEvent.transaction.data || "";
    try {
        const decodedData = Buffer.from(inputData.slice(2), 'hex').toString('utf8');

        const stop_symbol = ['�', '%', '}', '{', '>', '<', '|', '[', '^', ')', 'Ҿ', '⻱', '΢',
            '', 'Ĭ', '', '', '', '', 'ҁ', '', '', '', '', '޺', '', '', '�',
            '', '', '', '', '', '', '§', 'ҿ', 'ҽ', 'Ҽ', 'һ', 'Һ', 'ҹ', 'Ҹ', 'ү', 'ï', '½', '¿'];

        // Check for null characters
        if (!isValidCharRatio(decodedData) || decodedData.includes('\0') || stop_symbol.some(e => {
            decodedData.includes(e)
        }
        )) {
            return { isValid: false, text: "" };
        }
        const wordRegex = /[a-zA-Z]+/g;
        const wordMatches = decodedData.match(wordRegex) || [];

        // Check if the number of words is greater than or equal to 2
        if (wordMatches.length >= 2) {
            return { isValid: true, text: decodedData };
        } else {
            return { isValid: false, text: "" };
        }
    } catch (error) {
        console.log('Error decoding input data:', txEvent.hash);
        return { isValid: false, text: "" };
    }
}

export function logs(txEvent: TransactionEvent, state: boolean, msg: string) {
    if (state) {
        console.log(
            `[Success] ${msg}`
        )
    } else (
        console.log(
            `[Error] ${msg}, tx: ${txEvent.hash}`
        )
    )
}

export async function getAddressType(address: string, provider: ethers.providers.Provider): Promise<'EOA' | 'CONTRACT'> {
    const code = await provider.getCode(address);
    if (code === '0x') {
        return 'EOA';
    } else {
        return 'CONTRACT';
    }
}

async function getAddressName(provider: ethers.providers.Provider, address: string): Promise<string> {
    const name = await provider.lookupAddress(address);
    return name || "";
}



async function getContractCreation(contractAddress: string): Promise<string> {
    const baseUrl = "https://api.etherscan.io/api";

    const queryParams = new URLSearchParams({
        module: "contract",
        action: "getcontractcreation",
        contractaddresses: contractAddress,
        apikey: 'CYZ7EYXTR5H5Z7R5J17UAEIEFCPUJVN4KC',
    });

    const url = `${baseUrl}?${queryParams.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Error fetching data: ${response.statusText}`);
    }

    const data = await response.json();
    const contractCreator = data.result[0].contractCreator;
    return contractCreator;
}

type ScamAlertType = 'EOA' | 'CONTRACT' | 'NEW_NOTIFIER';

export async function createScamNotifierAlert(
    alertType: ScamAlertType,
    txEvent: TransactionEvent,
    similarNotifiers?: { sharingAddress: string; sharedRecipients: string[] },
): Promise<Finding> {
    let description: string;
    let severity: FindingSeverity;
    let type: FindingType;
    let alertId: string;
    const provider: ethers.providers.JsonRpcProvider = getEthersProvider();
    const metadata: { [key: string]: string } = {};
    const scammerEoa = txEvent.to!;
    const scammerContract = scammerEoa;
    const notifierEoa = txEvent.from;
    const notifierName = await getAddressName(provider, notifierEoa);
    const chainId = (await provider.getNetwork()).chainId;
    const addresses = Object.keys(txEvent.addresses);
    const labels: Label[] = [];


    switch (alertType) {
        case 'EOA':
            description = `${scammerEoa} was flagged as a scam by ${notifierEoa} ${notifierName}`;
            severity = FindingSeverity.High;
            type = FindingType.Suspicious;
            alertId = 'SCAM-NOTIFIER-EOA';
            metadata.scammer_eoa = scammerEoa;
            //metadata.scammer_contracts = scammerContracts ? scammerContracts.join(', ') : '';
            metadata.notifier_eoa = notifierEoa;
            metadata.notifier_name = notifierName;
            labels.push(Label.fromObject({
                entityType: EntityType.Address,
                entity: notifierEoa,
                label: 'notifier_EOA',
                confidence: 0.8,
                remove: false,
                metadata: {
                    "ENS_NAME": notifierName
                }
            }))
            labels.push(Label.fromObject({
                entityType: EntityType.Address,
                entity: scammerEoa,
                label: 'scammer_EOA',
                confidence: 0.8,
                remove: false,
                metadata: {}
            }))
            break;
        case 'CONTRACT':
            description = `${scammerContract} was flagged as a scam by ${notifierEoa} ${notifierName}`;
            severity = FindingSeverity.High;
            type = FindingType.Suspicious;
            alertId = 'SCAM-NOTIFIER-CONTRACT';
            metadata.scammer_contract = scammerContract;
            const scammer_eoa = await getContractCreation(scammerContract);
            metadata.scammer_eoa = scammer_eoa || 'Error finding deployer';
            metadata.notifier_eoa = notifierEoa;
            metadata.notifier_name = notifierName;
            labels.push(Label.fromObject({
                entityType: EntityType.Address,
                entity: scammerEoa,
                label: 'notifier_EOA',
                confidence: 0.8,
                remove: false,
                metadata: {
                    "ENS_NAME": notifierName
                }
            }))
            labels.push(Label.fromObject({
                entityType: EntityType.Address,
                entity: scammerEoa,
                label: 'scammer_Contract',
                confidence: 0.8,
                remove: false,
            }))
            break;
        case 'NEW_NOTIFIER':
            description = `New scam notifier identified ${notifierEoa} ${notifierName}`;
            severity = FindingSeverity.Info;
            type = FindingType.Info;
            alertId = 'NEW-SCAM-NOTIFIER';
            metadata.similar_notifier_eoa = similarNotifiers?.sharingAddress || 'err';
            const similar_notifier_name = chainId == 1 ? await getContractCreation(metadata.similar_notifier_eoa) : "Not available";
            metadata.similar_notifier_name = similar_notifier_name || 'Error finding similar_notifier_name';
            metadata.union_flagged = similarNotifiers?.sharedRecipients?.length ? similarNotifiers.sharedRecipients.join(', ') : '';
            metadata.notifierName = notifierName;
            labels.push(Label.fromObject({
                entityType: EntityType.Address,
                entity: scammerEoa,
                label: 'new_notifier_EOA',
                confidence: 0.8,
                remove: false,
                metadata: {
                    "ENS_NAME": notifierName
                }
            }))
            break;
    }

    return Finding.fromObject({
        name: 'Scam Notifier Alert',
        description,
        alertId,
        severity,
        type,
        metadata,
        addresses,
        labels
    });
}