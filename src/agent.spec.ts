import {
  FindingType,
  FindingSeverity,
  Finding,
  HandleTransaction,
  createTransactionEvent,
  ethers,
  Transaction,
} from "forta-agent";
import agent from "./agent";

import { utils } from 'ethers';

import {
  createDriver, storeTransactionData,
  notifierCount, checkNotifier,
  deleteAllData, sharedReportsCount,
  setAddressTypeToNotifier,
  recipientExists,
  numberOfRecipients
} from "./db";
import { Driver, Result, auth, driver as createDriverInstance } from "neo4j-driver";

// jest.mock("./db", () => ({
//   storeTransactionData: jest.fn(),
//   createDriver: jest.fn().mockReturnValue({
//     session: jest.fn().mockReturnValue({
//       run: jest.fn(),
//       close: jest.fn(),
//     }),
//   }),
// }));


function getRandomTxHash() {
  const randomBytes = ethers.utils.randomBytes(32);
  const randomTxHash = ethers.utils.hexlify(randomBytes);
  return randomTxHash;
}

function getRandomAddress() {
  const bytes = utils.randomBytes(20);
  const randomAddress = utils.hexlify(utils.arrayify(bytes));
  return randomAddress;
}

function utf8ToHex(utf8String: string) {
  const utf8Bytes = ethers.utils.toUtf8Bytes(utf8String);
  const hexString = ethers.utils.hexlify(utf8Bytes);
  return hexString;
}

