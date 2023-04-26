import {
  BlockEvent,
  Finding,
  Initialize,
  HandleBlock,
  HandleTransaction,
  HandleAlert,
  AlertEvent,
  TransactionEvent,
  FindingSeverity,
  FindingType,
  ethers,
  getEthersProvider
} from "forta-agent";


// import createDriver from db.ts
import { createDriver, storeTransactionData, numberOfRecipients, recipientExists, setAddressTypeToNotifier, checkNotifier, sharedReportsCount, findMostCommonRecipient } from "./db";
import { containsWords, logs, getAddressType, createScamNotifierAlert } from "./utils";
import { Driver, Result, auth, driver as createDriverInstance } from "neo4j-driver";
import dotenv from 'dotenv';

let neo4jDriver: Driver;

dotenv.config();
const DB_URL = process.env.DB_URL || '';
const DB_USER = process.env.DB_USER || '';
const DB_PASSWORD = process.env.DB_PASSWORD || '';

/*
SCAM NOTIFIER BOT
*/

const handleTransaction: HandleTransaction = async (
  txEvent: TransactionEvent
) => {
  const findings: Finding[] = [];
  //console.log("txEvent", txEvent);
  const provider: ethers.providers.JsonRpcProvider = getEthersProvider();
  console.log("check tx: ", txEvent.hash);

  if (!txEvent.to || !txEvent.transaction.data) {
    return findings;
  }

  try {

    // Check if the transaction has a valid message
    const decodedData = containsWords(txEvent);
    //console.log("isNotifier", isNotifier, txEvent.from.toLowerCase());

    if (decodedData.isValid && decodedData.text) {
      console.log(decodedData);
      // Get the type and of the recipient address
      const recipientAddressType = await getAddressType(txEvent.to, provider);

      // Check if the sender is a notifier
      const isNotifier = await checkNotifier(neo4jDriver, txEvent.from.toLowerCase());

      if (isNotifier) {
        let newFinding: Finding;
        // All Notifiers transactions are saved in the DB
        const storeRes = await storeTransactionData(
          neo4jDriver,
          txEvent.from,
          txEvent.to,
          txEvent.hash,
          recipientAddressType,
          decodedData.text,
          isNotifier
        )
        logs(txEvent, storeRes, `[Notifier] Saved transaction data ${txEvent.hash} msg: ${decodedData.text}`);

        // If the recipient is an EOA, create the alert SCAM-NOTIFIER-EOA
        if (recipientAddressType === "EOA") {
          newFinding = await createScamNotifierAlert("EOA", txEvent)
        }
        // If the recipient is a contract, create the alert SCAM-NOTIFIER-CONTRACT
        else {
          newFinding = await createScamNotifierAlert("CONTRACT", txEvent)
        }

        logs(txEvent, true, `ScamNotifierAlert Triggered ${txEvent.from} ` + txEvent.hash);
        newFinding.metadata.message = decodedData.text;
        findings.push(newFinding)
      } else {
        // Check that the recipient address is already in the DB
        const recipientExistsInDB = await recipientExists(neo4jDriver, txEvent.to);

        // If the recipient exists in the DB, save the transaction data
        // The sender is set to Regular User.
        // No unrelated data exists in the DB.
        if (recipientExistsInDB) {
          const storeRes = await storeTransactionData(
            neo4jDriver,
            txEvent.from,
            txEvent.to,
            txEvent.hash,
            recipientAddressType,
            decodedData.text,
            isNotifier
          )
          logs(txEvent, storeRes, `[Regular] Saved transaction data ${txEvent.hash} msg: ${decodedData.text}`);

          let recipientNums = await numberOfRecipients(neo4jDriver, txEvent.from);

          // Change sender type to notifier if the sender has sent more than 2 transactions
          if (recipientNums.length >= 2) {
            await setAddressTypeToNotifier(neo4jDriver, txEvent.from);
            const data = {
              sharingAddress: recipientNums[0],
              sharedRecipients: recipientNums
            }
            const newFinding = await createScamNotifierAlert("NEW_NOTIFIER", txEvent, data);
            newFinding.metadata.message = decodedData.text;
            findings.push(newFinding)
          }
        }
      }

      // Check if sender has shared reports with notifiers, if so, change sender type to notifier
      //const shared = await sharedReportsCount(neo4jDriver, txEvent.from);
      //if (shared >= 2 && txEvent.to) {
      //  const changeRes = await setAddressTypeToNotifier(neo4jDriver, txEvent.from);
      //  logs(txEvent, changeRes, `New Nofifier Added ${txEvent.from}` + txEvent.hash);
      //  const similarNotifiers = await findMostCommonRecipient(neo4jDriver, txEvent.from);
      //  const newFinding = await createScamNotifierAlert("NEW_NOTIFIER", txEvent, similarNotifiers);
      //  findings.push(newFinding)
      //}
    }
  } catch (error) {
    logs(txEvent, false, "Error in handleTransaction \n" + error);
  }

  return findings;
};

const initialize: Initialize = async () => {
  neo4jDriver = createDriver(DB_URL, DB_USER, DB_PASSWORD);
}

export default {
  initialize,
  handleTransaction
};