function createTx(from: string, to: string, data: string) {
  const mockTransaction: Transaction = {
    hash: getRandomTxHash(),
    from: from,
    to: to,
    data: data,
    value: "0",
    gasPrice: "0",
    nonce: 0,
    gas: "0",
    r: "0",
    v: "0",
    s: "0",
  };

  const mockTxEvent = createTransactionEvent({
    transaction: mockTransaction,
  } as any);

  return mockTxEvent;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TEST_DB_URL = 'neo4j+s://bd21e303.databases.neo4j.io';
const TEST_DB_USER = 'neo4j';
const TEST_DB_PASSWORD = 'PtWAoUygSYLWPDEhjkbjL52FU2k64ZwmsFmdI4Vzuys';


describe("SCAM-NOTIFIER-BOT db logic", () => {
  let handleTransaction: HandleTransaction;
  let neo4jDriver: Driver;

  beforeAll(async () => {
    handleTransaction = agent.handleTransaction;
    neo4jDriver = createDriver(TEST_DB_URL, TEST_DB_USER, TEST_DB_PASSWORD);
    const dataDeleted = await deleteAllData(neo4jDriver);
    expect(dataDeleted).toBe(true);
  });

  describe("Core DB Logic Test", () => {
    jest.setTimeout(10000);
    afterEach(async () => {
      // Wait for a short duration after each test to ensure all async operations have completed
      await sleep(4500);
    });

    it("Adds Notifiers/Regular transactions, checks for number of notifiers and status of senders ", async () => {
      const bob = getRandomAddress();
      const alice = getRandomAddress();
      const hash = getRandomTxHash();

      // stores a new transaction
      const storeResult = await storeTransactionData(
        neo4jDriver,
        bob,
        alice,
        hash,
        "EOA",
        "Honeypot creator",
        true
      );

      const storeResultDup = await storeTransactionData(
        neo4jDriver,
        bob,
        alice,
        hash,
        "EOA",
        "Honeypot creator",
        true
      );

      const nCount = await notifierCount(neo4jDriver)
      expect(nCount).toBe(1);
      expect(storeResult).toBe(true);
      expect(storeResultDup).toBe(false);

      const storeResultTwo = await storeTransactionData(
        neo4jDriver,
        getRandomAddress(),
        alice,
        getRandomTxHash(),
        "EOA",
        "Honeypot creator"
      );

      const nCountTwo = await notifierCount(neo4jDriver)
      expect(nCountTwo).toBe(2);
      const regularAddress = await checkNotifier(neo4jDriver, alice)
      expect(regularAddress).toBe(false);
    });

    it("Creates a new notifier if the address shares a subset of an already existing notifier", async () => {
      const toAddresses = Array.from({ length: 10 }, () => getRandomAddress());
      const messages = Array.from({ length: 10 }, () => `Message ${Math.random()}`);

      const originalNotifier = getRandomAddress();
      const newNotifier = getRandomAddress();

      // Create 10 transactions from the same address, each to a different address
      for (let i = 0; i < 10; i++) {
        const hash = getRandomTxHash();
        await storeTransactionData(
          neo4jDriver,
          originalNotifier,
          toAddresses[i],
          hash,
          "EOA",
          messages[i]
        );
      }

      // Create 2 transactions from a new address to two of the first 10 'to' addresses
      const hash1 = getRandomTxHash();
      const hash2 = getRandomTxHash();
      const message1 = `Message ${Math.random()}`;
      const message2 = `Message ${Math.random()}`;

      await storeTransactionData(
        neo4jDriver,
        newNotifier,
        toAddresses[0],
        hash1,
        "EOA",
        message1
      );

      await storeTransactionData(
        neo4jDriver,
        newNotifier,
        toAddresses[1],
        hash2,
        "EOA",
        message2
      );

      const sharedReports = await numberOfRecipients(neo4jDriver, newNotifier)
      console.log("shared reports", sharedReports)
      expect(sharedReports.length).toBe(1);
      await setAddressTypeToNotifier(neo4jDriver, newNotifier);
      const nowNotifier = await checkNotifier(neo4jDriver, newNotifier)
      expect(nowNotifier).toBe(true);

    });

    it("Tests shared recipient msg", async () => {
      await storeTransactionData(
        neo4jDriver,
        'one',
        'scam 1',
        '0xefe60d9c4226f7d5c358f7cc863f0230c03418b9b50c61b540095f4ae4567785',
        "EOA",
        "Rugcode line 887. ",
        true
      );

      let recipientAlreadyExists = await recipientExists(neo4jDriver, 'scam 1');
      let recipientNums = await numberOfRecipients(neo4jDriver, 'one');
      expect(recipientNums).toStrictEqual([]);
      expect(recipientAlreadyExists).toBe(true);
      await storeTransactionData(
        neo4jDriver,
        'two',
        'scam 1',
        '0xefe60d9c4226f7d5c358f7cc863f0230c03418b9b50c61b540095f4ae45676565',
        "EOA",
        "Rugcode line 887. "
      );

      recipientNums = await numberOfRecipients(neo4jDriver, 'one');
      expect(recipientNums.length).toBe(1);
    });



    // it("Code db interact", async () => {

    //   // scam-warning.eth
    //   await storeTransactionData(
    //     neo4jDriver,
    //     '0xcd5496ef9d7fb6657c9f1a4a1753f645994fbfa9',
    //     '0x1bc5b686c41ab965954f7aeca2dd01d74796ce0d',
    //     '0xefe60d9c4226f7d5c358f7cc863f0230c03418b9b50c61b540095f4ae4567785',
    //     "EOA",
    //     "Alert",
    //     true
    //   );

    //   // 🛑scam-warning🛑.eth
    //   await storeTransactionData(
    //     neo4jDriver,
    //     '0xba6e11347856c79797af6b2eac93a8145746b4f9',
    //     '0x207a7f9977ab793637028b5cf6389da9e28f15d5',
    //     '0x83e0e3876745c31d27f1f0a8542fbc3eb704c286e40172ee4296505a14058042',
    //     "EOA",
    //     `Alert`,
    //     true
    //   );

    //   // 🔴dev-will-dump-on-you🔴.eth
    //   await storeTransactionData(
    //     neo4jDriver,
    //     '0xc574962311141cb505c09fd973c4630b8f7c4a81',
    //     '0x2018ac66555591cb0c278ae0919215721eb3bf48',
    //     '0xfba60ae0a2b08a5ef8fcbac5c2c06a79c437e9d878d425a6b617d1931c369110',
    //     "EOA",
    //     "Alert",
    //     true
    //   );

    //   // metasleuth911.eth
    //   await storeTransactionData(
    //     neo4jDriver,
    //     '0x666a3ce3f9438dccd4a885ba5b565f3035984793',
    //     '0x87e4158f3410f10cee9329ba2d8b79865d9780de',
    //     '0x2963aca299858d01b1370ec85c95450e772fdeb9526e6a2417569c4070422405',
    //     "EOA",
    //     "Alert",
    //     true
    //   );
    // });

  });

  // Close the driver after all tests have been completed
  afterAll(() => {
    neo4jDriver.close();
  });
});